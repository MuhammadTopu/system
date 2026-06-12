import { UserManagementService } from "./user-management.service.js";

const adminService = new UserManagementService();
// Generic async handler wrapper
const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export const getAllUsers = async (req, res, next) => {
  try {
    const result = await adminService.getAllUsers(req.query);

    return res.status(200).json({
      success: true,
      users: result.users,
      pagination: result.pagination,
    });

  } catch (error) {
    console.error(error);
    next(error);
  }
};
export const printListPdf = async (
  req,
  res,
  next
) => {
  try {
    const result =
      await adminService.printListPdf();

    if (result.statusCode !== 200) {
      return res
        .status(result.statusCode)
        .json(result.data);
    }

    res.setHeader(
      "Content-Type",
      "application/pdf"
    );

    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${result.fileName}"`
    );

    return res.send(result.pdfBuffer);

  } catch (error) {
    next(error);
  }
};
export const suspendUser = async (
  req,
  res,
  next
) => {
  try {
    const result =
      await adminService.suspendUser(
        req.params.id
      );

    return res
      .status(result.statusCode)
      .json(result.data);

  } catch (error) {
    next(error);
  }
};
export const activateUser = async (
  req,
  res,
  next
) => {
  try {
    const result =
      await adminService.activateUser(
        req.params.id
      );

    return res
      .status(result.statusCode)
      .json(result.data);

  } catch (error) {
    next(error);
  }
};