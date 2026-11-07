import { Expo } from 'expo-server-sdk';
import User from '../models/user.model.js';
import Notification from '../models/notification.model.js';
import Meetup from '../models/meetup.model.js';
import { flags } from './featureFlags.js';
import { DateTime } from 'luxon';
import { parseTimeString } from './date.utils.js';
import { isMutedFor, muteEntryFor } from './groupMute.js';

const expo = new Expo();

// --- Delivery rules shared by every push -----------------------------------

// Which preference switch (Settings > Notifications) governs each in-app type.
// Types not listed here are always delivered (invites, cancellations, waitlist moves, ...).
const PREF_FOR_TYPE = {
  chat: 'chat',
  'meetup-rsvp-in': 'rsvps',
  'meetup-rsvp-out': 'rsvps',
  'meetup-waitlist-join': 'rsvps',
  'meetup-rsvp-reminder': 'reminders',
  'meetup-rsvp-open': 'reminders',
  'meetup-starting-soon': 'reminders',
  'poll-created': 'polls',
  'poll-closed': 'polls',
};

// Delivered even during a member's quiet hours.
const QUIET_HOURS_EXEMPT = new Set(['meetup-cancelled', 'meetup-starting-soon']);

// Android channel per type, so each can be tuned in system settings. Older app
// builds don't have the new channels and fall back to the default one.
const CHANNEL_FOR_TYPE = {
  chat: 'chat',
  'meetup-rsvp-reminder': 'reminders',
  'meetup-rsvp-open': 'reminders',
  'meetup-starting-soon': 'reminders',
};

// Types that show the "I'm In / I'm Out" action buttons (category registered in the app).
const RSVP_ACTION_TYPES = new Set(['meetup-rsvp-reminder', 'meetup-rsvp-open', 'meetup-created']);

/** Every device token for a user (latest token first, de-duplicated). */
export const tokensOf = (user) => {
  const list = [user?.expoPushToken, ...(user?.expoPushTokens || [])].filter(Boolean);
  return [...new Set(list)];
};

/** Is `now` inside the user's quiet hours (evaluated in their own timezone)? */
export const inQuietHours = (user, now = new Date()) => {
  const q = user?.notificationPrefs?.quietHours;
  if (!q?.enabled) return false;
  try {
    const zone = user.timezone || 'America/Denver';
    const local = DateTime.fromJSDate(now).setZone(zone);
    const minutes = local.hour * 60 + local.minute;
    const s = parseTimeString(q.start || '10:00 PM');
    const e = parseTimeString(q.end || '08:00 AM');
    const start = s.hours * 60 + s.minutes;
    const end = e.hours * 60 + e.minutes;
    if (start === end) return false;
    return start < end ? (minutes >= start && minutes < end) : (minutes >= start || minutes < end);
  } catch {
    return false;
  }
};

/** Applies the member's own settings (per-type switch + quiet hours) to one notification type. */
export const userWantsPush = (user, type, now = new Date()) => {
  const key = PREF_FOR_TYPE[type];
  if (key && user?.notificationPrefs && user.notificationPrefs[key] === false) return false;
  if (type && QUIET_HOURS_EXEMPT.has(type)) return true;
  return !inQuietHours(user, now);
};

/**
 * App 1.3.x behaviour (used until MUTE_ALL_PUSHES_ENABLED is on): a mute quiets only pushes
 * about the group's NEXT meetup. "Next" is by startsAt, since this runs after cancellations
 * and updates are already saved.
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

export const isGroupMuted = (user, groupId) => {
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

    const message = {
      to: pushNotification.to,
      sound: 'default',
      title: pushNotification.title,
      body: pushNotification.body,
      data: pushNotification.data || {},
      priority: 'high',
      channelId: pushNotification.channelId || 'default',
    };
    if (pushNotification.categoryId) message.categoryId = pushNotification.categoryId;
    messages.push(message);
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
            
            console.log(`[Cleanup] Removing invalid push token ending ...${String(invalidToken).slice(-6)}`);
            
            // prevent reuse of the dead token
            await User.updateMany({ expoPushToken: invalidToken }, { $unset: { expoPushToken: "" } });
            await User.updateMany({ expoPushTokens: invalidToken }, { $pull: { expoPushTokens: invalidToken } });
          }
        }
      }
    } catch (error) {
      console.error("Critical error sending notification chunk:", error);
    }
  }

  return tickets;
};

// prepares notifications for a group of users (one push per device token)
export const notifyUsers = async (users, { title, body, data, type }) => {
  const now = new Date();
  const pushType = type || data?.pushType || (data?.type === 'chat' ? 'chat' : undefined);
  // Old app builds only create the 'default' Android channel, so the others wait for the switch.
  const channelId = (flags.pushChannels() && CHANNEL_FOR_TYPE[pushType]) || 'default';
  const categoryId = RSVP_ACTION_TYPES.has(pushType) ? 'EVENT_RSVP' : undefined;

  const notifications = users
    .filter(user => userWantsPush(user, pushType, now))
    .flatMap(user => tokensOf(user).map(token => ({
      to: token,
      title,
      body,
      data,
      channelId,
      categoryId,
    })));

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
  // The person who took the action never gets a notification about it.
  if (sender && users?.length) {
    const senderId = sender.toString();
    users = users.filter(user => user._id.toString() !== senderId);
  }
  if (!users || users.length === 0) return;

  // Every push carries ids for whatever it is about, so tapping it can always open the right screen.
  const pushData = {
    ...(data || {}),
    ...(group && !data?.groupId ? { groupId: group.toString() } : {}),
    ...(meetup && !data?.meetupId ? { meetupId: meetup.toString() } : {}),
    ...(poll && !data?.pollId ? { pollId: poll.toString() } : {}),
    ...(type ? { pushType: type } : {}),
  };

  // Group mutes quiet pushes per kind (the in-app record is still kept); see utils/groupMute.js.
  // Personal events (invites, removals, waitlist moves) are never muted. For mutes set by
  // 1.3.x apps, while MUTE_ALL_PUSHES_ENABLED is off, most kinds are only muted when the
  // push is about the group's next meetup.
  let pushRecipients = users;
  if (group) {
    const muteAll = flags.muteAllPushes();
    // Only look up "is this the next meetup" when someone has a 1.3.x-style mute it matters for.
    const needsNextCheck = !muteAll && !!meetup && users.some(user => isGroupMuted(user, group) && !muteEntryFor(user, group));
    const aboutNextMeetup = needsNextCheck && await isNextUpcomingMeetup(group, meetup);
    pushRecipients = users.filter(user => !isMutedFor(user, group, type, { aboutNextMeetup, muteAll }));
  }

  await notifyUsers(pushRecipients, { title, body, data: pushData, type });

  if (!type) return;

  // Only invitations wait for an answer; everything else is informational.
  const docs = users.map(user => ({
    recipient: user._id,
    sender,
    type,
    group,
    meetup,
    poll,
    meta,
    status: type === 'group-invite' ? 'pending' : 'read',
    read: false,
  }));

  await Notification.insertMany(docs);
};
