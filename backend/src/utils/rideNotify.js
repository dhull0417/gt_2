// Sends the pushes and in-app notifications for ride assignment changes (see utils/rides.js).
import User from "../models/user.model.js";
import { notifyAndPersist } from "./push.notifications.js";
import { rideNotifications } from "./rides.js";

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** Push wording for one entry from rideNotifications. `other` is the other person's first name. */
export const rideNoticeBody = ({ type, role, self, guests }, other, meetupName) => {
  const at = meetupName ? ` to "${meetupName}"` : '';
  if (role === 'rider') {
    const who = self
      ? (guests ? `You and ${plural(guests, 'guest')}` : 'You')
      : `${plural(guests, 'guest')} of yours`;
    const one = !self && guests === 1; // "1 guest of yours is"
    if (type === 'ride-assigned') return `${who} ${one ? 'is' : 'are'} riding with ${other}${at}.`;
    return self
      ? `${who} no longer have a ride${at}. Pick another car on the meetup.`
      : `${who} no longer ${one ? 'has' : 'have'} a ride${at}.`;
  }
  const party = self
    ? (guests ? `${other} and ${plural(guests, 'guest')}` : other)
    : `${plural(guests, 'guest')} of ${other}`;
  const plur = self ? guests > 0 : guests !== 1;
  return type === 'ride-assigned'
    ? `${party} ${plur ? 'are' : 'is'} riding with you${at}.`
    : `${party} ${plur ? 'are' : 'is'} no longer riding with you${at}.`;
};

/**
 * Tells riders and drivers about `changes` made by `actorId` (null = nobody in particular).
 * Never throws: failures are logged so they can't undo a saved change.
 */
export const notifyRideChanges = async (meetup, changes, actorId) => {
  try {
    const notices = rideNotifications(changes, actorId);
    if (!notices.length) return;
    const ids = [...new Set(notices.flatMap((n) => [n.to, n.otherId]))];
    const users = await User.find({ _id: { $in: ids } });
    const byId = new Map(users.map((u) => [String(u._id), u]));
    const nameOf = (id) => byId.get(String(id))?.firstName?.trim() || 'Someone';

    for (const n of notices) {
      const recipient = byId.get(String(n.to));
      if (!recipient) continue;
      const other = nameOf(n.otherId);
      await notifyAndPersist([recipient], {
        title: meetup.name || 'Rides',
        body: rideNoticeBody(n, other, meetup.name),
        data: { meetupId: String(meetup._id), groupId: String(meetup.group?._id ?? meetup.group), type: n.type },
        type: n.type,
        sender: actorId && String(actorId) !== String(n.to) ? actorId : undefined,
        meetup: meetup._id,
        group: meetup.group?._id ?? meetup.group,
        meta: { role: n.role, otherName: other, otherId: String(n.otherId), guests: n.guests, self: n.self },
      });
    }
  } catch (err) {
    console.error('Ride notification failed:', err);
  }
};
