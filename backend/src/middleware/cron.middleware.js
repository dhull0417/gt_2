import asyncHandler from "express-async-handler";

export const protectCron = asyncHandler(async (req, res, next) => {
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    console.error("CRON_SECRET is not set in environment variables.");
    return res.status(500).json({ error: "Internal server configuration error." });
  }

  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(" ")[1];

  if (token === cronSecret) {
    next(); // Secret matches, proceed to the controller
  } else {
    res.status(401).json({ error: "Unauthorized: Invalid cron secret." });
  }
});
