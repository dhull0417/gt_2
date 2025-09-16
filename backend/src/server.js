import userRoutes from "./routes/user.route.js";
import groupRoutes from "./routes/group.route.js";
import eventRoutes from "./routes/event.route.js";
import jobRoutes from "./routes/job.route.js";
import webhookRoutes from "./routes/webhook.route.js"; // 1. Import webhook routes

import { ENV } from "./config/env.js";
import { connectDB } from "./config/db.js";
import { arcjetMiddleware } from "./middleware/arcjet.middleware.js";

const app = express();

app.use(cors());

// Note: We use the raw body parser for the webhook route, so the main json parser is placed after it.
// The webhook route is defined before the global express.json() middleware.
app.use("/api/webhooks", webhookRoutes); // 2. Use webhook routes

app.use(express.json()); // 3. Use global JSON parser

app.use(clerkMiddleware());
app.use(arcjetMiddleware);

app.get("/", (req, res) => res.send("Hello from server"));

app.use("/api/users", userRoutes);
app.use("/api/groups", groupRoutes);
app.use("/api/events", eventRoutes);
app.use("/api/jobs", jobRoutes);

// error handling middleware
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ error: err.message || "Internal server error" });
});

const startServer = async () => {
  try {
    await connectDB();

    // listen for local development
    if (ENV.NODE_ENV !== "production") {
      app.listen(ENV.PORT, () => console.log("Server is up and running on PORT:", ENV.PORT));
    }
  } catch (error) {
    console.error("Failed to start server:", error.message);
    process.exit(1);
  }
};

startServer();

// export for vercel
export default app;