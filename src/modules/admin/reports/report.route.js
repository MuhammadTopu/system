import express from "express";
import { verifyUser } from "../../../common/middlewares/verifyUsers.js";
import { getReport, listReports, updateReport } from "./report.controller.js";

const router = express.Router();

// base: /api/admin/reports
router.get("/", verifyUser("ADMIN"), listReports);
router.get("/:id", verifyUser("ADMIN"), getReport);
router.patch("/:id", verifyUser("ADMIN"), updateReport);

export default router;
