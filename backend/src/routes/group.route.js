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
router.get("/:groupId", protectRoute, getGroupDetails);
router.put("/:groupId", protectRoute, updateGroup);
router.delete("/:groupId", protectRoute, deleteGroup);

// --- Moderator Management ---
router.patch("/:groupId/moderator", protectRoute, toggleModerator);
router.patch("/:groupId/moderators", protectRoute, updateModerators); 


// --- Schedule & Meetups ---
// This route handles recurring schedule updates and automatic meetup regeneration
router.patch("/:groupId/schedule", protectRoute, updateGroupSchedule);
router.post("/:groupId/meetups", protectRoute, createOneOffMeetup);

// --- Membership & Invites ---
// join/:token must be registered before /:groupId to avoid route collision
router.post("/join/:token", protectRoute, redeemInviteToken);
router.post("/:groupId/add-member", protectRoute, addMember);
router.post("/:groupId/leave", protectRoute, leaveGroup);
router.post("/:groupId/remove-member", protectRoute, removeMember);
router.post("/:groupId/invite", protectRoute, inviteUser);
router.post("/:groupId/invite-link", protectRoute, generateInviteLink);

// PATCH /api/groups/:id/last-message
// Updates the lastMessage preview and fans out push notifications to group members.
router.patch("/:id/last-message", protectRoute, async (req, res) => {
  try {
    const { text, senderName } = req.body;
    if (!text || !senderName) return res.status(400).json({ message: 'text and senderName required' });

    const { userId: senderClerkId } = getAuth(req);

    const group = await Group.findByIdAndUpdate(
      req.params.id,
      { lastMessage: { text, user: { name: senderName } } },
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

// POST /api/groups/:id/chat-reaction
// Notifies the message owner when someone reacts to their message.
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