import crypto from "node:crypto";
import asyncHandler from "express-async-handler";

export const protectCron = asyncHandler(async (req, res, next) => {
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    console.error("CRON_SECRET is not set in environment variables.");
    return res.status(500).json({ error: "Internal server configuration error." });
  }

  // expects "Authorization: Bearer <secret>"
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(" ")[1];


  const given = Buffer.from(token ?? "");
  const expected = Buffer.from(cronSecret);
  if (given.length === expected.length && crypto.timingSafeEqual(given, expected)) {
    next();
  } else {
    console.warn("Unauthorized cron job attempt detected.");
    res.status(401).json({ error: "Unauthorized." });
  }
});