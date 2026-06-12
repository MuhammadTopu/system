import dotenv from "dotenv";
import validator from "validator";
import puppeteer from "puppeteer";
import { PrismaClient } from "@prisma/client";
import path from "path";
import { fileURLToPath } from "url";
import pkg from "jsonwebtoken";
import {
  generateUserListHtml,
} from "../../../constants/email_message.js";

const prisma = new PrismaClient();
const { sign, verify } = pkg;
dotenv.config();
const { isEmail } = validator;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import AdminRepository from "../../../common/repository/admin.repository.js";

export class UserManagementService {
  constructor(adminRepository) {
    this.adminRepository = new AdminRepository();
  }
  // get all users with pagination, sorting, and filtering
  async getAllUsers({ page = 1, limit = 10 }) {
    const skip = (page - 1) * limit;

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where: { type: "USER" },
        skip,
        take: limit,
        orderBy: { created_at: "desc" },
      }),

      prisma.user.count({
        where: { type: "USER" },
      }),
    ]);

    const formattedUsers = users.map((user) => ({
      id: user.id,
      name: user.name,
      email: user.email,
      status: user.status,
      created_at: user.created_at,
    }));

    const totalPages = Math.ceil(total / limit);

    return {
      users: formattedUsers,
      pagination: {
        total,
        page: Number(page),
        limit: Number(limit),
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
        nextPage: page < totalPages ? Number(page) + 1 : null,
        prevPage: page > 1 ? Number(page) - 1 : null,
      },
    };
  }
  async printListPdf() {
    const users = await this.adminRepository.getUsersForPdf();

    if (!users.length) {
      return {
        statusCode: 404,
        data: {
          message: "No users found",
        },
      };
    }

    const htmlContent = generateUserListHtml(users);

    const browser = await puppeteer.launch();

    const page = await browser.newPage();

    await page.setContent(htmlContent);

    const pdfBuffer = await page.pdf({
      format: "A3",
      printBackground: true,
    });

    await browser.close();

    return {
      statusCode: 200,
      pdfBuffer,
      fileName: "user_list.pdf",
    };
  }
  async suspendUser(userId) {
    if (!userId) {
      return {
        statusCode: 400,
        data: {
          message: "User ID is required",
        },
      };
    }

    const user = await this.adminRepository.findUserById(userId);

    if (!user) {
      return {
        statusCode: 404,
        data: {
          message: "User not found",
        },
      };
    }

    await this.adminRepository.suspendUser(userId);

    return {
      statusCode: 200,
      data: {
        success: true,
        message: "User suspended successfully",
      },
    };
  }
  async activateUser(userId) {
    if (!userId) {
      return {
        statusCode: 400,
        data: {
          message: "User ID is required",
        },
      };
    }

    const user = await this.adminRepository.findUserById(userId);

    if (!user) {
      return {
        statusCode: 404,
        data: {
          message: "User not found",
        },
      };
    }

    await this.adminRepository.updateUserStatus(userId, "active");

    return {
      statusCode: 200,
      data: {
        success: true,
        message: "User activated successfully",
      },
    };
  }
}
