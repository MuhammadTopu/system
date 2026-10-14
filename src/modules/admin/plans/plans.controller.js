import { PlansService } from "./plans.service.js";
import {
  updateBasePlanPrices,
  GooglePlayError,
} from "./google-play-pricing.service.js";

const adminService = new PlansService();

// Generic async handler wrapper
const wrap = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

export const createService = async (req, res, next) => {
  try {
    const result = await adminService.createService(req.body);

    return res.status(result.statusCode).json(result.data);
  } catch (error) {
    next(error);
  }
};
export const getAllServices = async (req, res, next) => {
  try {
    const result = await adminService.getAllServices();

    return res.status(result.statusCode).json(result.data);
  } catch (error) {
    next(error);
  }
};

// Updates the Google Play price of the given base plans (new subscribers only).
export const updateGooglePlayPrice = async (req, res, next) => {
  try {
    const data = await updateBasePlanPrices(req.body?.priceUpdates);

    return res.status(200).json({
      success: true,
      message: "Google Play prices updated successfully",
      data,
    });
  } catch (error) {
    if (error instanceof GooglePlayError) {
      return res
        .status(error.statusCode)
        .json({ success: false, message: error.message });
    }
    next(error);
  }
};
