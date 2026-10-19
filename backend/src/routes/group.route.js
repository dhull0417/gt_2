import express from "express";
import {
  createGroup,
  getGroups,
  getGroupDetails,
  addMember,
  deleteGroup,
  updateGroup,
  leaveGroup,
  removeMember,
  createOneOffMeetup,
  inviteUser,
  updateGroupSchedule,
  createSchedule,
  updateSchedule,
  updateSchedulePriority,
  updateScheduleQuestions,
  getGroupStats,
  updateRsvpResponses,
  exportGroupAttendance,
  deleteSchedule,
  updateModerators,
  toggleModerator,
  transferOwnership,
  generateInviteLink,
  redeemInviteToken,
} from "../controllers/group.controller.js";
import { protectRoute } from "../middleware/auth.middleware.js";
import { getAuth } from "@clerk/express";
import Group from "../models/group.model.js";
import User from "../models/user.model.js";
import { notifyUsers } from "../utils/push.notifications.js";

import mongoose from "mongoose";

// Loads the signed-in user and the group, and confirms the user belongs to it.
// Returns { user, group } or sends the error response and returns null.
const requireGroupMember = async (req, res, select) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    res.status(400).json({ message: 'Invalid group id' });
    return null;
  }
  const { userId: clerkId } = getAuth(req);
  const [user, group] = await Promise.all([
    User.findOne({ clerkId }).select('_id firstName lastName clerkId'),
    Group.findById(id).select(select),
  ]);
  if (!user) { res.status(404).json({ message: 'User not found' }); return null; }
  if (!group) { res.status(404).json({ message: 'Group not found' }); return null; }
  if (!group.members.some((m) => m.equals(user._id))) {
    res.status(403).json({ message: 'You are not a member of this group' });
    return null;
  }
  return { user, group };
};

const displayName = (user, fallback) =>
  [user.firstName, user.lastName].filter(Boolean).join(' ') || String(fallback || '').slice(0, 80) || 'Someone';

const router = express.Router();

// --- Group Management ---
router.get("/", protectRoute, getGroups);
router.post("/create", protectRoute, createGroup);

// find/create 1-on-1 DM group; must precede /:groupId (wildcard collision)
router.post("/dm", protectRoute, async (req, res) => {
  try {
    const { userId: senderClerkId } = getAuth(req);
    const { targetUserId } = req.body;
    if (!targetUserId) return res.status(400).json({ message: "targetUserId required" });

    const sender = await User.findOne({ clerkId: senderClerkId });
    const target = await User.findById(targetUserId);
    if (!sender || !target) return res.status(404).json({ message: "User not found" });
    if (sender._id.equals(target._id)) return res.status(400).json({ message: "Cannot DM yourself" });

    const existing = await Group.findOne({
      isDM: true,
      members: { $all: [sender._id, target._id], $size: 2 },
    });
    if (existing) return res.json({ group: existing, isNew: false });

    const senderName = [sender.firstName, sender.lastName].filter(Boolean).join(" ") || sender.email?.split("@")[0];
    const targetName = [target.firstName, target.lastName].filter(Boolean).join(" ") || target.email?.split("@")[0];

    const dmGroup = await Group.create({
      name: `${senderName} & ${targetName}`,
      isDM: true,
      dmParticipants: [
        { userId: senderClerkId, name: senderName },
        { userId: target.clerkId, name: targetName },
      ],
      owner: sender._id,
      members: [sender._id, target._id],
      timezone: "America/New_York",
    });

    await User.updateMany(
      { _id: { $in: [sender._id, target._id] } },
      { $addToSet: { groups: dmGroup._id } }
    );

    res.status(201).json({ group: dmGroup, isNew: true });
  } catch (err) {
    console.error("DM creation error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});

router.get("/:groupId", protectRoute, getGroupDetails);
router.put("/:groupId", protectRoute, updateGroup);
router.delete("/:groupId", protectRoute, deleteGroup);

// --- Moderator Management ---
router.patch("/:groupId/moderator", protectRoute, toggleModerator);
router.patch("/:groupId/moderators", protectRoute, updateModerators);
router.post("/:groupId/transfer-ownership", protectRoute, transferOwnership);


// --- Schedule & Meetups ---
// legacy route, kept for pre-multi-schedule app installs
router.patch("/:groupId/schedule", protectRoute, updateGroupSchedule);
// multi-schedule routes — a group can have several named schedules
router.post("/:groupId/schedules", protectRoute, createSchedule);
router.patch("/:groupId/schedules/:scheduleId", protectRoute, updateSchedule);
router.put("/:groupId/schedules/:scheduleId/priority", protectRoute, updateSchedulePriority);
router.put("/:groupId/schedules/:scheduleId/questions", protectRoute, updateScheduleQuestions);
router.get("/:groupId/stats", protectRoute, getGroupStats);
router.put("/:groupId/rsvp-responses", protectRoute, updateRsvpResponses);
router.get("/:groupId/stats/export", protectRoute, exportGroupAttendance);
router.delete("/:groupId/schedules/:scheduleId", protectRoute, deleteSchedule);
router.post("/:groupId/meetups", protectRoute, createOneOffMeetup);

// --- Membership & Invites ---
// join/:token must be registered before /:groupId to avoid route collision
router.post("/join/:token", protectRoute, redeemInviteToken);
router.post("/:groupId/add-member", protectRoute, addMember);
router.post("/:groupId/leave", protectRoute, leaveGroup);
router.post("/:groupId/remove-member", protectRoute, removeMember);
router.post("/:groupId/invite", protectRoute, inviteUser);
router.post("/:groupId/invite-link", protectRoute, generateInviteLink);

// updates lastMessage preview and notifies group members
router.patch("/:id/last-message", protectRoute, async (req, res) => {
  try {
    const { text, senderName: clientName } = req.body;
    if (typeof text !== 'string' || !text.trim()) return res.status(400).json({ message: 'text required' });

    // Once the database trigger is delivering chat pushes (and updating lastMessage)
    // through /api/chat/webhook/message, older app versions that still call this
    // endpoint must not notify a second time.
    if (process.env.CHAT_PUSH_MODE === 'webhook') return res.json({ ok: true });

    const ctx = await requireGroupMember(req, res, 'name _id members');
    if (!ctx) return;
    const { user, group: found } = ctx;
    const senderName = displayName(user, clientName);
    const preview = text.slice(0, 500);

    const group = await Group.findByIdAndUpdate(
      found._id,
      { lastMessage: { text: preview, user: { name: senderName, clerkId: user.clerkId }, createdAt: new Date() } },
      { new: true }
    );

    // Awaited: on Vercel, work still running after the response is sent can be dropped.
    try {
      const recipients = await User.find({
        _id: { $in: group.members },
        clerkId: { $ne: user.clerkId },
        expoPushToken: { $exists: true, $ne: null },
        mutedGroups: { $ne: group._id },
        mutedUntilNextMeetup: { $ne: group._id },
      });
      if (recipients.length > 0) {
        await notifyUsers(recipients, {
          title: group.name,
          body: `${senderName}: ${preview}`,
          data: { type: 'chat', groupId: group._id.toString() },
        });
      }
    } catch (err) {
      console.error('Chat notification error:', err);
    }

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: 'Internal server error' });
  }
});

// notifies group members of a reaction
router.post("/:id/chat-reaction", protectRoute, async (req, res) => {
  try {
    const { emoji, senderName: clientName, authorId } = req.body;
    if (typeof emoji !== 'string' || !emoji || emoji.length > 16) {
      return res.status(400).json({ message: 'valid emoji required' });
    }

    const ctx = await requireGroupMember(req, res, 'name _id members');
    if (!ctx) return;
    const { user, group } = ctx;
    const senderName = displayName(user, clientName);

    // Newer apps send the message author's id so only that person is notified.
    // Older apps omit it and keep the previous notify-everyone behavior.
    const onlyAuthor = typeof authorId === 'string' && authorId ? { clerkId: authorId } : {};
    if (onlyAuthor.clerkId === user.clerkId) return res.json({ ok: true });

    const recipients = await User.find({
      _id: { $in: group.members },
      ...(onlyAuthor.clerkId ? { clerkId: onlyAuthor.clerkId } : { clerkId: { $ne: user.clerkId } }),
      expoPushToken: { $exists: true, $ne: null },
      mutedGroups: { $ne: group._id },
      mutedUntilNextMeetup: { $ne: group._id },
    });

    if (recipients.length > 0) {
      try {
        await notifyUsers(recipients, {
          title: group.name,
          body: `${senderName} reacted ${emoji} to ${onlyAuthor.clerkId ? 'your message' : 'a message'}`,
          data: { type: 'chat', groupId: group._id.toString() },
        });
      } catch (err) {
        console.error('Reaction notification error:', err);
      }
    }

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: 'Internal server error' });
  }
});

export default router;