import dotenv from "dotenv";
import validator from "validator";
import { PrismaClient } from "@prisma/client";

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


export class FeedbackService {
  constructor() {
    this.adminRepository = new AdminRepository();
    this.fileService = new FileService();
    this.userRepository = new UserRepository();
  }


  async getAllMailsService() {
    const mails = await this.adminRepository.getAllMailsRepo();

    if (!mails?.length) {
      return {
        statusCode: 404,
        data: {
          success: false,
          message: "No mails found",
        },
      };
    }

    return {
      statusCode: 200,
      data: {
        success: true,
        message: "Mails retrieved successfully",
        data: mails,
      },
    };
  }
  async changeMailStatus(id) {
    if (!id) {
      return {
        statusCode: 400,
        data: {
          success: false,
          message: "Mail ID is required",
        },
      };
    }

    const mail = await this.adminRepository.findMailById(id);

    if (!mail) {
      return {
        statusCode: 404,
        data: {
          success: false,
          message: "Mail not found",
        },
      };
    }

    const newStatus = mail.status === "Pending" ? "Solved" : "Pending";

    const updatedMail = await this.adminRepository.updateMailStatus(
      id,
      newStatus,
    );

    return {
      statusCode: 200,
      data: {
        success: true,
        message: `Mail status updated to ${newStatus} successfully`,
        data: updatedMail,
      },
    };
  }

}