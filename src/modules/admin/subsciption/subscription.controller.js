import {SubscriptionService} from './subscription.service.js';


const adminService = new SubscriptionService();

// Generic async handler wrapper
const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);


//subscription management
export const getAllsubscriptions = async (
  req,
  res,
  next
) => {
  try {
    const result =
      await adminService.getAllSubscriptions(
        req.query
      );

    return res
      .status(result.statusCode)
      .json(result.data);

  } catch (error) {
    next(error);
  }
};
export const getSubscriptionPdf = async (
  req,
  res,
  next
) => {
  try {
    const result =
      await adminService.getSubscriptionPdf();

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