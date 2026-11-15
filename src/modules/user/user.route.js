import express from 'express';
import {
  registerUserStep1,
  verifyOTP,
  registerUserStep3,
  loginUser,
  socialLogin,
  refreshToken,
  forgotPasswordOTPsend,
  resetPassword,
  verifyForgotPasswordOTP,
  updateImage,
  updateUserDetails,
  changePassword,
  sendMailToAdmin,
  getMe,
  deleteAccount
} from './user.controller.js';
import { upload } from '../../config/Multer.config.js';
import { verifyUser } from '../../common/middlewares/verifyUsers.js';
import { limitBy } from '../../common/middlewares/rateLimit.js';

// per email, per 15 minutes: stops OTP / password guessing and email bombing
const loginLimit = limitBy({ name: 'login', max: 10 });
const sendOtpLimit = limitBy({ name: 'send-otp', max: 5 });
const verifyOtpLimit = limitBy({ name: 'verify-otp', max: 5 });
const verifyResetOtpLimit = limitBy({ name: 'verify-reset-otp', max: 5 });


const router = express.Router();
// Test route
router.get('/test', (req, res) => {
  res.send('User route connected');
});

// File upload route
router.post('/upload', verifyUser("USER"), upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).send('No file uploaded');
  }
  res.status(200).send({ message: 'File uploaded successfully', file: req.file });
});
//Register a user
router.post('/register-step1', sendOtpLimit, registerUserStep1);
router.post('/verify-otp', verifyOtpLimit, verifyOTP);
router.post('/register-step3', registerUserStep3);
//log iin a user
router.post('/login', loginLimit, loginUser);
//Login with Google / Apple (Firebase ID token)
router.post('/social-login', socialLogin);
//Get a new access token with a refresh token
router.post('/refresh-token', refreshToken);
//forget pass
router.post('/forget_pass', sendOtpLimit, forgotPasswordOTPsend);
router.post('/checkForgetPassOtp', verifyResetOtpLimit, verifyForgotPasswordOTP);
router.post('/resetPass', resetPassword);
router.post('/change-password', verifyUser("USER"), changePassword);
//update user img
router.put('/update-image', verifyUser("USER"), upload.single('profilePicture'), updateImage);
router.put('/update-user-details', verifyUser("USER"), updateUserDetails);
//support
router.post('/sende-mail', verifyUser("USER"), sendMailToAdmin)
//get me
router.get('/get-me', verifyUser("USER"), getMe);
//delete my account (soft delete)
router.post('/delete-account', verifyUser("USER"), deleteAccount);
export default router;
