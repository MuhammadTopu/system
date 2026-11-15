import express from "express";
import { testPush } from "./firebase.controller.js";
import { verifyUser } from "../../common/middlewares/verifyUsers.js";

const router = express.Router();

// admins only: this sends a push with any text to any device token
router.post("/test-push", verifyUser("ADMIN"), testPush);

export default router;
