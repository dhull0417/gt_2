import asyncHandler from "express-async-handler";
import User from "../models/user.model.js";
import { notifyUsers } from "../utils/push.notifications.js";
import { StreamChat } from "stream-chat";

const client = StreamChat.getInstance(
  process.env.STREAM_API_KEY,
  process.env.STREAM_API_SECRET
);

/**
 * @desc    Handle GetStream Webhooks
 * @route   POST /api/webhooks/chat
 */
export const handleChatWebhook = asyncHandler(async (req, res) => {
  const event = req.body;

  // 1. Verify this is a 'message.new' event
  if (event.type !== 'message.new') {
    return res.status(200).json({ message: "Event ignored" });
  }

  const { message, user: sender, channel } = event;

  // 2. Identify the recipients (all channel members except the sender)
  // GetStream events usually include the members array
  const memberIds = event.members 
    ? event.members.map(m => m.user_id) 
    : [];
    
  const recipientIds = memberIds.filter(id => id !== sender.id);

  if (recipientIds.length === 0) {
    return res.status(200).json({ message: "No recipients to notify" });
  }

  try {
    // 3. Fetch recipients from our DB to get their Expo Push Tokens
    const recipients = await User.find({ 
      _id: { $in: recipientIds },
      expoPushToken: { $exists: true, $ne: null }
    });

    if (recipients.length > 0) {
      // 4. Send the push notification
      // We use the channel name if available, otherwise fallback
      const channelName = channel.name || "New Message";
      
      await notifyUsers(recipients, {
        title: channelName,
        body: `${sender.name || sender.id}: ${message.text}`,
        data: { 
          type: 'chat', 
          channelId: channel.id,
          senderId: sender.id 
        }
      });
    }
  } catch (error) {
    console.error("Webhook notification error:", error);
  }

  // Always return 200 to Stream to acknowledge receipt
  res.status(200).json({ success: true });
});