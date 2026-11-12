import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";

dotenv.config();

const prisma = new PrismaClient();

export const verifyUser = (...allowedRoles) => {
  return async (req, res, next) => {
    const authHeader = req.headers["authorization"];

    if (!authHeader) {
      return res.status(401).json({ message: "No token provided" });
    }

    const token = authHeader.split(" ")[1];

    if (!token) {
      return res.status(401).json({ message: "Token format is invalid" });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (error) {
      return res.status(401).json({ message: "Invalid or expired token" });
    }

    req.user = decoded;

    if (
      allowedRoles.length &&
      !allowedRoles.includes("ANY") &&
      !allowedRoles.includes(req.user?.role) &&
      !allowedRoles.includes(req.user?.type)
    ) {
      return res
        .status(403)
        .json({ message: "Access denied. Insufficient permission." });
    }

    // Access tokens live for months, so a deleted account has to be stopped here:
    // its token is still valid, but the account is gone.
    if (decoded.userId && decoded.type === "USER") {
      try {
        const account = await prisma.user.findUnique({
          where: { id: decoded.userId },
          select: { deleted_at: true },
        });
        if (!account || account.deleted_at) {
          return res.status(401).json({
            message: "This account has been deleted",
            code: "ACCOUNT_DELETED",
          });
        }
      } catch (error) {
        console.error("verifyUser account check failed:", error.message);
        return res.status(500).json({ message: "Internal server error" });
      }
    }

    next();
  };
};
