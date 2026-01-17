import { Expo } from 'expo-server-sdk';

// Create a new Expo SDK client
const expo = new Expo();

/**
 * sendPushNotifications
 * * Takes an array of notification objects and delivers them via Expo's service.
 * Handles validation, chunking, and error logging.
 * * @param {Array} notifications - Array of objects: { to: string, title: string, body: string, data?: object }
 * @returns {Promise<Array>} - Returns tickets for tracking delivery status
 */
export const sendPushNotifications = async (notifications) => {
  const messages = [];

  for (let pushNotification of notifications) {
    // 1. Validate that the token is a valid Expo push token
    if (!Expo.isExpoPushToken(pushNotification.to)) {
      console.error(`Push token ${pushNotification.to} is not a valid Expo push token`);
      continue;
    }

    // 2. Construct the message
    messages.push({
      to: pushNotification.to,
      sound: 'default',
      title: pushNotification.title,
      body: pushNotification.body,
      data: pushNotification.data || {},
      priority: 'high', // Ensures immediate delivery for cancellations/promotions
    });
  }

  // 3. Chunk the notifications
  // Expo's push API is intended for batches. We must chunk them into sizes
  // that the Expo servers can handle (usually around 100 per chunk).
  let chunks = expo.chunkPushNotifications(messages);
  let tickets = [];

  for (let chunk of chunks) {
    try {
      // 4. Send the chunks
      let ticketChunk = await expo.sendPushNotificationsAsync(chunk);
      tickets.push(...ticketChunk);
      
      // NOTE: For a production app, you might want to store these 'tickets'
      // to check for delivery errors (receipts) later.
    } catch (error) {
      console.error("Critical error sending notification chunk:", error);
    }
  }

  return tickets;
};

/**
 * Helper to prepare a list of notifications for a specific group of users
 * @param {Array} users - Array of user objects containing expoPushToken
 * @param {Object} content - { title, body, data }
 */
export const notifyUsers = async (users, { title, body, data }) => {
  const notifications = users
    .filter(user => user.expoPushToken) // Only users with registered tokens
    .map(user => ({
      to: user.expoPushToken,
      title,
      body,
      data
    }));

  if (notifications.length > 0) {
    return await sendPushNotifications(notifications);
  }
  return [];
};