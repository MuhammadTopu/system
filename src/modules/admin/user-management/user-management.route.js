import express from "express";

import { verifyUser } from "../../../common/middlewares/verifyUsers.js";
import {
  getAllUsers,
  printListPdf,
  suspendUser,
  activateUser,
} from "./user-managemnet.controller.js";

const router = express.Router();


//get all users
router.get("/get-all-users", verifyUser("ADMIN"), getAllUsers);
//get pdf
router.get("/get-pdf", verifyUser("ADMIN"), printListPdf);
//suspend a user
router.put("/suspend-user/:id", verifyUser("ADMIN"), suspendUser);
//active a user
router.put("/active-user/:id", verifyUser("ADMIN"), activateUser);

export default router;