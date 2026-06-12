import { PlansService } from "./plans.service.js";

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
