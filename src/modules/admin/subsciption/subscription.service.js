import dotenv from "dotenv";
import validator from "validator";
import puppeteer from "puppeteer";
import { PrismaClient } from "@prisma/client";
import path from "path";
import { fileURLToPath } from "url";
import pkg from "jsonwebtoken";
import {
  generateSubscriptionHtml,
} from "../../../constants/email_message.js";

const prisma = new PrismaClient();
const { sign, verify } = pkg;
dotenv.config();
const { isEmail } = validator;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import AdminRepository from "../../../common/repository/admin.repository.js";

export class SubscriptionService {
  constructor(adminRepository) {
    this.adminRepository = new AdminRepository();
  }

  async getAllSubscriptions(query) {
    const {
      sortBy = "created_at",
      order = "desc",
      statusFilter,
      planFilter,
    } = query;

    const validSortByFields = ["created_at", "status", "plan"];

    const validOrder = ["asc", "desc"];

    const validStatusFilters = ["Active", "Ended"];

    const validPlanFilters = ["HalfYearly", "Yearly", "NONE"];

    const sortByField = validSortByFields.includes(sortBy)
      ? sortBy
      : "created_at";

    const orderBy = validOrder.includes(order) ? order : "desc";

    const status = validStatusFilters.includes(statusFilter)
      ? statusFilter
      : undefined;

    const plan = validPlanFilters.includes(planFilter) ? planFilter : undefined;

    const whereClause = {
      ...(status && { status }),
      ...(plan && { plan }),
    };

    const subscriptions = await this.adminRepository.getAllSubscriptions({
      whereClause,
      sortByField,
      orderBy,
    });

    if (!subscriptions.length) {
      return {
        statusCode: 404,
        data: {
          message: "No subscriptions found",
        },
      };
    }

    const formattedSubscriptions = subscriptions.map((sub) => ({
      username: sub.user.name || "N/A",
      user_id: sub.user.id,
      user_email: sub.user.email,
      plan: sub.plan,
      payment_method: sub.PaymentTransaction?.[0]?.payment_method || null,
      payment_transaction_id: sub.PaymentTransaction?.[0]?.id || null,
      status: sub.status,
      created_at: sub.created_at,
    }));

    return {
      statusCode: 200,
      data: {
        success: true,
        message: "Subscriptions retrieved successfully",
        subscriptions: formattedSubscriptions,
        filters: {
          status,
          plan,
        },
        sort: {
          by: sortByField,
          order: orderBy,
        },
      },
    };
  }
  async getSubscriptionPdf() {
    const subscriptions = await this.adminRepository.getSubscriptionsForPdf();

    if (!subscriptions.length) {
      return {
        statusCode: 404,
        data: {
          message: "No subscriptions found",
        },
      };
    }

    const htmlContent = generateSubscriptionHtml(subscriptions);

    const browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    const page = await browser.newPage();

    await page.setContent(htmlContent, {
      waitUntil: "networkidle0",
    });

    const pdfBuffer = await page.pdf({
      format: "A3",
      printBackground: true,
      margin: {
        top: "20mm",
        right: "5mm",
        bottom: "20mm",
        left: "5mm",
      },
    });

    await browser.close();

    return {
      statusCode: 200,
      pdfBuffer,
      fileName: "subscriptions_report.pdf",
    };
  }
}
