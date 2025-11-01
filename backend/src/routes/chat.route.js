import express from 'express';
import { ClerkExpressRequireAuth } from '@clerk/clerk-sdk-node';
import User from '../models/user.model.js'; 
import { ENV } from '../config/env.js';

const router = express.Router();

/**
 * @route   POST /api/chat/token
 * @desc    Get a Stream client token for the authenticated user
 * @access  Private
 */
router.post('/token', ClerkExpressRequireAuth(), async (req, res) => {
  try {
    const clerkUserId = req.auth.userId;
    if (!clerkUserId) {
        return res.status(401).json({ message: "Unauthorized" });
    }

    const user = await User.findOne({ clerkId: clerkUserId });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // --- FIX: Build a robust payload ---

    // 1. Set a fallback name (like the email) if firstName or lastName are missing
    const name = (user.firstName && user.lastName) 
      ? `${user.firstName} ${user.lastName}`
      : user.email; // Use email as a sensible default

    // 2. Start the payload with only the required fields
    const userPayload = {
      id: user._id.toString(),
      name: name,
      clerkId: user.clerkId,
    };

    // 3. Only add optional fields *if they exist*
    if (user.username) {
      userPayload.username = user.username;
    }
    if (user.profilePicture) {
      userPayload.image = user.profilePicture;
    }
    // --- End Fix ---

    // Use the client from your ENV object with the safe payload
    await ENV.SERVER_CLIENT.upsertUser(userPayload);

    // Use the client from your ENV object
    const token = ENV.SERVER_CLIENT.createToken(user._id.toString());
    
    res.status(200).json({ token });

  } catch (error) {
    console.error("Error creating chat token:", error);
    res.status(500).json({ message: "Internal server error creating chat token" });
T }
});

export default router;