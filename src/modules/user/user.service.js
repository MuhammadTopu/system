import dotenv from "dotenv";
import validator from "validator";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { PrismaClient } from "@prisma/client";
import {
  generateOTP,
  sendForgotPasswordOTP,
  sendRegistrationOTPEmail,
  receiveEmails,
} from "../../utils/mailService.js";
import path from "path";
import { fileURLToPath } from "url";
import pkg from "jsonwebtoken";
import UserRepository from "../../common/repository/user.repository.js";
import FileService from "../../common/services/file.service.js";

const prisma = new PrismaClient();
const { sign, verify } = pkg;
dotenv.config();
const { isEmail } = validator;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class UserService {
  constructor() {
    this.userRepository = new UserRepository();
    this.fileService = new FileService();
  }
  // Hash user password
  async hashPassword(password) {
    const salt = await bcrypt.genSalt(8);
    return await bcrypt.hash(password, salt);
  }
  // Register a new user
  // user.service.js

  async registerUserStep1(email) {
    console.log("Register step 1 called with email:", email);
    if (!email) {
      return {
        statusCode: 400,
        message: "Email is required",
      };
    }

    const existingUser = await this.userRepository.existingUser(email);

    if (existingUser) {
      return {
        statusCode: 400,
        message: "Email already registered",
      };
    }

    const existingTempUser =
      await this.userRepository.findTempUserByEmail(email);

    if (existingTempUser) {
      if (new Date() > new Date(existingTempUser.expires_at)) {
        await prisma.temp.delete({
          where: { email },
        });

        const otp = generateOTP();

        await prisma.temp.create({
          data: {
            email,
            otp,
            expires_at: new Date(Date.now() + 15 * 60 * 1000),
          },
        });

        await sendRegistrationOTPEmail(email, otp);

        return {
          statusCode: 200,
          message: "OTP expired. A new OTP has been sent to your email.",
        };
      }

      return {
        statusCode: 400,
        message:
          "An OTP has already been sent to this email. Please check your inbox or wait for expiration.",
        shouldResendOtp: false,
      };
    }

    const otp = generateOTP();

    await prisma.temp.create({
      data: {
        email,
        otp,
        expires_at: new Date(Date.now() + 15 * 60 * 1000),
      },
    });

    await sendRegistrationOTPEmail(email, otp);

    return {
      statusCode: 200,
      message:
        "OTP sent successfully to your email. Please verify it to continue.",
    };
  }
  async verifyOTP(otp, email) {
    if (!otp || !email) {
      return {
        statusCode: 400,
        data: {
          message: "OTP and email are required",
        },
      };
    }

    const notVerifiedUser =
      await this.userRepository.findTempUserByEmail(email);

    if (!notVerifiedUser) {
      return {
        statusCode: 400,
        data: {
          message: "Invalid or expired OTP",
        },
      };
    }

    if (new Date() > new Date(notVerifiedUser.expires_at)) {
      return {
        statusCode: 400,
        data: {
          success: false,
          message: "OTP expired. New OTP sent",
          shouldResendOtp: true,
          ucodeId: notVerifiedUser.id,
        },
      };
    }

    if (notVerifiedUser.otp !== otp) {
      return {
        statusCode: 400,
        data: {
          success: false,
          message: "Invalid OTP",
        },
      };
    }

    const verifiedUser = await this.userRepository.createVerifiedUser(
      notVerifiedUser.email,
    );

    await this.userRepository.deleteTempUser(notVerifiedUser.id);

    const token = jwt.sign(
      {
        userId: verifiedUser.id,
        email: verifiedUser.email,
      },
      process.env.JWT_SECRET,
      { expiresIn: "10d" },
    );

    return {
      statusCode: 200,
      data: {
        success: true,
        token,
        message:
          "OTP matched successfully. You can now set your name and password.",
        user: {
          id: verifiedUser.id,
          email: verifiedUser.email,
        },
      },
    };
  }
  async registerUserStep3({ token, name, password }) {
    if (!token) {
      return {
        statusCode: 400,
        data: {
          message: "Authentication token is required",
        },
      };
    }

    let decoded;

    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (error) {
      return {
        statusCode: 401,
        data: {
          message: "Invalid or expired token",
        },
      };
    }

    if (!name || !password) {
      return {
        statusCode: 400,
        data: {
          message: "Name and password are required",
        },
      };
    }

    if (password.length < 8) {
      return {
        statusCode: 400,
        data: {
          message: "Password must be at least 8 characters",
        },
      };
    }

    const existingUser = await this.userRepository.findByEmail(decoded.email);

    if (!existingUser) {
      return {
        statusCode: 400,
        data: {
          message: "Email is not registered",
        },
      };
    }

    const hashedPassword = await this.hashPassword(password);

    const updatedUser = await this.userRepository.completeRegistration({
      email: decoded.email,
      name,
      password: hashedPassword,
    });

    return {
      statusCode: 200,
      data: {
        message: "Registration successful",
        user: {
          id: updatedUser.id,
          name: updatedUser.name,
          email: updatedUser.email,
        },
      },
    };
  }

  //Login
  async loginUser({ email, password }) {
    const missingField = ["email", "password"].find(
      (field) => !{ email, password }[field],
    );

    if (missingField) {
      return {
        statusCode: 400,
        data: {
          message: `${missingField} is required!`,
        },
      };
    }

    const user = await this.userRepository.findLoginUser(email);

    if (!user) {
      return {
        statusCode: 404,
        data: {
          message: "User not found",
        },
      };
    }

    if (user.status === "suspended") {
      return {
        statusCode: 403,
        data: {
          message: "Your account is suspended. Please contact support.",
        },
      };
    }

    if (user.type === "ADMIN") {
      return {
        statusCode: 403,
        data: {
          message: "ADMIN YOU MUST LOG IN FROM ADMIN PANEL",
        },
      };
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      return {
        statusCode: 401,
        data: {
          message: "Invalid password",
        },
      };
    }

    const token = jwt.sign(
      {
        userId: user.id,
        email: user.email,
        role: user.role,
        type: user.type,
      },
      process.env.JWT_SECRET,
      { expiresIn: "100d" },
    );

    return {
      statusCode: 200,
      data: {
        success: true,
        message: "Login successful",
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
        },
        token,
      },
    };
  }

  // Forgot password OTP send
  async forgotPasswordOTPsend(email) {
    if (!email) {
      return {
        statusCode: 400,
        data: {
          message: "Email is required",
        },
      };
    }

    const user = await this.userRepository.findByEmail(email);

    if (!user) {
      return {
        statusCode: 404,
        data: {
          message: "User not found",
        },
      };
    }

    const existingTempUser = await this.userRepository.findTempByEmail(email);

    if (existingTempUser) {
      if (new Date() > new Date(existingTempUser.expires_at)) {
        await this.userRepository.deleteTempByEmail(email);

        const otp = generateOTP();

        await this.userRepository.createTempOTP({
          email,
          otp,
          expires_at: new Date(Date.now() + 15 * 60 * 1000),
        });

        await sendForgotPasswordOTP(email, otp);

        return {
          statusCode: 200,
          data: {
            message: "OTP expired. A new OTP has been sent to your email.",
          },
        };
      }

      return {
        statusCode: 400,
        data: {
          message:
            "An OTP has already been sent to this email. Please check your inbox or wait for expiration.",
          shouldResendOtp: false,
        },
      };
    }

    const otp = generateOTP();

    await this.userRepository.createTempOTP({
      email,
      otp,
      expires_at: new Date(Date.now() + 15 * 60 * 1000),
    });

    await sendForgotPasswordOTP(email, otp);

    return {
      statusCode: 200,
      data: {
        message:
          "OTP sent successfully to your email. Please verify it to continue.",
      },
    };
  }

  // Match forgot password OTP
  async verifyForgotPasswordOTP({ otp, email }) {
    if (!otp || !email) {
      return {
        statusCode: 400,
        data: {
          message: "OTP and email are required",
        },
      };
    }

    const existingTempUser = await this.userRepository.findTempByEmail(email);

    if (!existingTempUser) {
      return {
        statusCode: 400,
        data: {
          message: "Invalid or expired OTP",
        },
      };
    }

    if (new Date() > new Date(existingTempUser.expires_at)) {
      return {
        statusCode: 400,
        data: {
          success: false,
          message: "OTP expired. Please request a new OTP.",
          shouldResendOtp: true,
        },
      };
    }

    if (existingTempUser.otp !== otp) {
      return {
        statusCode: 400,
        data: {
          success: false,
          message: "Invalid OTP",
        },
      };
    }

    // IMPORTANT FIX: use email, not temp.id
    const token = jwt.sign(
      {
        email: existingTempUser.email,
      },
      process.env.JWT_SECRET,
      { expiresIn: "10d" },
    );

    await this.userRepository.deleteTempByEmail(email);

    return {
      statusCode: 200,
      data: {
        success: true,
        message: "OTP matched successfully. You can now reset your password.",
        token,
      },
    };
  }

  // Reset password
  async resetPassword({ token, newPassword }) {
    if (!newPassword || newPassword.length < 8) {
      return {
        statusCode: 400,
        data: {
          message: "Password must be at least 8 characters long",
        },
      };
    }

    if (!token) {
      return {
        statusCode: 400,
        data: {
          message: "Authorization token is required",
        },
      };
    }

    let decoded;

    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (error) {
      return {
        statusCode: 401,
        data: {
          message: "Invalid or expired token",
        },
      };
    }

    const { email } = decoded;

    const user = await this.userRepository.findByEmail(email);

    if (!user) {
      return {
        statusCode: 404,
        data: {
          message: "User not found",
        },
      };
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    const updatedUser = await this.userRepository.updatePassword({
      email,
      password: hashedPassword,
    });

    return {
      statusCode: 200,
      data: {
        success: true,
        message: "Password reset successfully",
        user: {
          id: updatedUser.id,
          email: updatedUser.email,
          name: updatedUser.name,
        },
      },
    };
  }

  // Check if user is authenticated
  async authenticateUser(req, res, next) {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) {
      return res.status(401).json({ message: "No token provided" });
    }

    jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
      if (err) {
        return res.status(403).json({ message: "Invalid token" });
      }
      req.user = decoded; // Add user data to req.user
      next();
    });
  }

  //update user image
  async updateImage({ userId, file }) {
    if (!file) {
      return {
        statusCode: 400,
        data: {
          message: "No image uploaded",
        },
      };
    }

    const existingUser = await this.userRepository.findById(userId);

    if (!existingUser) {
      // cleanup uploaded file
      this.fileService.deleteFile(file.filename);

      return {
        statusCode: 404,
        data: {
          message: "User not found",
        },
      };
    }

    // delete old avatar if exists
    if (existingUser.avatar) {
      this.fileService.deleteFile(existingUser.avatar);
    }

    const updatedUser = await this.userRepository.updateAvatar({
      userId,
      avatar: file.filename,
    });

    const imageUrl = `${process.env.BASE_URL}/uploads/${file.filename}`;

    return {
      statusCode: 200,
      data: {
        success: true,
        message: "Image updated successfully",
        data: {
          //...updatedUser,
          imageUrl,
        },
      },
    };
  }

  //update user details
  async updateUserDetails({ userId, body }) {
    if (!userId) {
      return {
        statusCode: 400,
        data: {
          message: "User not authenticated",
        },
      };
    }

    const { name, email, address } = body;

    const dataToUpdate = {};

    if (name) dataToUpdate.name = name;
    if (email) dataToUpdate.email = email;
    if (address) dataToUpdate.address = address;

    if (Object.keys(dataToUpdate).length === 0) {
      return {
        statusCode: 400,
        data: {
          message: "No valid fields provided for update",
        },
      };
    }

    const user = await this.userRepository.updateUserById({
      userId,
      data: dataToUpdate,
    });

    return {
      statusCode: 200,
      data: {
        success: true,
        message: "User details updated successfully",
        data: user,
      },
    };
  }
  //change password
  async changePassword({ userId, body }) {
    const { currentPassword, newPassword } = body;

    if (!userId) {
      return {
        statusCode: 400,
        data: { message: "User not authenticated" },
      };
    }

    if (!currentPassword || !newPassword) {
      return {
        statusCode: 400,
        data: {
          message: "Current and new passwords are required",
        },
      };
    }

    const user = await this.userRepository.findByIdAndType(userId, "USER");

    if (!user) {
      return {
        statusCode: 404,
        data: { message: "User not found" },
      };
    }

    const isCurrentPasswordValid = await bcrypt.compare(
      currentPassword,
      user.password,
    );

    if (!isCurrentPasswordValid) {
      return {
        statusCode: 401,
        data: { message: "Current password is incorrect" },
      };
    }

    const hashedNewPassword = await bcrypt.hash(newPassword, 10);

    const updatedUser = await this.userRepository.updatePasswordById({
      userId,
      password: hashedNewPassword,
    });

    return {
      statusCode: 200,
      data: {
        success: true,
        message: "Password changed successfully",
        user: {
          id: updatedUser.id,
          email: updatedUser.email,
          name: updatedUser.name,
        },
      },
    };
  }
  //send mail to admin
  async sendMailToAdmin({ user, body }) {
    const { subject, message } = body;
    const user_email = user?.email;
    const userId = user?.userId;

    if (!user_email || !userId) {
      return {
        statusCode: 400,
        data: { message: "User email or ID is missing" },
      };
    }

    if (!subject || !message) {
      return {
        statusCode: 400,
        data: { message: "All fields are required" },
      };
    }

    if (!isEmail(user_email)) {
      return {
        statusCode: 400,
        data: { message: "Invalid email format" },
      };
    }

    const userData = await this.userRepository.findUserByEmailAndId({
      email: user_email,
      id: userId,
      type: "USER",
    });

    if (!userData) {
      return {
        statusCode: 404,
        data: { message: "User not found" },
      };
    }

    const ticketToken = Math.floor(
      10000000 + Math.random() * 90000000,
    ).toString();

    const mail = await this.userRepository.createMail({
      user_id: userId,
      user_email,
      user_name: userData.name,
      subject,
      message,
      token: ticketToken,
    });

    receiveEmails(user_email, subject, message);

    return {
      statusCode: 200,
      data: {
        success: true,
        message: "Mail sent to admin successfully",
        data: mail,
      },
    };
  }
  //get me
  async getMe(userId) {
    try {
      if (!userId) {
        return {
          statusCode: 400,
          data: { message: "User not authenticated" },
        };
      }

      const user = await this.userRepository.findUserProfileById(userId);
      if (!user) {
        return {
          statusCode: 404,
          data: { message: "User not found" },
        };
      }

      let isPremium = false;

      const subscription = await this.userRepository.findSubscriptionByUserId(userId);

      if (subscription) {
        isPremium = true;
      }

      const imageUrl = user.avatar
        ? `${process.env.BASE_URL}/uploads/${user.avatar}`
        : null;

      return {
        statusCode: 200,
        data: {
          success: true,
          message: "User details retrieved successfully",
          data: {
            ...user,
            imageUrl,
            isPremium,
          },
        },
      };
    } catch (error) {
      if (error.message === "User not found") {
        return {
          statusCode: 404,
          data: { message: "User not found" },
        };
      }
    }
  }
}

// Export a default instance for simple imports
const userService = new UserService();
export default userService;
