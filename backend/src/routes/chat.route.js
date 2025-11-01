import express from 'express';
import { ClerkExpressRequireAuth } from '@clerk/clerk-sdk-node';

// Import your User model (adjust path if needed)
import User from '../models/user.model.js'; 

// Import your global ENV object
import { ENV } from '../config/env.js'; // <-- IMPORT YOUR ENV

const router = express.Router();

/**
 * @route   POST /api/chat/token
 * @desc    Get a Stream client token for the authenticated user
 * @access  Private
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

    // Use the client from your ENV object
    await ENV.SERVER_CLIENT.upsertUser({
      id: user._id.toString(), 
      name: `${user.firstName} ${user.lastName}`,
      username: user.username,
      image: user.profilePicture,
      clerkId: user.clerkId,
    });

    // Use the client from your ENV object
    const token = ENV.SERVER_CLIENT.createToken(user._id.toString());
    
    res.status(200).json({ token });

  } catch (error) {
    console.error("Error creating chat token:", error);
    res.status(500).json({ message: "Internal server error creating chat token" });
  }
});

export default router;