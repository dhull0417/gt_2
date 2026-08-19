import { Expo } from 'expo-server-sdk';
import User from '../models/user.model.js';
import Notification from '../models/notification.model.js';

const expo = new Expo();

/**
 * sendPushNotifications
 * Delivers notifications and handles "self-healing" by removing invalid tokens.
 */
export const sendPushNotifications = async (notifications) => {
  const messages = [];

  for (let pushNotification of notifications) {
    if (!Expo.isExpoPushToken(pushNotification.to)) {
      console.error(`Push token ${pushNotification.to} is not a valid Expo push token`);
      continue;
    }

    messages.push({
      to: pushNotification.to,
      sound: 'default',
      title: pushNotification.title,
      body: pushNotification.body,
      data: pushNotification.data || {},
      priority: 'high',
      channelId: 'default',
    });
  }

  let chunks = expo.chunkPushNotifications(messages);
  let tickets = [];

  for (let chunk of chunks) {
    try {
      let ticketChunk = await expo.sendPushNotificationsAsync(chunk);
      tickets.push(...ticketChunk);
      
      /**
       * PROJECT 4: TOKEN CLEANUP LOGIC
       * We iterate through the tickets returned for this specific chunk.
       * The index of the ticket matches the index of the message in the chunk.
       */
      for (let i = 0; i < ticketChunk.length; i++) {
        const ticket = ticketChunk[i];
        if (ticket.status === 'error') {
          // 'DeviceNotRegistered' is the specific error Expo sends when a token is no longer valid
          if (ticket.details && ticket.details.error === 'DeviceNotRegistered') {
            const invalidToken = chunk[i].to;
            
            console.log(`[Cleanup] Removing invalid token: ${invalidToken}`);
            
            // Remove the token from our database so we don't try to use it again
            await User.updateOne(
              { expoPushToken: invalidToken },
              { $unset: { expoPushToken: "" } }
            );
          }
        }
      }
    } catch (error) {
      console.error("Critical error sending notification chunk:", error);
    }
  }

  return tickets;
};

/**
 * Helper to prepare a list of notifications for a specific group of users
 */
export const notifyUsers = async (users, { title, body, data }) => {
  const notifications = users
    .filter(user => user.expoPushToken)
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

/**
 * Sends a push notification to a group of users and persists an in-app
 * Notification record for each of them, so every push-triggering event also
 * shows up on the notifications screen. `users` is the full recipient list —
 * unlike notifyUsers, it is not filtered down to users with a push token,
 * since users without a token should still get the in-app record.
 */
export const notifyAndPersist = async (users, { title, body, data, type, sender, group, meetup, poll }) => {
  await notifyUsers(users, { title, body, data });

  if (!type || !users || users.length === 0) return;

  const docs = users.map(user => ({
    recipient: user._id,
    sender,
    type,
    group,
    meetup,
    poll,
    read: false,
  }));

  await Notification.insertMany(docs);
};