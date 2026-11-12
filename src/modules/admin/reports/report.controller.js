import { PrismaClient } from "@prisma/client";
import {
  admin_update_report,
  REPORT_CATEGORIES,
  REPORT_STATUSES,
} from "../../validations/joi.validations.js";
import {
  notifyUser,
  NOTIFICATION_TYPES,
} from "../../notification/notification.service.js";
import {
  positiveInt,
  reportToResponse,
} from "../../report/report.controller.js";

const prisma = new PrismaClient();

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

const withUser = {
  user: {
    select: { id: true, name: true, email: true, deleted_at: true },
  },
};

const adminResponse = (r) => ({
  ...reportToResponse(r),
  user: r.user
    ? {
        id: r.user.id,
        name: r.user.name,
        email: r.user.email,
        account_deleted: r.user.deleted_at !== null,
      }
    : null,
});

// GET /api/admin/reports?status=open&type=bug&search=crash&page=1&limit=20
export const listReports = async (req, res, next) => {
  try {
    const page = positiveInt(req.query.page, 1);
    const limit = Math.min(positiveInt(req.query.limit, DEFAULT_LIMIT), MAX_LIMIT);
    const search = String(req.query.search || "").trim();

    const where = {
      deleted_at: null,
      ...(REPORT_STATUSES.includes(req.query.status) ? { status: req.query.status } : {}),
      ...(REPORT_CATEGORIES.includes(req.query.type)
        ? { category: req.query.type }
        : {}),
      ...(search
        ? {
            OR: [
              { subject: { contains: search, mode: "insensitive" } },
              { description: { contains: search, mode: "insensitive" } },
              { user: { email: { contains: search, mode: "insensitive" } } },
            ],
          }
        : {}),
    };

    const [reports, total, open] = await Promise.all([
      prisma.appReport.findMany({
        where,
        include: withUser,
        orderBy: { created_at: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.appReport.count({ where }),
      prisma.appReport.count({ where: { deleted_at: null, status: "open" } }),
    ]);

    return res.status(200).json({
      success: true,
      message: "Reports retrieved successfully",
      reports: reports.map(adminResponse),
      openCount: open,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    next(error);
  }
};

// GET /api/admin/reports/:id
export const getReport = async (req, res, next) => {
  try {
    const report = await prisma.appReport.findFirst({
      where: { id: req.params.id, deleted_at: null },
      include: withUser,
    });
    if (!report) {
      return res.status(404).json({ message: "Report not found" });
    }
    return res.status(200).json({
      success: true,
      message: "Report retrieved successfully",
      report: adminResponse(report),
    });
  } catch (error) {
    next(error);
  }
};

// PATCH /api/admin/reports/:id   { status?, admin_response? }
// Changes the status and / or answers the user. The user gets a notification
// when there is an answer or the report is closed (resolved / rejected).
export const updateReport = async (req, res, next) => {
  try {
    const { value, error } = admin_update_report.validate(req.body);
    if (error) {
      return res.status(400).json({ message: error.details[0].message });
    }

    const existing = await prisma.appReport.findFirst({
      where: { id: req.params.id, deleted_at: null },
    });
    if (!existing) {
      return res.status(404).json({ message: "Report not found" });
    }

    const report = await prisma.appReport.update({
      where: { id: existing.id },
      data: {
        ...(value.status ? { status: value.status } : {}),
        ...(value.admin_response
          ? { admin_response: value.admin_response, responded_at: new Date() }
          : {}),
      },
      include: withUser,
    });

    const closed = ["resolved", "rejected"].includes(value.status);
    // a deleted account gets no notification
    if ((value.admin_response || closed) && !report.user?.deleted_at) {
      notifyUser(report.user_id, {
        title: value.admin_response
          ? "We replied to your report"
          : `Your report was ${report.status}`,
        body: value.admin_response || `"${report.subject}" is now ${report.status}.`,
        type: NOTIFICATION_TYPES.REPORT_UPDATE,
        entityId: report.id,
        data: { report_id: report.id, status: report.status },
      });
    }

    return res.status(200).json({
      success: true,
      message: "Report updated",
      report: adminResponse(report),
    });
  } catch (error) {
    next(error);
  }
};
