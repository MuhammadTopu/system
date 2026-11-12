import { PrismaClient } from "@prisma/client";
import FileService from "../../common/services/file.service.js";
import {
  create_app_report,
  REPORT_CATEGORIES,
  REPORT_STATUSES,
} from "../validations/joi.validations.js";

const prisma = new PrismaClient();
const fileService = new FileService();

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
// a user can send this many reports per rolling 24 hours (stops spam)
const MAX_REPORTS_PER_DAY = 5;

const CATEGORY_LABELS = {
  bug: "Something is not working",
  crash: "App crashes or freezes",
  performance: "App is slow",
  ui_issue: "Screen or design problem",
  ai_suggestions: "Wrong AI suggestions / tasks",
  notifications: "Notifications",
  payment: "Payment or subscription",
  account: "Account or login",
  feature_request: "Feature request",
  other: "Something else",
};

export const imageUrl = (name) =>
  name ? `${process.env.BASE_URL}/uploads/${name}` : null;

export const reportToResponse = (r) => ({
  id: r.id,
  type: r.category,
  type_label: CATEGORY_LABELS[r.category] ?? r.category,
  subject: r.subject,
  description: r.description,
  screenshots: (r.screenshots || []).map(imageUrl),
  platform: r.platform,
  app_version: r.app_version,
  device_model: r.device_model,
  os_version: r.os_version,
  status: r.status,
  admin_response: r.admin_response,
  responded_at: r.responded_at,
  created_at: r.created_at,
  updated_at: r.updated_at,
});

export const positiveInt = (value, fallback) => {
  const n = Number.parseInt(value, 10);
  return Number.isInteger(n) && n > 0 ? n : fallback;
};

const removeUploads = (files = []) =>
  files.forEach((f) => fileService.deleteFile(f.filename));

// GET /api/reports/categories
export const getReportCategories = (req, res) =>
  res.status(200).json({
    success: true,
    categories: REPORT_CATEGORIES.map((value) => ({
      value,
      label: CATEGORY_LABELS[value],
    })),
  });

// POST /api/reports   (multipart/form-data; screenshots are optional, up to 3)
export const createReport = async (req, res, next) => {
  const files = req.files || [];
  try {
    const userId = req.user?.userId;
    if (!userId) {
      removeUploads(files);
      return res.status(400).json({ message: "User ID is required" });
    }

    const { value, error } = create_app_report.validate(req.body);
    if (error) {
      removeUploads(files);
      return res.status(400).json({ message: error.details[0].message });
    }

    const sentToday = await prisma.appReport.count({
      where: {
        user_id: userId,
        created_at: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      },
    });
    if (sentToday >= MAX_REPORTS_PER_DAY) {
      removeUploads(files);
      return res.status(429).json({
        message: `You can send at most ${MAX_REPORTS_PER_DAY} reports per day. Please try again tomorrow.`,
      });
    }

    const { type, ...rest } = value;
    const report = await prisma.appReport.create({
      data: {
        ...rest,
        category: type,
        user_id: userId,
        screenshots: files.map((f) => f.filename),
      },
    });

    return res.status(201).json({
      success: true,
      message: "Report sent. Thank you for helping us improve the app.",
      report: reportToResponse(report),
    });
  } catch (error) {
    removeUploads(files);
    next(error);
  }
};

// GET /api/reports?page=1&limit=20&status=open
export const getMyReports = async (req, res, next) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(400).json({ message: "User ID is required" });
    }

    const page = positiveInt(req.query.page, 1);
    const limit = Math.min(positiveInt(req.query.limit, DEFAULT_LIMIT), MAX_LIMIT);
    const status = REPORT_STATUSES.includes(req.query.status) ? req.query.status : undefined;

    const where = { user_id: userId, deleted_at: null, ...(status ? { status } : {}) };

    const [reports, total] = await Promise.all([
      prisma.appReport.findMany({
        where,
        orderBy: { created_at: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.appReport.count({ where }),
    ]);

    return res.status(200).json({
      success: true,
      message: "Reports retrieved successfully",
      reports: reports.map(reportToResponse),
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    next(error);
  }
};

// GET /api/reports/:id
export const getMyReport = async (req, res, next) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(400).json({ message: "User ID is required" });
    }

    const report = await prisma.appReport.findFirst({
      where: { id: req.params.id, user_id: userId, deleted_at: null },
    });
    if (!report) {
      return res.status(404).json({ message: "Report not found" });
    }

    return res.status(200).json({
      success: true,
      message: "Report retrieved successfully",
      report: reportToResponse(report),
    });
  } catch (error) {
    next(error);
  }
};
