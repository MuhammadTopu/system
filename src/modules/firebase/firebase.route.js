import express from "express";
import { testPush } from "./firebase.controller.js";

const router = express.Router();

router.post("/test-push", testPush);

export default router;
