import asyncHandler from "express-async-handler";
import User from "../models/user.model.js";
import { Webhook } from "svix";

export const clerkWebhook = asyncHandler(async (req, res) => {
  const WEBHOOK_SECRET = process.env.CLERK_WEBHOOK_SECRET;
  if (!WEBHOOK_SECRET) {
    throw new Error("CLERK_WEBHOOK_SECRET is not set in environment variables.");
  }

  const svix_id = req.headers["svix-id"];
  const svix_timestamp = req.headers["svix-timestamp"];
  const svix_signature = req.headers["svix-signature"];

  if (!svix_id || !svix_timestamp || !svix_signature) {
    return res.status(400).send("Error occurred -- no svix headers");
  }

  const payload = req.body;
  const wh = new Webhook(WEBHOOK_SECRET);
  let evt;

  try {
    evt = wh.verify(payload, {
      "svix-id": svix_id,
      "svix-timestamp": svix_timestamp,
      "svix-signature": svix_signature,
    });
  } catch (err) {
    console.error("Error verifying webhook:", err);
    return res.status(400).send("Error occured");
  }
  
  const eventType = evt.type;
  
  if (eventType === 'user.updated') {
    const { id, first_name, last_name, image_url, email_addresses, username } = evt.data;

    // --- THIS IS THE FIX ---
    // Create an update object with only the data that is not null or undefined.
    const updatedFields = {};
    if (username) updatedFields.username = username;
    if (first_name) updatedFields.firstName = first_name;
    if (last_name) updatedFields.lastName = last_name;
    if (image_url) updatedFields.profilePicture = image_url;
    if (email_addresses && email_addresses.length > 0) {
      updatedFields.email = email_addresses[0].email_address;
    }
    
    // Use $set to only update the fields that have new data,
    // preventing the webhook from erasing existing names with empty ones.
    await User.findOneAndUpdate(
      { clerkId: id },
      { $set: updatedFields }
    );
    
    console.log(`User ${id} was updated in the database with fields:`, Object.keys(updatedFields));
  }

  res.status(200).json({ message: "Webhook received" });
});