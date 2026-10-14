import { GoogleAuth } from "google-auth-library";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const BASE_URL = "https://androidpublisher.googleapis.com/androidpublisher/v3";

// Base plans of the maintenance_genie_premium subscription. Anything else is
// rejected instead of being silently ignored.
export const ALLOWED_BASE_PLAN_IDS = ["mg-monthly", "mg-annual"];

export class GooglePlayError extends Error {
  constructor(message, statusCode = 500) {
    super(message);
    this.statusCode = statusCode;
  }
}

const getConfig = () => {
  const packageName = process.env.GOOGLE_PLAY_PACKAGE_NAME;
  const productId =
    process.env.GOOGLE_PLAY_PRODUCT_ID || "maintenance_genie_premium";

  if (!packageName) {
    throw new GooglePlayError("GOOGLE_PLAY_PACKAGE_NAME is not set");
  }
  return { packageName, productId };
};

let auth = null;

const getAccessToken = async () => {
  if (!auth) {
    if (!process.env.GOOGLE_PLAY_SERVICE_ACCOUNT) {
      throw new GooglePlayError("GOOGLE_PLAY_SERVICE_ACCOUNT is not set");
    }

    let credentials;
    try {
      credentials = JSON.parse(process.env.GOOGLE_PLAY_SERVICE_ACCOUNT);
    } catch {
      throw new GooglePlayError(
        "GOOGLE_PLAY_SERVICE_ACCOUNT is not valid JSON",
      );
    }

    auth = new GoogleAuth({
      credentials,
      scopes: ["https://www.googleapis.com/auth/androidpublisher"],
    });
  }

  const client = await auth.getClient();
  const { token } = await client.getAccessToken();
  return token;
};

const callGoogle = async (method, url, token, body) => {
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    // keep the raw text for the log below
  }

  if (!res.ok) {
    console.error(
      `Google Play ${method} ${url} failed with ${res.status}: ${text}`,
    );
    throw new GooglePlayError(
      json?.error?.message || `Google Play API request failed (${res.status})`,
      502,
    );
  }

  return json;
};

// Returns the validated, normalised updates or throws a 400.
export const validatePriceUpdates = (priceUpdates) => {
  if (!Array.isArray(priceUpdates) || priceUpdates.length === 0) {
    throw new GooglePlayError("priceUpdates must be a non-empty array", 400);
  }

  const seen = new Set();

  return priceUpdates.map(({ basePlanId, price } = {}) => {
    if (!ALLOWED_BASE_PLAN_IDS.includes(basePlanId)) {
      throw new GooglePlayError(
        `Unknown basePlanId "${basePlanId}". Allowed: ${ALLOWED_BASE_PLAN_IDS.join(", ")}`,
        400,
      );
    }
    if (seen.has(basePlanId)) {
      throw new GooglePlayError(`Duplicate basePlanId "${basePlanId}"`, 400);
    }
    seen.add(basePlanId);

    const currencyCode = String(price?.currencyCode ?? "").toUpperCase();
    const units = String(price?.units ?? "");
    const nanos = price?.nanos === undefined ? 0 : Number(price.nanos);

    if (!/^[A-Z]{3}$/.test(currencyCode)) {
      throw new GooglePlayError(
        `${basePlanId}: price.currencyCode must be a 3-letter code`,
        400,
      );
    }
    if (!/^\d+$/.test(units)) {
      throw new GooglePlayError(
        `${basePlanId}: price.units must be a whole number (as a string)`,
        400,
      );
    }
    if (!Number.isInteger(nanos) || nanos < 0 || nanos > 999999999) {
      throw new GooglePlayError(
        `${basePlanId}: price.nanos must be an integer between 0 and 999999999`,
        400,
      );
    }
    if (Number(units) === 0 && nanos === 0) {
      throw new GooglePlayError(`${basePlanId}: price must be above 0`, 400);
    }

    return { basePlanId, price: { currencyCode, units, nanos } };
  });
};

// Google converts one price into a price for every region it sells in.
const convertPrice = async (token, packageName, price) => {
  const converted = await callGoogle(
    "POST",
    `${BASE_URL}/applications/${packageName}/pricing:convertRegionPrices`,
    token,
    { price },
  );

  const regionalConfigs = Object.entries(converted.convertedRegionPrices).map(
    ([regionCode, data]) => ({
      regionCode,
      newSubscriberAvailability: true,
      price: data.price,
    }),
  );

  return {
    regionalConfigs,
    regionsVersion: converted.regionVersion.version,
    otherRegionsConfig: {
      usdPrice: converted.convertedOtherRegionsPrice.usdPrice,
      eurPrice: converted.convertedOtherRegionsPrice.eurPrice,
      newSubscriberAvailability: true,
    },
  };
};

const toNumber = ({ units, nanos }) => Number(units) + nanos / 1e9;

// Updates the price for new subscribers of the given base plans. Existing
// subscribers keep their current price (Google needs a separate price
// migration for them), and iOS prices live in App Store Connect.
export const updateBasePlanPrices = async (priceUpdates) => {
  const updates = validatePriceUpdates(priceUpdates);
  const { packageName, productId } = getConfig();
  const token = await getAccessToken();

  const subscriptionUrl = `${BASE_URL}/applications/${packageName}/subscriptions/${productId}`;
  const current = await callGoogle("GET", subscriptionUrl, token);

  for (const { basePlanId } of updates) {
    if (!current.basePlans.some((bp) => bp.basePlanId === basePlanId)) {
      throw new GooglePlayError(
        `Base plan "${basePlanId}" does not exist on ${productId} in Google Play`,
        404,
      );
    }
  }

  const convertedByBasePlan = {};
  let regionsVersion;

  for (const { basePlanId, price } of updates) {
    const result = await convertPrice(token, packageName, price);
    convertedByBasePlan[basePlanId] = result;
    regionsVersion = result.regionsVersion;
  }

  // Rebuild every base plan without the output-only fields Google rejects
  // ("state", "legacyCompatible", ...). Plans that are not being updated keep
  // their current prices.
  const updatedBasePlans = current.basePlans.map((bp) => {
    // Auto-renewing and prepaid are mutually exclusive in the API.
    const pricingModel = bp.autoRenewingBasePlanType
      ? {
          autoRenewingBasePlanType: {
            billingPeriodDuration:
              bp.autoRenewingBasePlanType.billingPeriodDuration,
            gracePeriodDuration:
              bp.autoRenewingBasePlanType.gracePeriodDuration,
            resubscribeState: bp.autoRenewingBasePlanType.resubscribeState,
            prorationMode: bp.autoRenewingBasePlanType.prorationMode,
          },
        }
      : { prepaidBasePlanType: bp.prepaidBasePlanType };

    const cleanBasePlan = {
      basePlanId: bp.basePlanId,
      ...pricingModel,
      ...(bp.offerTags ? { offerTags: bp.offerTags } : {}),
      regionalConfigs: bp.regionalConfigs,
      ...(bp.otherRegionsConfig
        ? { otherRegionsConfig: bp.otherRegionsConfig }
        : {}),
    };

    const update = convertedByBasePlan[bp.basePlanId];
    if (!update) return cleanBasePlan;

    return {
      ...cleanBasePlan,
      regionalConfigs: update.regionalConfigs,
      otherRegionsConfig: update.otherRegionsConfig,
    };
  });

  const result = await callGoogle(
    "PATCH",
    `${subscriptionUrl}?updateMask=basePlans&regionsVersion.version=${regionsVersion}`,
    token,
    { packageName, productId, basePlans: updatedBasePlans },
  );

  const summary = [];

  for (const { basePlanId, price } of updates) {
    const bp = result.basePlans.find((b) => b.basePlanId === basePlanId);
    const usPrice = bp?.regionalConfigs.find((rc) => rc.regionCode === "US");

    // Keep services.price (shown in the admin panel) in line with Google, but
    // only when the price was given in USD.
    let servicePriceUpdated = false;
    if (price.currencyCode === "USD") {
      try {
        const { count } = await prisma.services.updateMany({
          where: { rc_product_id: `${productId}:${basePlanId}` },
          data: { price: Number(toNumber(price).toFixed(2)) },
        });
        servicePriceUpdated = count > 0;
      } catch (error) {
        console.error(
          `Failed to update services.price for ${basePlanId}:`,
          error,
        );
      }
    }

    summary.push({
      basePlanId,
      usPrice: usPrice?.price ?? null,
      servicePriceUpdated,
    });
  }

  return summary;
};
