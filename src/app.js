import express from "express";
import cors from "cors";
import morgan from "morgan";
import { fileURLToPath } from "url";
import path from "path";
import routes from "./routes/index.js";
import nodeCron from "node-cron";
import { initFirebase } from "./modules/firebase/firebase.service.js";
import { expireOverdueSubscriptions } from "./modules/revenuecat/subscription.sweep.js";

const app = express();
initFirebase();
app.use(
  cors({
    origin: [
      "http://192.168.30.102:3000",
      "http://localhost:5173",
      "http://localhost:3000",
      "http://localhost:8080",
      "http://127.0.0.1:5500",
      "https://f7acfea4e102.ngrok-free.app",
      "https://maintenance-genie-72uvp6qac-bbsfullstacks-projects.vercel.app/admin",
      "https://maintenance-genie-bay.vercel.app",
      "https://cleint-sys1.vercel.app/",
    ],
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
    credentials: true,
  }),
);
// Daily safety net: expire subscriptions whose webhook never arrived.
nodeCron.schedule("0 0 * * *", async () => {
  try {
    const expired = await expireOverdueSubscriptions();
    console.log(`Subscription sweep finished: ${expired} expired.`);
  } catch (error) {
    console.error("Error in daily subscription sweep:", error);
  }
});
app.use(express.json());

app.use(express.urlencoded({ extended: true }));
app.use(morgan("dev"));
app.use("/api", routes);
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "index.html"));
});
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use("/uploads", express.static(path.join(__dirname, "uploads")));
app.use(express.static(path.join(__dirname, "..", "public")));

app.use((req, res, next) => {
  res.status(404).json({
    message: `404 route not found`,
  });
});

app.use((err, req, res, next) => {
  res.status(500).json({
    message: `500 Something broken!`,
    error: err.message,
  });
});
export default app;
