import asyncHandler from "express-async-handler";
import User from "../models/user.model.js";
import { notifyUsers } from "../utils/push.notifications.js";

/**
 * @desc    Handle GetStream Webhooks for chat notifications
 * @route   POST /api/webhooks/chat
 * * This controller processes real-time events from Stream Chat.
 * It identifies recipients and filters them based on their notification 
 * preferences (Mute feature) before sending push alerts via Expo.
 */
export const handleChatWebhook = asyncHandler(async (req, res) => {
  const event = req.body; // Renamed to 'event' for clarity (standard Stream terminology)

  // 1. Only process new message events
  if (event.type !== 'message.new') {
    return res.status(200).json({ message: "Event ignored" });
  }

  const { message, user: sender, channel, members } = event;

  // 2. Identify the recipients (all channel members except the sender)
  // GetStream sends the member list within the webhook payload.
  const memberIds = members 
    ? members.map(m => m.user_id) 
    : [];
    
  const recipientIds = memberIds.filter(id => id !== sender.id);

  if (recipientIds.length === 0) {
    return res.status(200).json({ message: "No recipients to notify" });
  }

  try {
    /**
     * PROJECT 4: Advanced Mute Filtering
     * We retrieve recipients from the database who:
     * 1. Have a registered Expo Push Token.
     * 2. DO NOT have this channel/group ID in their 'mutedGroups' array (Indefinite Mute).
     * 3. DO NOT have this channel/group ID in their 'mutedUntilNextMeetup' array (Temporary Mute).
     */
    const recipients = await User.find({ 
      _id: { $in: recipientIds },
      expoPushToken: { $exists: true, $ne: null },
      mutedGroups: { $ne: channel.id },
      mutedUntilNextMeetup: { $ne: channel.id }
    });

    if (recipients.length > 0) {
      const channelName = channel.name || "New Message";
      
      // RECOMMENDATION: Fallback body text if message.text is empty (e.g., an image or file)
      const notificationBody = message.text 
        ? `${sender.name || sender.id}: ${message.text}`
        : `${sender.name || sender.id} sent an attachment`;

      // Send the batch of push notifications
      await notifyUsers(recipients, {
        title: channelName,
        body: notificationBody,
        data: { 
          type: 'chat', 
          groupId: channel.id,   // Explicitly include groupId for the frontend router
          channelId: channel.id, // Keeping channelId for backward compatibility
          senderId: sender.id 
        }
      });
    }
  } catch (error) {
    console.error("Webhook notification error:", error);
  }

  // Always return 200 to GetStream to acknowledge receipt
  res.status(200).json({ success: true });
});