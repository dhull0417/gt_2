import PendingInvite from "../models/pendingInvite.model.js";
import Group from "../models/group.model.js";
import Notification from "../models/notification.model.js";
import { notifyAndPersist } from "./push.notifications.js";

export const PENDING_INVITE_DAYS = 30;

const sameId = (a, b) => a != null && b != null && a.toString() === b.toString();

/**
 * Turns invites sent to this person's (verified) phone number or email before they had an
 * account into ordinary group-invite notifications, then forgets them.
 * Returns how many invitations were created.
 */
export const claimPendingInvites = async (user) => {
  const or = [];
  if (user?.phoneNumber) or.push({ phoneNumber: user.phoneNumber });
  if (user?.email) or.push({ email: String(user.email).toLowerCase() });
  if (or.length === 0) return 0;

  const pending = await PendingInvite.find({ $or: or }).lean();
  if (pending.length === 0) return 0;

  let created = 0;
  const seenGroups = new Set();
  for (const p of pending) {
    const key = String(p.groupId);
    if (seenGroups.has(key)) continue;
    seenGroups.add(key);
    try {
      const group = await Group.findById(p.groupId).select('name members isDM').lean();
      if (!group || group.isDM) continue;
      if ((group.members || []).some((m) => sameId(m, user._id))) continue;
      if (!(group.members || []).some((m) => sameId(m, p.inviter))) continue; // inviter left
      const already = await Notification.exists({ recipient: user._id, group: group._id, type: 'group-invite', status: 'pending' });
      if (already) continue;
      await notifyAndPersist([user], {
        title: group.name,
        body: `You've been invited to join "${group.name}".`,
        data: { groupId: key, type: 'group-invite' },
        type: 'group-invite',
        sender: p.inviter,
        group: group._id,
        meta: { source: 'contact' },
      });
      created++;
    } catch (err) {
      console.error('claimPendingInvites', err?.message);
    }
  }
  await PendingInvite.deleteMany({ _id: { $in: pending.map((p) => p._id) } });
  return created;
};
