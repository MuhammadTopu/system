import express from "express";

import userRoutes from "../modules/user/user.route.js";
import adminRoutes from "../modules/admin/routes/index.js";
import itemRoutes from "../modules/add_items/add_items.route.js";
import revenueCatRoutes from "../modules/revenuecat/revenuecat.route.js";
import firebaseRoutes from "../modules/firebase/firebase.route.js";

const router = express.Router();

router.use("/users", userRoutes);
router.use("/admin", adminRoutes);
router.use("/items", itemRoutes);
router.use("/revenuecat", revenueCatRoutes);
router.use("/firebase", firebaseRoutes);

export default router;