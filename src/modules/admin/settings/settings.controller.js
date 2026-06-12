import { AdminSettingsService } from "./settings.service.js";

const adminService = new AdminSettingsService();
// Generic async handler wrapper
const wrap = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

export const updateSettings = async (req, res, next) => {
  try {
    const result = await adminService.updateSettings(req.body);

    return res.status(result.statusCode).json(result.data);
  } catch (error) {
    next(error);
  }
};
export const getGeneralSettings = async (req, res, next) => {
  try {
    const result = await adminService.getGeneralSettings();

    return res.status(result.statusCode).json(result.data);
  } catch (error) {
    next(error);
  }
};
export const getAllAdmins = async (req, res, next) => {
  try {
    const result = await adminService.getAllAdmins();

    return res.status(result.statusCode).json(result.data);
  } catch (error) {
    next(error);
  }
};
export const deleteAdmin = async (req, res, next) => {
  try {
    const result = await adminService.deleteAdmin(
      req.params.id,
      req.user?.userId,
    );

    return res.status(result.statusCode).json(result.data);
  } catch (error) {
    next(error);
  }
};
export const inviteAdmin = async (req, res, next) => {
  try {
    const result = await adminService.inviteAdmin(req.body.email);

    return res.status(result.statusCode).json(result.data);
  } catch (error) {
    next(error);
  }
};
