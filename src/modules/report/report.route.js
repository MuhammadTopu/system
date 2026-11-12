import express from "express";
import { upload } from "../../config/Multer.config.js";
import { verifyUser } from "../../common/middlewares/verifyUsers.js";
import {
  createReport,
  getMyReport,
  getMyReports,
  getReportCategories,
} from "./report.controller.js";

const router = express.Router();

// base: /api/reports
router.get("/categories", verifyUser("USER"), getReportCategories);
// verifyUser runs before the upload, so nothing is written for a bad token
router.post("/", verifyUser("USER"), upload.array("screenshots", 3), createReport);
router.get("/", verifyUser("USER"), getMyReports);
router.get("/:id", verifyUser("USER"), getMyReport);

export default router;
