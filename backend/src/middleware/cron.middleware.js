import asyncHandler from "express-async-handler";

export const protectCron = asyncHandler(async (req, res, next) => {
  const vercelCronSecret = req.headers['x-vercel-cron-secret'];
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    console.error("CRON_SECRET is not set in environment variables.");
    return res.status(500).json({ error: "Internal server configuration error." });
  }

  // Check if the secret from the Vercel header matches your environment variable
  if (vercelCronSecret === cronSecret) {
    next(); // Secret matches, proceed to the controller
  } else {
    console.warn("Unauthorized cron job attempt detected.");
    res.status(401).json({ error: "Unauthorized." });
  }
});