import asyncHandler from "express-async-handler";
import User from "../models/user.model.js";
import { Webhook } from "svix";

export const clerkWebhook = asyncHandler(async (req, res) => {
  const WEBHOOK_SECRET = process.env.CLERK_WEBHOOK_SECRET;
  if (!WEBHOOK_SECRET) {
    throw new Error("CLERK_WEBHOOK_SECRET is not set in environment variables.");
  }

  // Get the headers
  const svix_id = req.headers["svix-id"];
  const svix_timestamp = req.headers["svix-timestamp"];
  const svix_signature = req.headers["svix-signature"];

  if (!svix_id || !svix_timestamp || !svix_signature) {
    return res.status(400).json({ error: "Error occurred -- no svix headers" });
  }

  // Get the body
  const payload = req.body;
  const body = JSON.stringify(payload);

  // Create a new Svix instance with your secret.
  const wh = new Webhook(WEBHOOK_SECRET);
  let evt;

  // Verify the payload with the headers
  try {
    evt = wh.verify(body, {
      "svix-id": svix_id,
      "svix-timestamp": svix_timestamp,
      "svix-signature": svix_signature,
    });
  } catch (err) {
    console.error("Error verifying webhook:", err);
    return res.status(400).json({ error: "Webhook verification failed." });
  }

  const { id, ...attributes } = evt.data;
  const eventType = evt.type;

  console.log(`Webhook with an ID of ${id} and type of ${eventType}`);
  
  // We only care about the 'user.updated' event for this feature
  if (eventType === 'user.updated') {
    const { first_name, last_name, image_url, email_addresses } = attributes;
    
    await User.findOneAndUpdate(
      { clerkId: id },
      {
        firstName: first_name,
        lastName: last_name,
        profilePicture: image_url,
        email: email_addresses[0].email_address,
      }
    );
    console.log(`User ${id} was updated in the database.`);
  }

  res.status(200).json({ message: "Webhook received" });
});