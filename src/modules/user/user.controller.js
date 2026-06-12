import userService from "./user.service.js";
import {
  change_password,
  forgot_password_otp_send,
  login,
  register_step_1_email,
  register_step_3,
  reset_password,
  update_user_details,
  verify_otp,
} from "../validations/joi.validations.js";
// Generic async handler wrapper
const wrap = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

export const registerUserStep1 = async (req, res, next) => {
  try {
    const { value, error } = register_step_1_email.validate(req.body);

    if (error) {
      return res.status(400).json({ message: error.details[0].message });
    }
    const { email } = value;

    const result = await userService.registerUserStep1(email);

    return res.status(result.statusCode).json({
      message: result.message,
      ...(result.shouldResendOtp !== undefined && {
        shouldResendOtp: result.shouldResendOtp,
      }),
    });
  } catch (error) {
    next(error);
  }
};

// user.controller.js
export const verifyOTP = async (req, res, next) => {
  try {
    const { value, error } = verify_otp.validate(req.body);

    if (error) {
      return res.status(400).json({ message: error.details[0].message });
    }

    const { email, otp } = value;

    const result = await userService.verifyOTP(otp, email);

    return res.status(result.statusCode).json(result.data);
  } catch (error) {
    next(error);
  }
};
export const registerUserStep3 = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];

    const { value, error } = register_step_3.validate(req.body);

    if (error) {
      return res.status(400).json({ message: error.details[0].message });
    }

    const { name, password } = value;

    const result = await userService.registerUserStep3({
      token,
      name,
      password,
    });

    return res.status(result.statusCode).json(result.data);
  } catch (error) {
    next(error);
  }
};
export const loginUser = async (req, res, next) => {
  try {
    const { value, error } = login.validate(req.body);

    if (error) {
      return res.status(400).json({ message: error.details[0].message });
    }
    const { email, password } = value;
    const result = await userService.loginUser(email, password);
    return res.status(result.statusCode).json(result.data);
  } catch (error) {
    next(error);
  }
};
export const forgotPasswordOTPsend = async (req, res, next) => {
  try {

    const { value, error } = forgot_password_otp_send.validate(req.body);

    if (error) {
      return res.status(400).json({ message: error.details[0].message });
    }

    const { email } = value;

    const result = await userService.forgotPasswordOTPsend(email);

    return res.status(result.statusCode).json(result.data);
  } catch (error) {
    next(error);
  }
};
export const verifyForgotPasswordOTP = async (req, res, next) => {
  try {
    const { value, error } = verify_forgot_password_otp.validate(req.body);

    if (error) {
      return res.status(400).json({ message: error.details[0].message });
    }

    const { email, otp } = value;

    const result = await userService.verifyForgotPasswordOTP(otp, email);

    return res.status(result.statusCode).json(result.data);
  } catch (error) {
    next(error);
  }
};
export const resetPassword = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];

    const { value, error } = reset_password.validate(req.body);

    if (error) {
      return res.status(400).json({ message: error.details[0].message });
    }

    const { newPassword } = value;

    const result = await userService.resetPassword({
      token,
      newPassword,
    });

    return res.status(result.statusCode).json(result.data);
  } catch (error) {
    next(error);
  }
};
export const updateImage = async (req, res, next) => {
  try {
    const result = await userService.updateImage({
      userId: req.user?.userId,
      file: req.file,
    });

    return res.status(result.statusCode).json(result.data);
  } catch (error) {
    next(error);
  }
};
export const updateUserDetails = async (req, res, next) => {
  try {
    const { value, error } = update_user_details.validate(req.body);

    if (error) {
      return res.status(400).json({ message: error.details[0].message });
    }

    const result = await userService.updateUserDetails({
      userId: req.user?.userId,
      body: value,
    });

    return res.status(result.statusCode).json(result.data);
  } catch (error) {
    next(error);
  }
};
export const changePassword = async (req, res, next) => {
  try {
    const { value, error } = change_password.validate(req.body);

    if (error) {
      return res.status(400).json({ message: error.details[0].message });
    }

    const result = await userService.changePassword({
      userId: req.user?.userId,
      body: value,
    });

    return res.status(result.statusCode).json(result.data);
  } catch (error) {
    next(error);
  }
};
export const sendMailToAdmin = async (req, res, next) => {
  try {
    const result = await userService.sendMailToAdmin({
      user: req.user,
      body: req.body,
    });

    return res.status(result.statusCode).json(result.data);
  } catch (error) {
    next(error);
  }
};
export const getMe = async (req, res, next) => {
  try {
    const result = await userService.getMe(req.user?.userId);

    return res.status(result.statusCode).json(result.data);
  } catch (error) {
    next(error);
  }
};
