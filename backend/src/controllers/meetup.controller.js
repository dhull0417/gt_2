import asyncHandler from "express-async-handler";
import Meetup from "../models/meetup.model.js";
import User from "../models/user.model.js";
import Group from "../models/group.model.js";
import Notification from "../models/notification.model.js";
import { getAuth } from "@clerk/express";
import mongoose from "mongoose";
import { DateTime } from "luxon";
import { calculateNextMeetupDate } from "../utils/date.utils.js";
import { canManageGroup } from "./group.controller.js";
import { notifyUsers } from "../utils/push.notifications.js";

/**
 * HELPER: parseTimeString
 * Converts "07:00 PM" into { hours: 19, minutes: 0 }
 */
const parseTimeString = (timeStr) => {
    if (!timeStr) return { hours: 9, minutes: 0 };
    const [time, modifier] = timeStr.split(' ');
    let [hours, minutes] = time.split(':').map(Number);
    if (modifier === 'PM' && hours < 12) hours += 12;
    if (modifier === 'AM' && hours === 12) hours = 0;
    return { hours, minutes };
};

/**
 * @desc    Get upcoming meetups for the current user
 */
export const getMeetups = asyncHandler(async (req, res) => {
  const { userId: clerkId } = getAuth(req);
  const currentUser = await User.findOne({ clerkId }).lean();
  if (!currentUser) {
    return res.status(404).json({ error: "User not found." });
  }
  // Fetch meetups from the last 10 days and all upcoming ones, to allow viewing expired meetups.
  const tenDaysAgo = new Date();
  tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);
  tenDaysAgo.setHours(0, 0, 0, 0);

  const meetups = await Meetup.find({
    members: currentUser._id,
    date: { $gte: tenDaysAgo },
  })
  .populate({
      path: "members",
      select: "firstName lastName _id profilePicture",
  })
  .populate({
      path: "group",
      select: "owner moderators",
  })
  .sort({ date: "asc" });

  res.status(200).json(meetups);
});

/**
 * @desc    Edit an existing meetup instance (Owner/Moderator Only)
 * @route   PUT /api/meetups/:meetupId
 */
export const updateMeetup = asyncHandler(async (req, res) => {
    const { userId: clerkId } = getAuth(req);
    const { meetupId } = req.params;
    const { 
        date, 
        time,
        // timezone is intentionally omitted from destructuring
        capacity, 
        location 
    } = req.body; 

    const meetup = await Meetup.findById(meetupId).populate('group');
    const requester = await User.findOne({ clerkId }).lean();
    
    if (!meetup || !requester) return res.status(404).json({ error: "Resource not found." });

    const isPast = new Date(meetup.date) < new Date();
        if (meetup.status === 'cancelled' || meetup.status === 'expired' || isPast) {
            return res.status(400).json({ error: "This event is closed for adjustments." });
        }

    if (!canManageGroup(requester._id, meetup.group)) {
        return res.status(403).json({ error: "Permission denied." });
    }

    // Store old values for notification check
    const oldDateStr = new Date(meetup.date).toLocaleDateString();
    const oldTime = meetup.time;
    const oldLocation = meetup.location;
    const oldCapacity = meetup.capacity;

    // --- The source of truth for timezone is ALWAYS the parent group ---
    const groupTimezone = meetup.group.timezone;

    // --- Partial Update & Validation ---
    const newDate = date || meetup.date;
    const newTime = time || meetup.time;

    // Validate if date/time is being changed to a past date
    if (date || time) {
        const timeParts = parseTimeString(newTime);
        const meetupDateTime = DateTime.fromJSDate(new Date(newDate), { zone: groupTimezone }).set({ hour: timeParts.hours, minute: timeParts.minutes });
        const now = DateTime.now().setZone(groupTimezone);

        if (meetupDateTime < now) {
            return res.status(400).json({ error: "Cannot reschedule an meetup to the past." });
        }
    }

    // Apply updates
    meetup.date = newDate;
    meetup.time = newTime;
    meetup.timezone = groupTimezone; // Always enforce the group's timezone
    if (capacity !== undefined) meetup.capacity = capacity;
    if (location !== undefined) meetup.location = location; 
    
    meetup.isOverride = true;
    await meetup.save();

    // --- Notification Logic ---
    const newDateStr = new Date(meetup.date).toLocaleDateString();
    const dateOrTimeChanged = oldDateStr !== newDateStr || oldTime !== meetup.time;
    const locationChanged = location !== undefined && oldLocation !== meetup.location;
    const capacityChanged = capacity !== undefined && oldCapacity !== meetup.capacity;
    
    const hasChanged = dateOrTimeChanged || locationChanged || capacityChanged;

    if (hasChanged) {
        const membersToNotify = await User.find({ _id: { $in: meetup.members } });
        if (membersToNotify.length > 0) {
            await notifyUsers(membersToNotify, {
                title: `Meetup Updated: ${meetup.name}`,
                body: `The details for "${meetup.name}" have been updated. Tap to see what's new.`,
                data: { meetupId: meetup._id.toString(), type: 'meetup_updated' }
            });
        }
    }

    res.status(200).json({ message: "Meetup updated successfully.", meetup });
});

/**
 * @desc    RSVP to an meetup
 * Refined for Project 6 to handle background interactions and JIT undecided state.
 */
export const handleRsvp = asyncHandler(async (req, res) => {
  const { userId: clerkId } = getAuth(req);
  const { meetupId } = req.params;
  const { status } = req.body; 

  const currentUser = await User.findOne({ clerkId });
  if (!currentUser) return res.status(404).json({ error: "User not found." });

  if (!['in', 'out'].includes(status)) {
    return res.status(400).json({ error: "Invalid RSVP status." });
  }
  if (!mongoose.Types.ObjectId.isValid(meetupId)) {
    return res.status(400).json({ error: "Invalid Meetup ID." });
  }

  
  const meetup = await Meetup.findById(meetupId).populate('group');
  if (!meetup) return res.status(404).json({ error: "Meetup not found." });
  if (meetup.status === 'cancelled' || meetup.status === 'expired') {
    const statusMessage = meetup.status === 'cancelled' ? 'a cancelled' : 'an expired';
    return res.status(400).json({ error: `Cannot RSVP to ${statusMessage} meetup.` });
  }

  const userId = currentUser._id;
  const userIdStr = userId.toString();
  const groupOwnerId = meetup.group.owner;

  // 1. PROJECT 6: Clean move logic
  meetup.in = meetup.in.filter(id => id.toString() !== userIdStr);
  meetup.out = meetup.out.filter(id => id.toString() !== userIdStr);
  meetup.undecided = meetup.undecided.filter(id => id.toString() !== userIdStr);
  meetup.waitlist = meetup.waitlist.filter(id => id.toString() !== userIdStr);

  let responseMessage = "RSVP updated successfully.";
  const isOwner = groupOwnerId.toString() === userIdStr;

  const isPast = new Date(meetup.date) < new Date();
        if (meetup.status === 'cancelled' || meetup.status === 'expired' || isPast) {
            return res.status(400).json({ error: "This event is closed for adjustments." });
        }

  // Prepare recipients (Owner + Moderators - Current User)
  const recipientIds = new Set();
  if (groupOwnerId.toString() !== userIdStr) recipientIds.add(groupOwnerId.toString());
  if (meetup.group.moderators) {
      meetup.group.moderators.forEach(mod => {
          const mId = mod.toString();
          if (mId !== userIdStr) recipientIds.add(mId);
      });
  }
  const notificationRecipients = recipientIds.size > 0 
      ? await User.find({ _id: { $in: Array.from(recipientIds) } }) 
      : [];

  if (status === 'in') {
    const isUnlimited = meetup.capacity === 0;
    const hasSpace = meetup.in.length < meetup.capacity;

    if (isUnlimited || hasSpace) {
      meetup.in.push(userId);
      
      // Notify Owner & Moderators: User Going
      if (notificationRecipients.length > 0) {
          await notifyUsers(notificationRecipients, {
              title: "New RSVP",
              body: `${currentUser.firstName} is going to "${meetup.name}".`,
              data: { meetupId: meetup._id.toString(), type: 'meetup_rsvp' }
          });
          const notifs = notificationRecipients.map(r => ({
              recipient: r._id,
              sender: currentUser._id,
              type: 'meetup-rsvp-in',
              group: meetup.group._id,
              meetup: meetup._id,
              read: false
          }));
          await Notification.insertMany(notifs);
      }
    } else {
      meetup.waitlist.push(userId);
      responseMessage = "Meetup is full. You've been added to the waitlist.";
      
      // Notify Owner & Moderators: User Waitlisted
      if (notificationRecipients.length > 0) {
          await notifyUsers(notificationRecipients, {
              title: "Waitlist Join",
              body: `${currentUser.firstName} joined the waitlist for "${meetup.name}".`,
              data: { meetupId: meetup._id.toString(), type: 'meetup_rsvp' }
          });
          const notifs = notificationRecipients.map(r => ({
              recipient: r._id,
              sender: currentUser._id,
              type: 'meetup-waitlist-join',
              group: meetup.group._id,
              meetup: meetup._id,
              read: false
          }));
          await Notification.insertMany(notifs);
      }
    }
  } else if (status === 'out') {
    meetup.out.push(userId);
    
    // Notify Owner & Moderators: User Out
    if (notificationRecipients.length > 0) {
        await notifyUsers(notificationRecipients, {
            title: "RSVP Update",
            body: `${currentUser.firstName} is out for "${meetup.name}".`,
            data: { meetupId: meetup._id.toString(), type: 'meetup_rsvp' }
        });
        const notifs = notificationRecipients.map(r => ({
            recipient: r._id,
            sender: currentUser._id,
            type: 'meetup-rsvp-out',
            group: meetup.group._id,
            meetup: meetup._id,
            read: false
        }));
        await Notification.insertMany(notifs);
    }

    // 2. Waitlist Promotion Logic
    if (meetup.capacity > 0 && meetup.waitlist.length > 0) {
      const promotedUserId = meetup.waitlist.shift(); 
      meetup.in.push(promotedUserId);

      const promotedUser = await User.findById(promotedUserId);
      if (promotedUser) {
          await notifyUsers([promotedUser], {
              title: "You're off the waitlist!",
              body: `A spot opened up for ${meetup.name}. You are now confirmed!`,
              data: { meetupId: meetup._id.toString(), type: 'waitlist_promotion' }
          });

          // Notify promoted user in-app
          await Notification.create({
              recipient: promotedUser._id,
              sender: groupOwnerId,
              type: 'waitlist-promotion',
              group: meetup.group._id,
              meetup: meetup._id,
              read: false
          });

          // Notify Owner & Moderators: Waitlist Promotion
          // Filter out the promoted user if they happen to be a moderator/owner (they got the personal notif above)
          const promotionAdmins = notificationRecipients.filter(u => u._id.toString() !== promotedUser._id.toString());
          
          if (promotionAdmins.length > 0) {
             await notifyUsers(promotionAdmins, {
                title: "Waitlist Promotion",
                body: `${promotedUser.firstName} was moved from waitlist to going for "${meetup.name}".`,
                data: { meetupId: meetup._id.toString(), type: 'waitlist_promotion' }
             });
             const promoNotifs = promotionAdmins.map(admin => ({
                recipient: admin._id,
                sender: promotedUser._id,
                type: 'waitlist-promotion',
                group: meetup.group._id,
                meetup: meetup._id,
                read: false
            }));
            await Notification.insertMany(promoNotifs);
          }
      }
    }
  }

  console.log(`[RSVP] User ${currentUser.username} (${userIdStr}) set status to '${status}' for meetup ${meetupId}`);

  await meetup.save();
  res.status(200).json({ 
    meetup, 
    message: responseMessage,
    status: status 
  });
});

/**
 * @desc    Cancel an meetup (Owner/Moderator Only)
 */
export const cancelMeetup = asyncHandler(async (req, res) => {
    const { userId: clerkId } = getAuth(req);
    const { meetupId } = req.params;

    const meetup = await Meetup.findById(meetupId).populate('group');
    const requester = await User.findOne({ clerkId }).lean();

    if (!meetup || !requester) return res.status(404).json({ error: "Resource not found." });

    const isPast = new Date(meetup.date) < new Date();
        if (meetup.status === 'cancelled' || meetup.status === 'expired' || isPast) {
            return res.status(400).json({ error: "This event is closed for adjustments." });
        }

    if (!canManageGroup(requester._id, meetup.group)) {
        return res.status(403).json({ error: "Permission denied." });
    }

    if (meetup.status === 'expired') {
        return res.status(400).json({ error: "Cannot cancel a meetup that has already expired." });
    }

    meetup.status = 'cancelled';
    meetup.isOverride = true;
    await meetup.save();

    const membersToNotify = await User.find({ _id: { $in: meetup.members } });
    if (membersToNotify.length > 0) {
        await notifyUsers(membersToNotify, {
            title: "Meetup Cancelled",
            body: `The meetup "${meetup.name}" on ${new Date(meetup.date).toLocaleDateString()} has been cancelled.`,
            data: { meetupId: meetup._id.toString(), type: 'meetup_cancellation' }
        });
    }

    res.status(200).json({ message: "Meetup cancelled successfully.", meetup });
});

/**
 * @desc    Permanently delete an meetup (Owner/Moderator Only)
 * Refined for Project 6: Loops to fill all due recurring spots after deletion.
 */
export const deleteMeetup = asyncHandler(async (req, res) => {
    const { userId: clerkId } = getAuth(req);
    const { meetupId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(meetupId)) {
        return res.status(400).json({ error: "Invalid Meetup ID." });
    }

    const meetup = await Meetup.findById(meetupId).populate('group');
    const requester = await User.findOne({ clerkId }).lean();
    if (!meetup || !requester) return res.status(404).json({ error: "Resource not found." });

    if (!canManageGroup(requester._id, meetup.group)) {
        return res.status(403).json({ error: "Permission denied." });
    }

    const wasRecurring = !meetup.isOverride;
    const parentGroup = meetup.group;

    await Meetup.findByIdAndDelete(meetupId);

    // If we delete the current recurring meetup, fill any gaps that are due by lead time
    if (wasRecurring && parentGroup.schedule) {
        try {
            const now = DateTime.now().setZone(parentGroup.timezone);
            const { hours, minutes } = parseTimeString(parentGroup.generationLeadTime);
            
            let currentAnchor = new Date();
            currentAnchor.setHours(0, 0, 0, 0);

            while (true) {
                const nextDate = calculateNextMeetupDate(
                    parentGroup.schedule.days?.[0] || 0, 
                    parentGroup.time, 
                    parentGroup.timezone,
                    parentGroup.schedule.frequency,
                    currentAnchor
                );

                const nextDT = DateTime.fromJSDate(nextDate).setZone(parentGroup.timezone);
                const triggerDT = nextDT.minus({ days: parentGroup.generationLeadDays || 0 }).set({ hour: hours, minute: minutes, second: 0, millisecond: 0 });

                const exists = await Meetup.findOne({ group: parentGroup._id, date: nextDate });
                
                if (now >= triggerDT && !exists) {
                    const newMeetup = await Meetup.create({
                        group: parentGroup._id,
                        name: parentGroup.name,
                        date: nextDate,
                        time: parentGroup.time,
                        timezone: parentGroup.timezone,
                        location: parentGroup.defaultLocation,
                        members: parentGroup.members,
                        undecided: parentGroup.members,
                        isOverride: false,
                        capacity: parentGroup.defaultCapacity 
                    });

                    // Notify users about the newly created recurring meetup
                    const membersToNotify = await User.find({ _id: { $in: parentGroup.members } });
                    if (membersToNotify.length > 0) {
                        await notifyUsers(membersToNotify, {
                            title: "New Meetup Scheduled",
                            body: `A new meetup for "${parentGroup.name}" has been scheduled for ${new Date(nextDate).toLocaleDateString()}.`,
                            data: { meetupId: newMeetup._id.toString(), type: 'meetup_created', groupId: parentGroup._id.toString() }
                        });
                    }

                    currentAnchor = nextDate;
                } else {
                    break;
                }
            }
        } catch (regenError) {
            console.error("Failed to regenerate meetups after deletion:", regenError);
        }
    }

    res.status(200).json({ message: "Meetup deleted successfully." });
});