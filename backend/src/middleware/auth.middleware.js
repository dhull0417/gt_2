import { getAuth } from "@clerk/express";
import asyncHandler from "express-async-handler";

export const protectRoute = asyncHandler(async (req, res, next) => {
  // --- Debugging logs to inspect authentication ---
  console.log("--- MIDDLEWARE: protectRoute executing ---");

  try {
    // This is the standard way to check for an authenticated session.
    // It will throw an error if the user is not authenticated.
    getAuth(req);

    // If getAuth() doesn't throw, it means authentication is successful.
    // We log the auth object to see the user's session details.
    console.log("Authentication successful. req.auth object:", req.auth);

    // Pass the request to the next step (the controller function).
    next();
  } catch (error) {
    // If getAuth() throws an error, it will be caught here.
    console.error("--- MIDDLEWARE: Authentication failed ---");
    console.error("Error from getAuth:", error.message);

    // Return a clear "Unauthorized" error to the client.
    return res.status(401).json({ error: "Unauthorized: Invalid or missing token." });
  }
});
