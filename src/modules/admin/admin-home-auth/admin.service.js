import dotenv from "dotenv";
import validator from "validator";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import pkg from "jsonwebtoken";

const prisma = new PrismaClient();
const { sign, verify } = pkg;
dotenv.config();
const { isEmail } = validator;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import AdminRepository from "../../../common/repository/admin.repository.js";
import FileService from "../../../common/services/file.service.js";
import UserRepository from "../../../common/repository/user.repository.js";

export class AdminService {
  constructor() {
    this.adminRepository = new AdminRepository();
    this.userRepository = new UserRepository();
    this.fileService = new FileService();
  }

  async loginAdmin({ email, password }) {
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

    const user = await this.adminRepository.findAdminByEmail(email);

    if (!user) {
      return {
        statusCode: 404,
        data: {
          message: "SORRY YOU ARE NOT REGISTERED AS ADMIN",
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
          createdAt: user.created_at,
          updatedAt: user.updated_at,
        },
        token,
      },
    };
  }
  async getTotalUsers() {
    const totalUsers = await this.adminRepository.countUsers();

    return {
      statusCode: 200,
      data: {
        success: true,
        message: "Total users retrieved successfully",
        data: {
          totalUsers,
        },
      },
    };
  }
  async getSubscriptionStats(userId) {
    if (!userId) {
      return {
        statusCode: 400,
        data: {
          message: "User not authenticated",
        },
      };
    }

    const currentDate = new Date();
    const currentYear = currentDate.getFullYear();
    const currentMonth = currentDate.getMonth();

    const monthsThisYear = [];

    for (let month = 0; month <= currentMonth; month++) {
      monthsThisYear.push(new Date(currentYear, month, 1));
    }

    const users = await this.adminRepository.getSubscribedUsersThisYear(
      new Date(currentYear, 0, 1),
      currentDate,
    );

    const series = [
      {
        name: "normal",
        data: Array(monthsThisYear.length).fill(0),
      },
      {
        name: "premium",
        data: Array(monthsThisYear.length).fill(0),
      },
    ];

    users.forEach((user) => {
      const userMonth = user.created_at.getMonth();
      const userYear = user.created_at.getFullYear();

      if (userYear === currentYear) {
        const monthIndex = monthsThisYear.findIndex(
          (date) => date.getMonth() === userMonth,
        );

        if (monthIndex !== -1) {
          if (user.role?.toLowerCase() === "normal") {
            series[0].data[monthIndex]++;
          }

          if (user.role?.toLowerCase() === "premium") {
            series[1].data[monthIndex]++;
          }
        }
      }
    });

    return {
      statusCode: 200,
      data: {
        success: true,
        message: "Subscription statistics retrieved successfully",
        data: {
          series,
        },
      },
    };
  }
  async monthlyRevenue() {
    const currentDate = new Date();

    const lastMonthStart = new Date(
      currentDate.getFullYear(),
      currentDate.getMonth() - 1,
      1,
    );

    const lastMonthEnd = new Date(
      currentDate.getFullYear(),
      currentDate.getMonth(),
      0,
    );

    const revenue = await this.adminRepository.getMonthlyRevenue(
      lastMonthStart,
      lastMonthEnd,
    );

    if (revenue._sum.price === null) {
      return {
        statusCode: 200,
        data: {
          success: true,
          message: "No revenue found for the last month",
          data: {
            _sum: {
              price: 0,
            },
          },
        },
      };
    }

    return {
      statusCode: 200,
      data: {
        success: true,
        message: "Monthly revenue retrieved successfully",
        data: revenue,
      },
    };
  }
  async thisMonthRevenue() {
    const currentDate = new Date();

    const thisMonthStart = new Date(
      currentDate.getFullYear(),
      currentDate.getMonth(),
      1,
    );

    const thisMonthEnd = new Date(
      currentDate.getFullYear(),
      currentDate.getMonth() + 1,
      0,
    );

    const revenue = await this.adminRepository.getRevenueBetweenDates(
      thisMonthStart,
      thisMonthEnd,
    );

    if (revenue._sum.price === null) {
      return {
        statusCode: 200,
        data: {
          success: true,
          message: "No revenue found for this month",
          data: {
            _sum: {
              price: 0,
            },
          },
        },
      };
    }

    return {
      statusCode: 200,
      data: {
        success: true,
        message: "This month's revenue retrieved successfully",
        data: revenue,
      },
    };
  }
  async activeSubscription(userId) {
    if (!userId) {
      return {
        statusCode: 400,
        data: {
          message: "User not authenticated",
        },
      };
    }

    const currentDate = new Date();

    const lastMonthStart = new Date();
    lastMonthStart.setMonth(lastMonthStart.getMonth() - 1);

    const lastMonthEnd = new Date();

    const activeSubscriptionsCount =
      await this.adminRepository.countActiveSubscriptions({
        userId,
        startDate: lastMonthStart,
        endDate: lastMonthEnd,
      });

    if (activeSubscriptionsCount === 0) {
      return {
        statusCode: 200,
        data: {
          success: true,
          data: {
            activeSubscriptionsCount: 0,
          },
          message: "No active subscriptions found for the last month",
        },
      };
    }

    return {
      statusCode: 200,
      data: {
        success: true,
        message:
          "Active subscription count for the last month retrieved successfully",
        data: {
          activeSubscriptionsCount,
        },
      },
    };
  }

  ///admin auth and profile management
  async getMe(userId) {
    if (!userId) {
      return {
        statusCode: 400,
        data: {
          success: false,
          message: "User not authenticated",
        },
      };
    }

    const user = await this.adminRepository.findUserById(userId);

    if (!user) {
      return {
        statusCode: 404,
        data: {
          success: false,
          message: "User not found",
        },
      };
    }

    return {
      statusCode: 200,
      data: {
        success: true,
        message: "User retrieved successfully",
        data: user,
      },
    };
  }
  async changeAdminPassword(oldPassword, newPassword, userId) {
    if (!oldPassword || !newPassword) {
      return {
        statusCode: 400,
        data: {
          success: false,
          message: "Old password and new password are required",
        },
      };
    }

    const user = await this.adminRepository.findUserPasswordById(userId);

    if (!user) {
      return {
        statusCode: 404,
        data: {
          success: false,
          message: "User not found",
        },
      };
    }
    // check if old and new passwords are the same
    const isSamePassword = await bcrypt.compare(newPassword, user.password);
    if (isSamePassword) {
      return {
        statusCode: 400,
        data: {
          success: false,
          message: "New password cannot be the same as old password",
        },
      };
    }

    const isOldPasswordValid = await bcrypt.compare(oldPassword, user.password);

    if (!isOldPasswordValid) {
      return {
        statusCode: 401,
        data: {
          success: false,
          message: "Old password is incorrect",
        },
      };
    }

    const hashedNewPassword = await bcrypt.hash(newPassword, 10);

    await this.adminRepository.updatePassword(userId, hashedNewPassword);

    return {
      statusCode: 200,
      data: {
        success: true,
        message: "Password changed successfully",
      },
    };
  }
  async updateImage(userId, file) {
    if (!file) {
      return {
        statusCode: 400,
        data: {
          success: false,
          message: "No image uploaded",
        },
      };
    }

    const existingUser = await this.adminRepository.findAdminById(userId);

    if (!existingUser) {
      // cleanup uploaded file
      const filePath = path.join(process.cwd(), "uploads", file.filename);

      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }

      return {
        statusCode: 404,
        data: {
          success: false,
          message: "Admin not found",
        },
      };
    }

    // remove old image if exists
    if (existingUser.avatar) {
      const oldImagePath = path.join(
        process.cwd(),
        "uploads",
        existingUser.avatar,
      );

      if (fs.existsSync(oldImagePath)) {
        fs.unlinkSync(oldImagePath);
      }
    }

    const user = await this.adminRepository.updateAvatar(userId, file.filename);

    // delete old avatar if exists
    if (existingUser.avatar) {
      this.fileService.deleteFile(existingUser.avatar);
    }

    const imageUrl = `http://localhost:8080/uploads/${file.filename}`;

    return {
      statusCode: 200,
      data: {
        success: true,
        message: "Image updated successfully",
        data: {
          ...user,
          imageUrl,
        },
      },
    };
  }
  async updateAdminDetails(userId, payload) {
    const { name, email } = payload;

    if (!userId) {
      return {
        statusCode: 400,
        data: {
          success: false,
          message: "Admin not authenticated",
        },
      };
    }

    const dataToUpdate = {};

    if (name) dataToUpdate.name = name;
    if (email) dataToUpdate.email = email;

    if (Object.keys(dataToUpdate).length === 0) {
      return {
        statusCode: 400,
        data: {
          success: false,
          message: "No valid fields provided for update",
        },
      };
    }

    try {
      const user = await this.adminRepository.updateAdminById(
        userId,
        dataToUpdate,
      );

      return {
        statusCode: 200,
        data: {
          success: true,
          message: "User details updated successfully",
          data: user,
        },
      };
    } catch (error) {
      // Prisma: record not found
      if (error.code === "P2025") {
        return {
          statusCode: 404,
          data: {
            success: false,
            message: "User not found",
          },
        };
      }

      throw error; // let global error handler handle it
    }
  }
}

export default new AdminService();
