import express from "express";
import { verifyUser } from "../../../common/middlewares/verifyUsers.js";
import {
  updateSettings,
  getGeneralSettings,
  getAllAdmins,
  deleteAdmin,
  inviteAdmin,
} from "./settings.controller.js";

const router = express.Router();

// general settings
router.put("/update-general-settings", verifyUser("ADMIN"), updateSettings);

// get general settings
router.get("/get-general-settings", verifyUser("ADMIN"), getGeneralSettings);

//get all admins
router.get("/get-all-admins", verifyUser("ADMIN"), getAllAdmins);
//delete a admin
router.delete("/delete-admin/:id", verifyUser("ADMIN"), deleteAdmin);
//invite a new admin
router.post("/invite-admin", verifyUser("ADMIN"), inviteAdmin);

export default router;
