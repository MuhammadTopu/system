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

export class PlansService {
  constructor() {
    this.adminRepository = new AdminRepository();
    this.fileService = new FileService();
    this.userRepository = new UserRepository();
  }
    async createService(payload) {
    const { name, description, price, features, plan } = payload;

    if (!name || !description || !price || !features || !plan) {
      return {
        statusCode: 400,
        data: {
          success: false,
          message: "All fields are required",
        },
      };
    }

    let parsedFeatures;

    try {
      parsedFeatures =
        typeof features === "string" ? JSON.parse(features) : features;
    } catch (err) {
      return {
        statusCode: 400,
        data: {
          success: false,
          message: "Invalid features format",
        },
      };
    }

    const newService = await this.adminRepository.createService({
      name,
      description,
      price: parseFloat(price),
      features: parsedFeatures,
      plan,
    });

    return {
      statusCode: 201,
      data: {
        success: true,
        message: "Service created successfully",
        data: newService,
      },
    };
  }
  async getAllServices() {
    const services = await this.adminRepository.getAllServices();

    if (!services?.length) {
      return {
        statusCode: 404,
        data: {
          success: false,
          message: "No services found",
        },
      };
    }

    return {
      statusCode: 200,
      data: {
        success: true,
        message: "Services retrieved successfully",
        data: services,
      },
    };
  }
}