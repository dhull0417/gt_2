import express from 'express';
import mongoose from 'mongoose';
import Group from '../models/group.model.js';
import User from '../models/user.model.js';
import { notifyUsers } from '../utils/push.notifications.js';
import { safeEqual, messagePreview, pickRecipients } from '../utils/chatPush.js';

const router = express.Router();

// Called by the database (pg_net trigger on public.messages) for every new chat
// message, so push notifications no longer depend on the sender's phone staying
// online after it sends. Authenticated with a shared secret header, not Clerk.
//
// Must finish its work before responding: on Vercel, anything left running after
// the response is sent can be dropped.
router.post('/webhook/message', async (req, res) => {
  const secret = process.env.CHAT_WEBHOOK_SECRET;
  if (!secret || !safeEqual(req.get('x-webhook-secret'), secret)) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  try {
    const record = req.body?.record;
    if (req.body?.type !== 'INSERT' || !record || record.kind === 'system') {
      return res.json({ ok: true, skipped: true });
    }
    if (!mongoose.Types.ObjectId.isValid(record.group_id)) {
      return res.json({ ok: true, skipped: true });
    }

    const preview = messagePreview(record);
    if (!preview) return res.json({ ok: true, skipped: true });

    const senderName = String(record.sender_name || 'Someone').slice(0, 80);

    // Keep the group list's "last message" line current.
    const group = await Group.findByIdAndUpdate(
      record.group_id,
      {
        lastMessage: {
          text: preview,
          user: { name: senderName, clerkId: record.sender_id },
          createdAt: record.created_at ? new Date(record.created_at) : new Date(),
        },
      },
      { new: true, select: 'name members' }
    );
    if (!group) return res.json({ ok: true, skipped: true });

    const members = await User.find({
      _id: { $in: group.members },
      expoPushToken: { $exists: true, $ne: null },
    }).select('clerkId expoPushToken mutedGroups mutedUntilNextMeetup');

    const { normal, mention } = pickRecipients(members, {
      senderClerkId: record.sender_id,
      mentions: record.mentions,
      groupId: group._id,
    });

    const data = { type: 'chat', groupId: group._id.toString() };
    await Promise.all([
      normal.length
        ? notifyUsers(normal, { title: group.name, body: `${senderName}: ${preview}`, data })
        : null,
      mention.length
        ? notifyUsers(mention, { title: group.name, body: `${senderName} mentioned you: ${preview}`, data })
        : null,
    ]);

    res.json({ ok: true });
  } catch (err) {
    console.error('Chat webhook error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

export default router;
