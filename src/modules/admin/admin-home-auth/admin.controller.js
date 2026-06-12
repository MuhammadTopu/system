
import adminService from './admin.service.js';

// Generic async handler wrapper
const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export const loginAdmin = async (req, res, next) => {
  try {
    const result = await adminService.loginAdmin(req.body);

    return res
      .status(result.statusCode)
      .json(result.data);

  } catch (error) {
    next(error);
  }
};
export const getTotalUsers = async (req, res, next) => {
  try {
    const result =
      await adminService.getTotalUsers();

    return res
      .status(result.statusCode)
      .json(result.data);

  } catch (error) {
    next(error);
  }

};
  export const getSubscriptionStats = async (
  req,
  res,
  next
) => {
  try {
    const result =
      await adminService.getSubscriptionStats(
        req.user?.userId
      );

    return res
      .status(result.statusCode)
      .json(result.data);

  } catch (error) {
    next(error);
  }
};
export const monthlyRevenue = async (req, res, next) => {
  try {
    const result =
      await adminService.monthlyRevenue();

    return res
      .status(result.statusCode)
      .json(result.data);

  } catch (error) {
    next(error);
  }
};
export const thisMonthRevenue = async (
  req,
  res,
  next
) => {
  try {
    const result =
      await adminService.thisMonthRevenue();

    return res
      .status(result.statusCode)
      .json(result.data);

  } catch (error) {
    next(error);
  }
};
export const activeSubscription = async (
  req,
  res,
  next
) => {
  try {
    const result =
      await adminService.activeSubscription(
        req.user?.userId
      );

    return res
      .status(result.statusCode)
      .json(result.data);

  } catch (error) {
    next(error);
  }
};

export const getMe = async (req, res, next) => {
  try {
    const result = await adminService.getMe(
      req.user?.userId
    );

    return res
      .status(result.statusCode)
      .json(result.data);
  } catch (error) {
    next(error);
  }
};
export const changeAdminPassword = async (req, res, next) => {
  try {
    const {oldPassword, newPassword} = req.body;

    if (!oldPassword || !newPassword) {
      return res.status(400).json({ message: "Old password and new password are required" });
    }
    
    const result =
      await adminService.changeAdminPassword(
        oldPassword,
        newPassword,
        req.user?.userId
      );

    return res
      .status(result.statusCode)
      .json(result.data);
  } catch (error) {
    next(error);
  }
};
export const updateImage = async (req, res, next) => {
  try {
    const result = await adminService.updateImage(
      req.user?.userId,
      req.file
    );

    return res
      .status(result.statusCode)
      .json(result.data);
  } catch (error) {
    next(error);
  }
};
export const updateAdminDetails = async (req, res, next) => {
  try {
    const result = await adminService.updateAdminDetails(
      req.user?.userId,
      req.body
    );

    return res
      .status(result.statusCode)
      .json(result.data);
  } catch (error) {
    next(error);
  }
};