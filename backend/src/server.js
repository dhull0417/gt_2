import express from "express";
import cors from "cors";
import http from "http"; // 1. Import http
import { Server } from "socket.io"; // 2. Import Server from socket.io
import { clerkMiddleware } from "@clerk/express";

import userRoutes from "./routes/user.route.js";
import groupRoutes from "./routes/group.route.js";
import eventRoutes from "./routes/event.route.js";
import jobRoutes from "./routes/job.route.js";
import webhookRoutes from "./routes/webhook.route.js";
import messageRoutes from "./routes/message.route.js"; // 3. Import message routes
import Notification from "./models/notification.model.js"; 

import { ENV } from "./config/env.js";
import { connectDB } from "./config/db.js";
import { arcjetMiddleware } from "./middleware/arcjet.middleware.js";
import Message from "./models/message.model.js";
import User from "./models/user.model.js";

const app = express();
const httpServer = http.createServer(app); // 4. Create an http server

// 5. Create a Socket.IO server instance
const io = new Server(httpServer, {
  cors: {
    origin: "*", // In production, you should restrict this to your app's domain
    methods: ["GET", "POST"]
  }
});

// 6. Define Socket.IO connection logic
io.on("connection", (socket) => {
  console.log(`A user connected: ${socket.id}`);

  socket.on("joinGroup", (groupId) => {
    socket.join(groupId);
    console.log(`User ${socket.id} joined group room: ${groupId}`);
  });

  socket.on("sendMessage", async ({ text, groupId, senderId }) => {
    try {
      const message = await Message.create({ text, group: groupId, sender: senderId });
      const populatedMessage = await Message.findById(message._id).populate("sender", "firstName lastName profilePicture username");
      
      // Broadcast the new message to everyone in the group's room
      io.to(groupId).emit("receiveMessage", populatedMessage);
    } catch (error) {
      console.error("Error saving or broadcasting message:", error);
    }
  });

  socket.on("disconnect", () => {
    console.log(`User disconnected: ${socket.id}`);
  });
});


app.use(cors());
app.use("/api/webhooks", webhookRoutes);
app.use(express.json());
app.use(clerkMiddleware());
app.use(arcjetMiddleware);

app.get("/", (req, res) => res.send("Hello from server"));

app.use("/api/users", userRoutes);
app.use("/api/groups", groupRoutes);
app.use("/api/events", eventRoutes);
app.use("/api/jobs", jobRoutes);
app.use("/api/messages", messageRoutes); // 7. Use message routes
app.use("/api/notifications", Notification); 

app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ error: err.message || "Internal server error" });
});

const startServer = async () => {
  try {
    await connectDB();
    if (ENV.NODE_ENV !== "production") {
      // 8. Start the http server instead of the express app
      httpServer.listen(ENV.PORT, () => console.log("Server is up and running on PORT:", ENV.PORT));
    }
  } catch (error) {
    console.error("Failed to start server:", error.message);
    process.exit(1);
  }
};

startServer();

// In a serverless environment like Vercel, we export the Express app.
// Vercel will handle the http server layer.
export default app;