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
  deleteSchedule,
  updateModerators,
  toggleModerator,
  generateInviteLink,
  redeemInviteToken,
} from "../controllers/group.controller.js";
import { protectRoute } from "../middleware/auth.middleware.js";
import { getAuth } from "@clerk/express";
import Group from "../models/group.model.js";
import User from "../models/user.model.js";
import { notifyUsers } from "../utils/push.notifications.js";

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


// --- Schedule & Meetups ---
// legacy route, kept for pre-multi-schedule app installs
router.patch("/:groupId/schedule", protectRoute, updateGroupSchedule);
// multi-schedule routes — a group can have several named schedules
router.post("/:groupId/schedules", protectRoute, createSchedule);
router.patch("/:groupId/schedules/:scheduleId", protectRoute, updateSchedule);
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
    const { text, senderName } = req.body;
    if (!text || !senderName) return res.status(400).json({ message: 'text and senderName required' });

    const { userId: senderClerkId } = getAuth(req);

    const group = await Group.findByIdAndUpdate(
      req.params.id,
      { lastMessage: { text, user: { name: senderName }, createdAt: new Date() } },
      { new: true }
    );
    if (!group) return res.status(404).json({ message: 'Group not found' });

    // Fire-and-forget — don't hold up the response for notification delivery
    User.find({
      _id: { $in: group.members },
      clerkId: { $ne: senderClerkId },
      expoPushToken: { $exists: true, $ne: null },
      mutedGroups: { $ne: group._id },
      mutedUntilNextMeetup: { $ne: group._id },
    }).then(recipients => {
      if (recipients.length > 0) {
        notifyUsers(recipients, {
          title: group.name,
          body: `${senderName}: ${text}`,
          data: { type: 'chat', groupId: group._id.toString() },
        });
      }
    }).catch(err => console.error('Chat notification error:', err));

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: 'Internal server error' });
  }
});

// notifies group members of a reaction
router.post("/:id/chat-reaction", protectRoute, async (req, res) => {
  try {
    const { emoji, senderName } = req.body;
    if (!emoji || !senderName) {
      return res.status(400).json({ message: 'emoji and senderName required' });
    }

    const { userId: senderClerkId } = getAuth(req);

    const group = await Group.findById(req.params.id).select('name _id members');
    if (!group) return res.status(404).json({ message: 'Group not found' });

    const recipients = await User.find({
      _id: { $in: group.members },
      clerkId: { $ne: senderClerkId },
      expoPushToken: { $exists: true, $ne: null },
      mutedGroups: { $ne: group._id },
      mutedUntilNextMeetup: { $ne: group._id },
    });

    if (recipients.length > 0) {
      notifyUsers(recipients, {
        title: group.name,
        body: `${senderName} reacted ${emoji} to a message`,
        data: { type: 'chat', groupId: group._id.toString() },
      }).catch(err => console.error('Reaction notification error:', err));
    }

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: 'Internal server error' });
  }
});

export default router;