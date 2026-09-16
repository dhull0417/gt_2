import { Expo } from 'expo-server-sdk';
import User from '../models/user.model.js';
import Notification from '../models/notification.model.js';
import Meetup from '../models/meetup.model.js';

const expo = new Expo();

/**
 * Muting quiets only the group's next meetup, not everything after it.
 * "Next" is computed by startsAt (not the caller's status) since this runs
 * after cancellations/updates are already saved.
 */
const isNextUpcomingMeetup = async (groupId, meetupId) => {
  if (!groupId || !meetupId) return false;

  const meetup = await Meetup.findById(meetupId, 'startsAt').lean();
  if (!meetup || !meetup.startsAt) return false;

  const earlierExists = await Meetup.exists({
    group: groupId,
    _id: { $ne: meetupId },
    status: 'scheduled',
    startsAt: { $lt: meetup.startsAt },
  });

  return !earlierExists;
};

const isGroupMuted = (user, groupId) => {
  const groupIdStr = groupId.toString();
  return (user.mutedGroups || []).some(id => id.toString() === groupIdStr)
    || (user.mutedUntilNextMeetup || []).some(id => id.toString() === groupIdStr);
};

// delivers notifications; self-heals by removing invalid tokens
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
      
      // ticket index matches message index in this chunk
      for (let i = 0; i < ticketChunk.length; i++) {
        const ticket = ticketChunk[i];
        if (ticket.status === 'error') {
          // 'DeviceNotRegistered' is the specific error Expo sends when a token is no longer valid
          if (ticket.details && ticket.details.error === 'DeviceNotRegistered') {
            const invalidToken = chunk[i].to;
            
            console.log(`[Cleanup] Removing invalid token: ${invalidToken}`);
            
            // prevent reuse of the dead token
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

// prepares notifications for a group of users
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
 * Sends push + persists in-app Notification records so every event shows up
 * on the notifications screen. Unlike notifyUsers, `users` isn't filtered to
 * push-token holders — those without one still get the in-app record.
 */
export const notifyAndPersist = async (users, { title, body, data, type, sender, group, meetup, poll, meta }) => {
  // muted members still get the in-app record, but skip the push if this is
  // the group's next meetup — the one event a mute is meant to quiet.
  let pushRecipients = users;
  if (group && meetup && users?.length > 0) {
    const isNext = await isNextUpcomingMeetup(group, meetup);
    if (isNext) {
      pushRecipients = users.filter(user => !isGroupMuted(user, group));
    }
  }

  await notifyUsers(pushRecipients, { title, body, data });

  if (!type || !users || users.length === 0) return;

  const docs = users.map(user => ({
    recipient: user._id,
    sender,
    type,
    group,
    meetup,
    poll,
    meta,
    read: false,
  }));

  await Notification.insertMany(docs);
};