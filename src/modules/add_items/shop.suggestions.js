import { openAiPost, parseJsonResponse } from "../../common/helper/openai.helper.js";

// Shop suggestions come from the AI, based on the user's city / ZIP. The AI has no
// live map data, so these are SUGGESTIONS, not verified listings: they carry no
// rating, review count, phone number or address (those would be invented), and
// each one has a Google Maps search link (built here, not by the AI) so the user
// can check the shop and its details.

const MAX_SHOPS = 3;
const MAX_CATEGORIES = 8; // distinct task categories per generate-tasks call
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

const cache = new Map(); // "itemCategory|category|location" -> { at, shops }

const mapsSearchUrl = (query) =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;

const buildPrompt = (categories, itemCategory, locationText) => `
You are Maintenance Genie. Suggest businesses where a person can get these ${
  itemCategory === "Vehicle" ? "vehicle" : itemCategory === "Home" ? "home" : "maintenance"
} services near: ${locationText}

Service categories:
${categories.map((c) => `- ${c}`).join("\n")}

RULES:
- For each category, suggest up to ${MAX_SHOPS} businesses you are reasonably confident operate in
  or serve that area. Well-known regional or national companies are fine.
- If you are not confident about specific businesses for a category, return fewer, or an empty
  array. NEVER invent a business name.
- Do not give ratings, phone numbers, addresses or links. Only the business name and a short
  description (under 15 words) of what they do.
- Return ONLY valid JSON. No markdown. No text outside the JSON.

RETURN THIS EXACT JSON FORMAT:
{
  "suggestions": {
    "<category exactly as written above>": [
      { "name": "Business Name", "description": "What they do" }
    ]
  }
}
`.trim();

// Shops for the distinct task categories of one item: Map(category -> shops).
// A category the AI has nothing for is left out. Never throws: if the AI call
// fails, the tasks are simply created without shops.
export const findShopsForTasks = async (tasks, itemCategory, location) => {
  const result = new Map();
  if (!location?.text) return result;

  const categories = [
    ...new Set(tasks.map((t) => t.category).filter(Boolean)),
  ].slice(0, MAX_CATEGORIES);

  // reuse what was already suggested for this place in the last 24 hours
  const missing = [];
  for (const category of categories) {
    const hit = cache.get(`${itemCategory}|${category}|${location.text}`);
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
      if (hit.shops.length) result.set(category, hit.shops);
    } else {
      missing.push(category);
    }
  }
  if (missing.length === 0) return result;

  try {
    const response = await openAiPost("https://api.openai.com/v1/chat/completions", {
      model: process.env.CHAT_GPT_MODEL_NAME || "gpt-4o",
      messages: [
        { role: "user", content: buildPrompt(missing, itemCategory, location.text) },
      ],
      temperature: 0.3,
      response_format: { type: "json_object" },
    });

    const parsed = parseJsonResponse(response.data.choices[0].message.content);
    const suggestions = parsed?.suggestions || {};

    for (const category of missing) {
      const list = Array.isArray(suggestions[category]) ? suggestions[category] : [];
      const shops = list
        .map((s) => ({
          name: String(s?.name || "").trim(),
          description: String(s?.description || "").trim() || null,
        }))
        .filter((s) => s.name)
        .slice(0, MAX_SHOPS)
        .map((s) => ({
          ...s,
          google_map_url: mapsSearchUrl(`${s.name} ${location.text}`),
          ai_suggested: true,
        }));

      cache.set(`${itemCategory}|${category}|${location.text}`, { at: Date.now(), shops });
      if (shops.length) result.set(category, shops);
    }
  } catch (err) {
    console.error("Shop suggestions failed:", err.response?.data || err.message);
  }

  return result;
};

// Where to look, as text: the app's `location`, else the item's ZIP code (Home),
// else the user's saved city / state / ZIP / country. Returns null when unknown.
export const resolveShopLocation = ({ body = {}, item, user }) => {
  const text =
    String(body.location || "").trim() ||
    String(item?.zip_code || "").trim() ||
    [user?.city, user?.state, user?.postal_code, user?.country]
      .map((v) => String(v || "").trim())
      .filter(Boolean)
      .join(", ");

  return text ? { text: text.slice(0, 120) } : null;
};
