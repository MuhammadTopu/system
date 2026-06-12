
import {FeedbackService} from './feedback.service.js';

const adminService = new FeedbackService();

// Generic async handler wrapper
const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

//feedback and support
export const getAllMails = async (req, res, next) => {
  try {
    const result = await adminService.getAllMailsService();

    return res.status(result.statusCode).json(result.data);
  } catch (error) {
    next(error);
  }
};
export const changeMailStatus = async (req, res, next) => {
  try {
    const result = await adminService.changeMailStatus(
      req.params.id
    );

    return res
      .status(result.statusCode)
      .json(result.data);
  } catch (error) {
    next(error);
  }
};
