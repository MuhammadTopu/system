import dotenv from "dotenv";
import validator from "validator";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { sendAdminInvitationEmail } from "../../../utils/mailService.js";
import path from "path";
import { fileURLToPath } from "url";
import pkg from "jsonwebtoken";
import { randomBytes } from "crypto";



const prisma = new PrismaClient();
const { sign, verify } = pkg;
dotenv.config();
const { isEmail } = validator;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import AdminRepository from "../../../common/repository/admin.repository.js";
import FileService from "../../../common/services/file.service.js";
import UserRepository from "../../../common/repository/user.repository.js";

export class AdminSettingsService {
  constructor() {
    this.adminRepository = new AdminRepository();
    this.fileService = new FileService();
    this.userRepository = new UserRepository();
  }

  async updateSettings(payload) {
    const { description, contact_email, contact_phone, time_zone } = payload;

    const settingsId = "cmq49rt9w0000go64khszgmsl";

    const data = {
      description,
      contact_email,
      contact_phone,
      time_zone,
    };

    const setting = await this.adminRepository.updateSettingsById(
      settingsId,
      data,
    );

    return {
      statusCode: 200,
      data: {
        success: true,
        message: "Settings updated successfully",
        data: setting,
      },
    };
  }
  async getGeneralSettings() {
    const settingsId = "cmq49rt9w0000go64khszgmsl";

    const setting =
      await this.adminRepository.getGeneralSettingsById(settingsId);

    if (!setting) {
      return {
        statusCode: 404,
        data: {
          success: false,
          message: "Settings not found",
        },
      };
    }

    return {
      statusCode: 200,
      data: {
        success: true,
        message: "Settings retrieved successfully",
        data: setting,
      },
    };
  }

  async getAllAdmins() {
    const admins = await this.adminRepository.getAllAdmins();

    if (!admins?.length) {
      return {
        statusCode: 404,
        data: {
          success: false,
          message: "No admins found",
        },
      };
    }

    return {
      statusCode: 200,
      data: {
        success: true,
        message: "Admins retrieved successfully",
        data: admins,
      },
    };
  }
  async deleteAdmin(adminId, currentUserId) {
    if (!adminId) {
      return {
        statusCode: 400,
        data: {
          success: false,
          message: "Admin ID is required",
        },
      };
    }

    if (adminId === currentUserId) {
      return {
        statusCode: 400,
        data: {
          success: false,
          message: "You cannot delete yourself",
        },
      };
    }

    const admin = await this.adminRepository.findAdminById(adminId);

    if (!admin) {
      return {
        statusCode: 404,
        data: {
          success: false,
          message: "Admin not found",
        },
      };
    }

    await this.adminRepository.deleteAdminById(adminId);

    return {
      statusCode: 200,
      data: {
        success: true,
        message: "Admin deleted successfully",
      },
    };
  }
  async inviteAdmin(email) {
    if (!email || !isEmail(email)) {
      return {
        statusCode: 400,
        data: {
          success: false,
          message: "Valid email is required",
        },
      };
    }

    const existingAdmin = await this.adminRepository.findAdminByEmail(email);

    if (existingAdmin) {
      return {
        statusCode: 400,
        data: {
          success: false,
          message: "Admin with this email already exists",
        },
      };
    }

    const rawPassword = randomBytes(6).toString("base64");
    const hashedPassword = await bcrypt.hash(rawPassword, 10);

    const newAdmin = await this.adminRepository.createAdmin({
      email,
      password: hashedPassword,
      type: "ADMIN",
    });

    await sendAdminInvitationEmail(email, rawPassword);

    return {
      statusCode: 200,
      data: {
        success: true,
        message: "Invitation sent successfully",
      },
    };
  }
}
export default new AdminSettingsService();
