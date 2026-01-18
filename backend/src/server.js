import express from "express";
import cors from "cors";
import { clerkMiddleware } from "@clerk/express";

import userRoutes from "./routes/user.route.js";
import groupRoutes from "./routes/group.route.js";
import eventRoutes from "./routes/event.route.js";
import jobRoutes from "./routes/job.route.js";
import chatRoutes from "./routes/chat.route.js";
import notificationRoutes from "./routes/notification.route.js"; 
// Project 4: Import webhook routes
import webhookRoutes from "./routes/webhook.route.js";

import { ENV } from "./config/env.js";
import { connectDB } from "./config/db.js";
import { arcjetMiddleware } from "./middleware/arcjet.middleware.js";
import User from "./models/user.model.js";

const app = express();

app.use(cors());
app.use(express.json());
app.use(clerkMiddleware());
// app.use(arcjetMiddleware);

app.get("/", (req, res) => res.send("Hello from server"));

app.use("/api/users", userRoutes);
app.use("/api/groups", groupRoutes);
app.use("/api/events", eventRoutes);
app.use("/api/jobs", jobRoutes); 
app.use("/api/chat", chatRoutes); 
app.use("/api/notifications", notificationRoutes); 
// Project 4: Mount the webhook route
app.use("/api/webhooks", webhookRoutes);

app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ error: err.message || "Internal server error" });
});

const startServer = async () => {
  try {
    await connectDB();
    if (ENV.NODE_ENV !== "production") {
      app.listen(ENV.PORT, () => console.log("Server is up and running on PORT:", ENV.PORT));
    }
  } catch (error) {
    console.error("Failed to start server:", error.message);
    process.exit(1);
  }
};

startServer();

export default app;