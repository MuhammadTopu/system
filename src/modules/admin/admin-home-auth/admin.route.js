import express from "express";

import { upload } from "../../../config/Multer.config.js";
import { verifyUser } from "../../../common/middlewares/verifyUsers.js";
import {
  changeAdminPassword,
  getMe,
  monthlyRevenue,
  getSubscriptionStats,
  activeSubscription,
  loginAdmin,
  updateAdminDetails,
  updateImage,
  getTotalUsers,
  thisMonthRevenue,
} from "./admin.controller.js";

const router = express.Router();

//--------------------------------------------------------admin login---------------------------------------------------------\\
router.post("/login", loginAdmin);
//--------------------------------------------------------home page------------------------------------------------------------\\
//get total number of users
router.get("/get-total-users", verifyUser("ADMIN"), getTotalUsers);
//get active subscriptions in the last month
router.get(
  "/get-active-subscriptions-last-month",
  verifyUser("ADMIN"),
  activeSubscription,
);
//monthly revenue
router.get("/get-monthly-revenue", verifyUser("ADMIN"), monthlyRevenue);
//get chart data
router.get("/get-chart-data", verifyUser("ADMIN"), getSubscriptionStats);
// this month revenue
router.get("/thismonths", verifyUser("ADMIN"), thisMonthRevenue);

//get me
router.get("/get-me", verifyUser("ADMIN"), getMe);
//admin change password
router.post("/change-password", verifyUser("ADMIN"), changeAdminPassword);
//admin profile image upload
router.put(
  "/update-image",
  upload.single("profilePicture"),
  verifyUser("ADMIN"),
  updateImage,
);
//update admin details
router.put("/update-admin-details", verifyUser("ADMIN"), updateAdminDetails);

export default router;
