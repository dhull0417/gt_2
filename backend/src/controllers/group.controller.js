import asyncHandler from "express-async-handler";
import Group from "../models/group.model.js";
import User from "../models/user.model.js";
import Meetup from "../models/meetup.model.js";
import Notification from "../models/notification.model.js";
import InviteToken from "../models/inviteToken.model.js";
import Poll from "../models/poll.model.js";
import AttendanceRecord from "../models/attendanceRecord.model.js";
import { getAuth } from "@clerk/express";
import mongoose from "mongoose";
import crypto from "crypto";
import { calculateNextMeetupDate } from "../utils/date.utils.js";
import { DateTime } from "luxon";
import { resolveZone } from "../utils/email/lifecycle.js";
import { generateMeetupsForGroup, generateMeetupsForSchedule, reconcileScheduleMeetups } from "../utils/meetupGeneration.js";
import { promoteWaitlist } from "../utils/waitlist.js";
import { scrubMemberFromUpcomingMeetups } from "../utils/memberCleanup.js";
import { addChatMembers, removeChatMember, removeAllChatMembers, purgeGroupChat } from "../utils/supabaseAdmin.js";
import { notifyAndPersist } from "../utils/push.notifications.js";
import { buildGroupStats, buildAttendanceCsv } from "../utils/groupStats.js";
import { parseQuestions, refreshSeriesQuestions } from "../utils/rsvpQuestions.js";
import { refreshPriorityTiers, MAX_PRIORITY_TIERS, MAX_WINDOW_MINUTES } from "../utils/priorityRsvp.js";
import { hasPremium, groupHasPremium } from "../utils/premium.js";
import { onGroupCreated, onInviteRedeemed } from "../utils/email/lifecycle.js";
import { postSystemMessage } from "../utils/systemMessage.js";
import { isLegacyClient } from "../middleware/clientInfo.middleware.js";

const isValidId = (id) => mongoose.Types.ObjectId.isValid(String(id)) && String(new mongoose.Types.ObjectId(String(id))) === String(id);

/** Offers the meetups-capacity change to anyone waiting: capacity went up (or became unlimited). */
const promoteWaitlistsForSchedule = async (groupId, scheduleId) => {
    const waiting = await Meetup.find({
        group: groupId,
        schedule: scheduleId,
        status: 'scheduled',
        date: { $gte: new Date() },
        'waitlist.0': { $exists: true },
    }).select('_id').lean();
    for (const { _id } of waiting) {
        try { await promoteWaitlist(_id); } catch (err) { console.error("Waitlist promotion failed:", err); }
    }
};

// --- Helpers ---

// Distinguishes "field omitted" (use fallback) from "field explicitly cleared to
// unrestricted" (keep null) — a bare Number(null) would otherwise coerce to 0.
const numOrNull = (v, fallback) => v === undefined ? fallback : (v === null ? null : Number(v));

// A moderator/owner change lives on the Group doc, but clients cache a
// populated `group` snapshot embedded on each Meetup for permission checks
// (canManage, etc). That snapshot only gets re-fetched via the mobile app's
// delta-sync, which is keyed off the meetup's own `updatedAt` — so without
// this, a promoted moderator's embedded copy would never refresh. Only
// touches upcoming meetups since past ones aren't actionable anyway.
const touchGroupMeetups = (groupId) =>
    Meetup.updateMany({ group: groupId, date: { $gte: new Date() } }, { $set: { updatedAt: new Date() } });

// --- Multi-schedule helpers ---

const MAX_ACTIVE_SCHEDULES = 5;

/**
 * Minimum headcount is checked at the RSVP deadline, so it needs one, and it
 * can't exceed the capacity. Returns { status, body } to respond with, or
 * null when the values are fine. (Premium is checked separately.)
 */
const minHeadcountProblem = ({ min, capacity, deadlineDays }) => {
    if (!min) return null;
    if (!Number.isInteger(min) || min < 1) {
        return { status: 400, body: { error: "Minimum headcount must be a whole number of at least 1." } };
    }
    if (deadlineDays == null) {
        return { status: 400, body: { error: "Set an RSVP deadline to use a minimum headcount." } };
    }
    if (capacity > 0 && min > capacity) {
        return { status: 400, body: { error: "Minimum headcount can't be higher than the maximum attendees." } };
    }
    return null;
};

const MIN_HEADCOUNT_PREMIUM_REQUIRED = {
    error: "premium_required",
    message: "Minimum headcount requires GroupThat Premium.",
};

const MAX_BRING_ITEMS = 20;

const ASSIGNMENTS_PREMIUM_REQUIRED = {
    error: "premium_required",
    message: "Meetup assignments require GroupThat Premium.",
};

/**
 * Validates the "things to bring" list from a request. `max` is optional (null =
 * as many as people want to bring). Returns { items } or { error }.
 */
const parseBringItems = (raw) => {
    if (raw == null) return { items: [] };
    if (!Array.isArray(raw)) return { error: "Items to bring must be a list." };
    if (raw.length > MAX_BRING_ITEMS) return { error: `You can list at most ${MAX_BRING_ITEMS} items.` };
    const seen = new Set();
    const items = [];
    for (const r of raw) {
        const name = String(r?.name ?? "").trim();
        if (!name) return { error: "Each item needs a name." };
        if (name.length > 40) return { error: "Item names can be at most 40 characters." };
        const key = name.toLowerCase();
        if (seen.has(key)) return { error: `"${name}" is listed twice.` };
        seen.add(key);
        let max = null;
        if (r.max !== null && r.max !== undefined && r.max !== "") {
            max = Number(r.max);
            if (!Number.isInteger(max) || max < 1 || max > 99) {
                return { error: `The number for "${name}" must be a whole number from 1 to 99.` };
            }
        }
        items.push({ _id: r._id, name, max });
    }
    return { items };
};

// Keeps an item's _id only when it already exists on the series, so claims
// follow edits to the same item and clients can't mint ids.
const withExistingIds = (items, existing = []) => {
    const known = new Set(existing.map((i) => i._id.toString()));
    return items.map((i) => ({
        ...(i._id && known.has(String(i._id)) ? { _id: i._id } : {}),
        name: i.name,
        max: i.max,
    }));
};

const assignmentsSignature = (items, rides) =>
    JSON.stringify([(items || []).map((i) => [i.name, i.max ?? null]), !!rides]);

/**
 * Normalizes a request body into the namedSchedule shape stored on
 * Group.schedules; used by per-schedule endpoints and the legacy wrapper.
 */
const normalizeScheduleInput = (input, fallbackName) => ({
    name: (input.name && String(input.name).trim()) || fallbackName || "Schedule",
    startDate: input.startDate || null,
    routines: input.routines || [],
    defaultLocation: input.defaultLocation || "",
    defaultCapacity: input.defaultCapacity || 0,
    defaultMinAttendees: Number(input.defaultMinAttendees) || 0,
    defaultBringItems: withExistingIds(parseBringItems(input.defaultBringItems).items || []),
    defaultRidesEnabled: !!input.defaultRidesEnabled,
    defaultDescription: input.defaultDescription || "",
    generationLeadDays: numOrNull(input.generationLeadDays, 1),
    generationLeadTime: input.generationLeadTime || "09:00 AM",
    generationDeadlineDays: numOrNull(input.generationDeadlineDays, null),
    generationDeadlineTime: input.generationDeadlineTime || "09:00 AM",
    active: true,
});

/**
 * Mirrors the first active schedule onto legacy top-level group fields
 * (schedule, generationLeadDays/Time, etc.) so pre-multi-schedule app
 * installs keep working. Applied to lean objects before sending. Remove
 * once the old client shape is no longer supported.
 */
const withLegacyScheduleMirror = (groupObj) => {
    const primary = groupObj.schedules?.find(s => s.active !== false) || null;
    return {
        ...groupObj,
        schedule: primary ? { startDate: primary.startDate, routines: primary.routines } : null,
        generationLeadDays: primary ? primary.generationLeadDays : null,
        generationLeadTime: primary ? primary.generationLeadTime : "09:00 AM",
        generationDeadlineDays: primary ? primary.generationDeadlineDays : null,
        generationDeadlineTime: primary ? primary.generationDeadlineTime : "09:00 AM",
    };
};

/**
 * DM groups store a snapshot of each person's name from when the chat was created. Replace it with
 * the people's current name and photo so a rename or new profile picture shows up right away.
 * Works on a list of lean group objects and returns new objects.
 */
export const withLiveDmParticipants = async (groups) => {
    const dms = groups.filter((g) => g.isDM && Array.isArray(g.dmParticipants) && g.dmParticipants.length);
    if (dms.length === 0) return groups;
    const clerkIds = [...new Set(dms.flatMap((g) => g.dmParticipants.map((p) => p.userId)).filter(Boolean))];
    const users = await User.find({ clerkId: { $in: clerkIds } }).select('clerkId firstName lastName profilePicture').lean();
    const byClerk = new Map(users.map((u) => [u.clerkId, u]));
    return groups.map((g) => {
        if (!g.isDM || !Array.isArray(g.dmParticipants)) return g;
        return {
            ...g,
            dmParticipants: g.dmParticipants.map((p) => {
                const u = byClerk.get(p.userId);
                if (!u) return p;
                const name = [u.firstName, u.lastName].filter(Boolean).join(' ');
                return { ...p, name: name || p.name, profilePicture: u.profilePicture || undefined };
            }),
        };
    });
};

/**
 * HELPER: canManageGroup
 * Checks if the user is the primary owner or in the moderator list.
 */
export const canManageGroup = (userId, group) => {
    if (!userId || !group) return false;
    const isOwner = group.owner.toString() === userId.toString();
    const isMod = group.moderators?.some(id => id.toString() === userId.toString());
    return isOwner || isMod;
};

/**
 * HELPER: canManageMember
 * Owner can manage anyone. A moderator can manage regular members only —
 * not the owner, and not another moderator.
 */
export const canManageMember = (requesterId, targetUserId, group) => {
    if (!canManageGroup(requesterId, group)) return false;
    if (group.owner.toString() === requesterId.toString()) return true;
    const targetIsOwner = group.owner.toString() === targetUserId.toString();
    const targetIsMod = group.moderators?.some(id => id.toString() === targetUserId.toString());
    return !targetIsOwner && !targetIsMod;
};

/**
 * @desc    Create a new group
 */
export const createGroup = asyncHandler(async (req, res) => {
  const { userId: clerkId } = getAuth(req);
  const {
    name,
    image,
    schedule,   // legacy singular payload — pre-multi-schedule app clients
    schedules,  // current payload — array of named schedules (usually 0 or 1 at create time)
    timezone,
    meetupsToDisplay,
    members,
    defaultCapacity,
    defaultLocation,
    defaultDescription,
    generationLeadDays,
    generationLeadTime,
    generationDeadlineDays,
    generationDeadlineTime
  } = req.body;

  if (!name || !timezone) {
    return res.status(400).json({ error: "Name and Timezone are required." });
  }

  const owner = await User.findOne({ clerkId });
  if (!owner) return res.status(404).json({ error: "User not found." });

  // Only the creator is a member at first. Anyone listed in `members` is sent an
  // invitation they can accept or decline, rather than being added without a say.
  // App 1.3.x and older still add the picked people straight away, as their screens promise.
  const legacyDirectAdd = isLegacyClient(req);
  const pickedIds = [...new Set(Array.isArray(members) ? members.map(String) : [])]
      .filter((id) => isValidId(id) && id !== owner._id.toString())
      .slice(0, 100);
  const addedUsers = legacyDirectAdd && pickedIds.length > 0
      ? await User.find({ _id: { $in: pickedIds } })
      : [];
  const uniqueMemberIds = [owner._id.toString(), ...addedUsers.map((u) => u._id.toString())];
  const inviteeIds = legacyDirectAdd ? [] : pickedIds;

  // new clients send `schedules`; legacy clients send a single `schedule` +
  // top-level fields — wrap both into the same Group.schedules array.
  let initialSchedules = [];
  if (Array.isArray(schedules) && schedules.length > 0) {
      initialSchedules = schedules.slice(0, MAX_ACTIVE_SCHEDULES).map(s => normalizeScheduleInput(s, name));
  } else if (schedule?.routines?.length) {
      initialSchedules = [normalizeScheduleInput({
          name,
          startDate: schedule.startDate,
          routines: schedule.routines,
          defaultLocation,
          defaultCapacity,
          defaultDescription,
          generationLeadDays,
          generationLeadTime,
          generationDeadlineDays,
          generationDeadlineTime,
      }, name)];
  }

  for (const s of initialSchedules) {
      const problem = minHeadcountProblem({
          min: s.defaultMinAttendees,
          capacity: s.defaultCapacity,
          deadlineDays: s.generationDeadlineDays,
      });
      if (problem) return res.status(problem.status).json(problem.body);
      if (s.defaultMinAttendees > 0 && !hasPremium(owner)) {
          return res.status(403).json(MIN_HEADCOUNT_PREMIUM_REQUIRED);
      }
      if ((s.defaultBringItems.length > 0 || s.defaultRidesEnabled) && !hasPremium(owner)) {
          return res.status(403).json(ASSIGNMENTS_PREMIUM_REQUIRED);
      }
  }

  const groupData = {
      name,
      image: image || "",
      schedules: initialSchedules,
      timezone,
      meetupsToDisplay: meetupsToDisplay || 1,
      owner: owner._id,
      members: uniqueMemberIds,
      defaultCapacity: defaultCapacity || 0,
      defaultLocation: defaultLocation || "",
      moderators: []
  };

  const newGroup = await Group.create(groupData);

  await User.updateMany(
      { _id: { $in: uniqueMemberIds } },
      { $addToSet: { groups: newGroup._id } }
  );

  await addChatMembers(newGroup._id, [owner.clerkId, ...addedUsers.map((u) => u.clerkId).filter(Boolean)]);

  // App 1.3.x: the people it added directly are told, as they always have been.
  if (addedUsers.length > 0) {
      await notifyAndPersist(addedUsers, {
          title: "You've been added to a group!",
          body: `${owner.firstName} ${owner.lastName} added you to the group "${newGroup.name}".`,
          data: { groupId: newGroup._id.toString(), type: 'group_added' },
          type: 'group-added',
          sender: owner._id,
          group: newGroup._id,
      });
  }

  // --- INVITATIONS ---
  if (inviteeIds.length > 0) {
      const invitees = await User.find({ _id: { $in: inviteeIds } });
      if (invitees.length > 0) {
          await notifyAndPersist(invitees, {
              title: "Group Invitation",
              body: `${owner.firstName} invited you to join "${newGroup.name}".`,
              data: { groupId: newGroup._id.toString(), type: 'group-invite' },
              type: 'group-invite',
              sender: owner._id,
              group: newGroup._id,
          });
      }
  }
  // --- END INVITATIONS ---

  // Initial Generation with Window Filling
  if (newGroup.schedules?.length) {
    try {
      await generateMeetupsForGroup(newGroup);
    } catch (err) { console.error("Initial Gen Error:", err); }
  }

  // Lifecycle emails: records the first group and sends the "You made a group!" email. Never throws.
  await onGroupCreated(owner._id, newGroup._id);

  res.status(201).json({ group: withLegacyScheduleMirror(newGroup.toObject()), message: "Created successfully." });
});

/**
 * @desc    LEGACY shim: applies the edit to the group's first active schedule
 *          (creating one if none exist), for pre-multi-schedule clients.
 *          Current clients use createSchedule/updateSchedule instead.
 * @route   PATCH /api/groups/:groupId/schedule
 */
/**
 * @desc    Creates a sample group (with one sample meetup) so someone with no invite can try the
 *          app straight away. A person gets at most one; asking again returns it.
 * @route   POST /api/groups/demo
 */
export const createDemoGroup = asyncHandler(async (req, res) => {
    const { userId: clerkId } = getAuth(req);
    const owner = await User.findOne({ clerkId });
    if (!owner) return res.status(404).json({ error: "User not found." });

    const existing = await Group.findOne({ owner: owner._id, isDemo: true });
    if (existing) return res.status(200).json({ group: withLegacyScheduleMirror(existing.toObject()), alreadyExisted: true });

    const timezone = (owner.timezone && resolveZone(owner.timezone)) || "America/Denver";
    const group = await Group.create({
        name: "Sample Group",
        image: "",
        timezone,
        owner: owner._id,
        members: [owner._id],
        schedules: [],
        isDemo: true,
        defaultLocation: "",
    });
    await User.updateOne({ _id: owner._id }, { $addToSet: { groups: group._id } });
    await addChatMembers(group._id, [owner.clerkId]);

    // A sample meetup the coming Saturday at 10:00 AM (a week later if that is too close).
    let when = DateTime.now().setZone(timezone).set({ hour: 10, minute: 0, second: 0, millisecond: 0 });
    while (when.weekday !== 6 || when < DateTime.now().plus({ days: 2 })) when = when.plus({ days: 1 });
    const meetup = await Meetup.create({
        group: group._id,
        schedule: null,
        name: "Sample Meetup",
        date: when.toJSDate(),
        startsAt: when.toJSDate(),
        time: "10:00 AM",
        timezone,
        location: "Anywhere you like",
        description: "This is a sample meetup. Tap I'm In, try the chat, then invite your real group from Group Settings. You can delete this group any time.",
        members: [owner._id],
        undecided: [owner._id],
        capacity: 0,
        isOverride: true,
        createdBy: owner._id,
    });
    await postSystemMessage(group._id, "Welcome to GroupThat! This sample group is yours to play with.");

    res.status(201).json({ group: withLegacyScheduleMirror(group.toObject()), meetupId: meetup._id });
});

export const updateGroupSchedule = asyncHandler(async (req, res) => {
    const { groupId } = req.params;
    const { schedule, timezone, defaultCapacity, defaultLocation } = req.body;
    const { userId: clerkId } = getAuth(req);

    const group = await Group.findById(groupId);
    const user = await User.findOne({ clerkId });

    if (!group || !user) return res.status(404).json({ error: "Resource not found." });
    if (!canManageGroup(user._id, group)) return res.status(403).json({ error: "Permission denied." });

    if (timezone) group.timezone = timezone;
    if (defaultCapacity !== undefined) group.defaultCapacity = Number(defaultCapacity);
    if (defaultLocation !== undefined) group.defaultLocation = defaultLocation;

    let target = group.schedules.find(s => s.active !== false);
    if (!target && schedule?.routines?.length) {
        group.schedules.push(normalizeScheduleInput({
            name: group.name,
            startDate: schedule.startDate,
            routines: schedule.routines,
            defaultLocation,
            defaultCapacity,
        }, group.name));
        target = group.schedules[group.schedules.length - 1];
    } else if (target && schedule) {
        target.startDate = schedule.startDate || target.startDate;
        target.routines = schedule.routines || target.routines;
        if (defaultLocation !== undefined) target.defaultLocation = defaultLocation;
        if (defaultCapacity !== undefined) target.defaultCapacity = Number(defaultCapacity);
    }

    if (target && defaultLocation) {
        // sync auto-generated meetups to the new location, plus overrides with
        // no location of their own; overrides with one already set are untouched.
        await Meetup.updateMany(
            {
                group: group._id,
                schedule: target._id,
                $or: [
                    { isOverride: false },
                    { location: { $in: ["", null] } },
                ],
            },
            { $set: { location: defaultLocation } }
        );
    }

    await group.save();

    if (target) {
        try {
            // Keeps meetups whose slot is unchanged (and their RSVPs); only removed slots go.
            await reconcileScheduleMeetups(group, target);
            await generateMeetupsForGroup(group);
        } catch (err) {
            console.error("Update Gen Error:", err);
        }
    }

    res.status(200).json({ message: "Schedule updated.", group: withLegacyScheduleMirror(group.toObject()) });
});

/**
 * @desc    Create a new named schedule on a group (e.g. "Monthly Camping"),
 *          independent of any other schedules the group already has.
 * @route   POST /api/groups/:groupId/schedules
 */
export const createSchedule = asyncHandler(async (req, res) => {
    const { groupId } = req.params;
    const { userId: clerkId } = getAuth(req);
    const {
        name, startDate, routines, defaultLocation, defaultCapacity, defaultMinAttendees, defaultDescription,
        defaultBringItems, defaultRidesEnabled,
        generationLeadDays, generationLeadTime, generationDeadlineDays, generationDeadlineTime,
        timezone, // shared across the whole group, not per-schedule — see updateSchedule
    } = req.body;

    const group = await Group.findById(groupId);
    const user = await User.findOne({ clerkId });
    if (!group || !user) return res.status(404).json({ error: "Resource not found." });
    if (!canManageGroup(user._id, group)) return res.status(403).json({ error: "Permission denied." });

    const minAttendees = Number(defaultMinAttendees) || 0;
    const minProblem = minHeadcountProblem({
        min: minAttendees,
        capacity: Number(defaultCapacity) || 0,
        deadlineDays: numOrNull(generationDeadlineDays, null),
    });
    if (minProblem) return res.status(minProblem.status).json(minProblem.body);
    // Premium belongs to the group's owner, even when a moderator makes the edit.
    if (minAttendees > 0 && !(await groupHasPremium(group))) {
        return res.status(403).json(MIN_HEADCOUNT_PREMIUM_REQUIRED);
    }

    const parsedItems = parseBringItems(defaultBringItems);
    if (parsedItems.error) return res.status(400).json({ error: parsedItems.error });
    if ((parsedItems.items.length > 0 || defaultRidesEnabled) && !(await groupHasPremium(group))) {
        return res.status(403).json(ASSIGNMENTS_PREMIUM_REQUIRED);
    }

    if (!name || !String(name).trim()) {
        return res.status(400).json({ error: "Schedule name is required." });
    }

    // Guards against a double-fired create (a mistimed double-tap, or a
    // client-side retry) pushing two identical schedules: a legitimate second
    // series with the same name+routines wouldn't be resubmitted seconds
    // later, so a near-instant repeat is treated as the same request landing
    // twice. Checked before the MAX_ACTIVE_SCHEDULES cap below so a retry that
    // arrives after the original already filled the last slot doesn't get
    // rejected with a false "too many schedules" error.
    const trimmedName = String(name).trim();
    const routinesKey = JSON.stringify(routines || []);
    const recentDuplicate = group.schedules.find(s =>
        s.active !== false &&
        s.name === trimmedName &&
        JSON.stringify(s.routines || []) === routinesKey &&
        Date.now() - new Date(s.createdAt).getTime() < 10000
    );
    if (recentDuplicate) {
        return res.status(200).json({ message: "Schedule created.", group: withLegacyScheduleMirror(group.toObject()), scheduleId: recentDuplicate._id });
    }

    const activeCount = group.schedules.filter(s => s.active !== false).length;
    if (activeCount >= MAX_ACTIVE_SCHEDULES) {
        return res.status(400).json({ error: `A group can have at most ${MAX_ACTIVE_SCHEDULES} active schedules.` });
    }

    if (timezone) group.timezone = timezone;

    group.schedules.push(normalizeScheduleInput(
        { name, startDate, routines, defaultLocation, defaultCapacity, defaultMinAttendees, defaultDescription, defaultBringItems, defaultRidesEnabled, generationLeadDays, generationLeadTime, generationDeadlineDays, generationDeadlineTime },
        name
    ));
    await group.save();

    const created = group.schedules[group.schedules.length - 1];

    if (created.routines?.length) {
        try {
            await generateMeetupsForSchedule(group, created);
            await group.save();
        } catch (err) {
            console.error("Create Schedule Gen Error:", err);
        }
    }

    res.status(201).json({ message: "Schedule created.", group: withLegacyScheduleMirror(group.toObject()), scheduleId: created._id });
});

/**
 * @desc    Updates one named schedule's settings; regenerates only that
 *          schedule's future non-override meetups (siblings untouched).
 * @route   PATCH /api/groups/:groupId/schedules/:scheduleId
 */
export const updateSchedule = asyncHandler(async (req, res) => {
    const { groupId, scheduleId } = req.params;
    const { userId: clerkId } = getAuth(req);
    const {
        name, startDate, routines, defaultLocation, defaultCapacity, defaultMinAttendees, defaultDescription,
        defaultBringItems, defaultRidesEnabled,
        generationLeadDays, generationLeadTime, generationDeadlineDays, generationDeadlineTime,
        timezone, // shared across the whole group — schedules don't carry their own
    } = req.body;

    const group = await Group.findById(groupId);
    const user = await User.findOne({ clerkId });
    if (!group || !user) return res.status(404).json({ error: "Resource not found." });
    if (!canManageGroup(user._id, group)) return res.status(403).json({ error: "Permission denied." });

    const target = group.schedules.id(scheduleId);
    if (!target || target.active === false) return res.status(404).json({ error: "Schedule not found." });

    // Validate the minimum headcount against the values as they'll be AFTER this
    // edit, before anything is changed. Premium is only required when the minimum
    // itself is being turned on or raised, so a lapsed owner can still edit
    // everything else (and turn the minimum off).
    const currentMin = target.defaultMinAttendees || 0;
    const newMin = defaultMinAttendees !== undefined ? (Number(defaultMinAttendees) || 0) : currentMin;
    const minProblem = minHeadcountProblem({
        min: newMin,
        capacity: defaultCapacity !== undefined ? Number(defaultCapacity) : (target.defaultCapacity || 0),
        deadlineDays: generationDeadlineDays !== undefined
            ? numOrNull(generationDeadlineDays, null)
            : (target.generationDeadlineDays ?? null),
    });
    if (minProblem) return res.status(minProblem.status).json(minProblem.body);
    if (newMin > currentMin && !(await groupHasPremium(group))) {
        return res.status(403).json(MIN_HEADCOUNT_PREMIUM_REQUIRED);
    }

    // Assignments (things to bring, rides): Premium is only required when the setup
    // is being changed to something non-empty, so a lapsed owner can still clear it.
    let newBringItems = null;
    if (defaultBringItems !== undefined) {
        const parsed = parseBringItems(defaultBringItems);
        if (parsed.error) return res.status(400).json({ error: parsed.error });
        newBringItems = withExistingIds(parsed.items, target.defaultBringItems);
    }
    const newRidesEnabled = defaultRidesEnabled !== undefined ? !!defaultRidesEnabled : !!target.defaultRidesEnabled;
    const nextItems = newBringItems ?? target.defaultBringItems;
    const assignmentsChanged =
        assignmentsSignature(nextItems, newRidesEnabled) !==
        assignmentsSignature(target.defaultBringItems, target.defaultRidesEnabled);
    if (assignmentsChanged && (nextItems.length > 0 || newRidesEnabled) && !(await groupHasPremium(group))) {
        return res.status(403).json(ASSIGNMENTS_PREMIUM_REQUIRED);
    }

    const previousTimezone = group.timezone;
    if (timezone) group.timezone = timezone;

    if (name !== undefined) {
        if (!String(name).trim()) return res.status(400).json({ error: "Schedule name cannot be empty." });
        target.name = name.trim();
        // Keep already-generated future meetups' display name in sync with a rename.
        await Meetup.updateMany(
            { group: group._id, schedule: target._id, date: { $gte: new Date() } },
            { $set: { name: target.name } }
        );
    }
    if (startDate !== undefined) target.startDate = startDate;
    if (routines !== undefined) target.routines = routines;
    if (defaultCapacity !== undefined) target.defaultCapacity = Number(defaultCapacity);
    if (defaultMinAttendees !== undefined) target.defaultMinAttendees = newMin;
    if (newBringItems) target.defaultBringItems = newBringItems;
    if (defaultRidesEnabled !== undefined) target.defaultRidesEnabled = newRidesEnabled;
    if (defaultLocation !== undefined) {
        target.defaultLocation = defaultLocation;
        if (defaultLocation) {
            await Meetup.updateMany(
                {
                    group: group._id,
                    schedule: target._id,
                    $or: [{ isOverride: false }, { location: { $in: ["", null] } }],
                },
                { $set: { location: defaultLocation } }
            );
        }
    }
    if (defaultDescription !== undefined) {
        target.defaultDescription = defaultDescription;
        if (defaultDescription) {
            await Meetup.updateMany(
                {
                    group: group._id,
                    schedule: target._id,
                    $or: [{ isOverride: false }, { description: { $in: ["", null] } }],
                },
                { $set: { description: defaultDescription } }
            );
        }
    }
    if (generationLeadDays !== undefined) target.generationLeadDays = numOrNull(generationLeadDays, null);
    if (generationLeadTime !== undefined) target.generationLeadTime = generationLeadTime;
    if (generationDeadlineDays !== undefined) target.generationDeadlineDays = numOrNull(generationDeadlineDays, null);
    if (generationDeadlineTime !== undefined) target.generationDeadlineTime = generationDeadlineTime;

    await group.save();

    // Update the series' upcoming meetups IN PLACE: slots that still belong to the series keep
    // their RSVPs, guests, items and answers; only slots that no longer exist are removed.
    // (A timezone change moves every slot, so that one case starts the series over.)
    try {
        await reconcileScheduleMeetups(group, target, { resetAll: !!timezone && timezone !== previousTimezone });
    } catch (err) {
        console.error("Update Schedule Reconcile Error:", err);
    }
    try {
        // RSVP open times may have moved, so priority groups' times move with them.
        await refreshPriorityTiers(group, target);
    } catch (err) {
        console.error("Update Schedule Priority Refresh Error:", err);
    }
    // A bigger (or removed) limit lets people off the waitlist.
    if (defaultCapacity !== undefined) {
        await promoteWaitlistsForSchedule(group._id, target._id);
    }

    if (target.routines?.length) {
        try {
            await generateMeetupsForSchedule(group, target);
            await group.save();
        } catch (err) {
            console.error("Update Schedule Gen Error:", err);
        }
    }

    res.status(200).json({ message: "Schedule updated.", group: withLegacyScheduleMirror(group.toObject()) });
});

/**
 * @desc    Removes a schedule: permanently deletes its future non-override
 *          meetups (they drop off the meetup tab entirely, not just shown as
 *          cancelled) and notifies members. Past meetups are left alone.
 * @route   DELETE /api/groups/:groupId/schedules/:scheduleId
 */
export const deleteSchedule = asyncHandler(async (req, res) => {
    const { groupId, scheduleId } = req.params;
    const { userId: clerkId } = getAuth(req);

    const group = await Group.findById(groupId);
    const requester = await User.findOne({ clerkId }).lean();
    if (!group || !requester) return res.status(404).json({ error: "Resource not found." });
    if (!canManageGroup(requester._id, group)) return res.status(403).json({ error: "Permission denied." });

    const target = group.schedules.id(scheduleId);
    if (!target || target.active === false) return res.status(404).json({ error: "Schedule not found." });

    target.active = false;
    await group.save();

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const futureMeetups = await Meetup.find({
        group: group._id,
        schedule: target._id,
        isOverride: false,
        status: 'scheduled',
        date: { $gte: today },
    });

    if (futureMeetups.length > 0) {
        await Meetup.deleteMany({ _id: { $in: futureMeetups.map(m => m._id) } });

        const membersToNotify = await User.find({ _id: { $in: group.members } });
        if (membersToNotify.length > 0) {
            await notifyAndPersist(membersToNotify, {
                title: "Schedule Removed",
                body: `"${target.name}" was removed from "${group.name}" — its upcoming meetups have been deleted.`,
                data: { groupId: group._id.toString(), type: 'schedule_removed' },
                type: 'schedule-removed',
                meta: { scheduleName: target.name },
                sender: requester._id,
                group: group._id,
            });
        }
    }

    res.status(200).json({ message: "Schedule removed.", group: withLegacyScheduleMirror(group.toObject()) });
});

/**
 * @desc    Update group general details
 */
export const updateGroup = asyncHandler(async (req, res) => {
    const { userId: clerkId } = getAuth(req);
    const { groupId } = req.params;
    const {
        name,
        image,
        meetupsToDisplay,
        defaultLocation,
        generationLeadDays,
        generationLeadTime,
        generationDeadlineDays,
        generationDeadlineTime,
        defaultCapacity
    } = req.body;

    const group = await Group.findById(groupId);
    const requester = await User.findOne({ clerkId }).lean();
    if (!group || !requester) return res.status(404).json({ error: "Resource not found." });

    if (!canManageGroup(requester._id, group)) {
        return res.status(403).json({ error: "Permission denied." });
    }

    const oldName = group.name;

    // renaming the group no longer renames meetups; a meetup's name comes from its schedule
    if (name && name !== group.name) {
        group.name = name;

        const membersToNotify = await User.find({ _id: { $in: group.members } });
        if (membersToNotify.length > 0) {
            await notifyAndPersist(membersToNotify, {
                title: "Group Name Changed",
                body: `The group "${oldName}" is now named "${group.name}".`,
                data: { groupId: group._id.toString(), type: 'group_updated' },
                type: 'group-updated',
                sender: requester._id,
                group: group._id,
            });
        }
    }

    if (image !== undefined) group.image = image;
    if (meetupsToDisplay) group.meetupsToDisplay = parseInt(meetupsToDisplay);

    // defaultCapacity/defaultLocation now live on the group only as the fallback
    // for schedule-less meetups; current clients edit a schedule directly instead.
    // Legacy clients still PUT these expecting them to affect "the" schedule, so
    // mirror onto the sole schedule when the group has exactly one (legacy shape).
    const soleSchedule = group.schedules.length === 1 ? group.schedules[0] : null;

    if (defaultCapacity !== undefined) {
        group.defaultCapacity = Number(defaultCapacity);
        if (soleSchedule) {
            soleSchedule.defaultCapacity = Number(defaultCapacity);
            await Meetup.updateMany(
                { group: groupId, schedule: soleSchedule._id, isOverride: false },
                { $set: { capacity: Number(defaultCapacity) } }
            );
        }
    }
    if (defaultLocation !== undefined) {
        group.defaultLocation = defaultLocation;
        if (soleSchedule) {
            soleSchedule.defaultLocation = defaultLocation;
            if (defaultLocation) {
                await Meetup.updateMany(
                    {
                        group: groupId,
                        schedule: soleSchedule._id,
                        $or: [{ isOverride: false }, { location: { $in: ["", null] } }],
                    },
                    { $set: { location: defaultLocation } }
                );
            }
        }
    }
    if (soleSchedule) {
        if (generationLeadDays !== undefined) soleSchedule.generationLeadDays = numOrNull(generationLeadDays, null);
        if (generationLeadTime !== undefined) soleSchedule.generationLeadTime = generationLeadTime;
        if (generationDeadlineDays !== undefined) soleSchedule.generationDeadlineDays = numOrNull(generationDeadlineDays, null);
        if (generationDeadlineTime !== undefined) soleSchedule.generationDeadlineTime = generationDeadlineTime;
    }

    const updatedGroup = await group.save();
    // name/image aren't stored on the Meetup doc itself, but clients cache them
    // as part of the meetup's populated `group` snapshot (see touchGroupMeetups) —
    // capacity/location changes above already bump meetups via updateMany, so
    // this only needs to cover the fields that don't.
    if (name !== undefined || image !== undefined) await touchGroupMeetups(group._id);
    res.status(200).json({ group: withLegacyScheduleMirror(updatedGroup.toObject()), message: "Group and meetups updated successfully." });
});

export const updateModerators = asyncHandler(async (req, res) => {
    const { groupId } = req.params;
    const { moderatorIds } = req.body;
    const { userId: clerkId } = getAuth(req);

    if (!isValidId(groupId)) return res.status(400).json({ error: "Invalid group ID." });
    if (!Array.isArray(moderatorIds) || !moderatorIds.every(isValidId)) {
        return res.status(400).json({ error: "moderatorIds must be a list of user IDs." });
    }

    const group = await Group.findById(groupId);
    const user = await User.findOne({ clerkId });

    if (!group || !user) return res.status(404).json({ error: "Group not found." });
    if (group.owner.toString() !== user._id.toString()) {
        return res.status(403).json({ error: "Only the group owner can manage moderators." });
    }

    const validModeratorIds = moderatorIds.filter(id => 
        id !== group.owner.toString() && group.members.some(m => m.toString() === id)
    );

    group.moderators = validModeratorIds;
    await group.save();
    await touchGroupMeetups(group._id);
    res.status(200).json({ message: "Moderator list updated successfully.", group });
});

export const toggleModerator = asyncHandler(async (req, res) => {
    const { groupId } = req.params;
    const { userIdToToggle } = req.body;
    const { userId: clerkId } = getAuth(req);

    if (!isValidId(groupId) || !isValidId(userIdToToggle)) return res.status(400).json({ error: "Invalid ID." });

    const group = await Group.findById(groupId);
    const user = await User.findOne({ clerkId });

    if (!group || !user) return res.status(404).json({ error: "Not found." });
    if (group.owner.toString() !== user._id.toString()) {
        return res.status(403).json({ error: "Only the group owner can manage moderators." });
    }
    if (group.owner.toString() === userIdToToggle) {
        return res.status(400).json({ error: "The owner cannot be demoted." });
    }

    if (!group.members.some(id => id.toString() === userIdToToggle)) {
        return res.status(400).json({ error: "Only group members can be moderators." });
    }

    const isCurrentlyMod = group.moderators.some(id => id.toString() === userIdToToggle);
    if (isCurrentlyMod) {
        group.moderators = group.moderators.filter(id => id.toString() !== userIdToToggle);
    } else {
        group.moderators.push(userIdToToggle);
    }

    await group.save();
    await touchGroupMeetups(group._id);
    res.status(200).json({ message: isCurrentlyMod ? "Moderator removed." : "Moderator added.", group });
});

/**
 * @desc    Transfers group ownership to another current member. The outgoing
 *          owner becomes a moderator so management continuity isn't lost.
 * @route   POST /api/groups/:groupId/transfer-ownership
 */
export const transferOwnership = asyncHandler(async (req, res) => {
    const { userId: clerkId } = getAuth(req);
    const { groupId } = req.params;
    const { newOwnerId } = req.body;

    const group = await Group.findById(groupId);
    const requester = await User.findOne({ clerkId }).lean();
    const newOwner = await User.findById(newOwnerId).lean();

    if (!group || !requester || !newOwner) return res.status(404).json({ error: "Resource not found." });
    if (group.owner.toString() !== requester._id.toString()) {
        return res.status(403).json({ error: "Only the group owner can transfer ownership." });
    }
    if (newOwner._id.toString() === requester._id.toString()) {
        return res.status(400).json({ error: "You are already the owner." });
    }
    if (!group.members.some(m => m.toString() === newOwner._id.toString())) {
        return res.status(400).json({ error: "New owner must be a current group member." });
    }

    // outgoing owner keeps management ability as a moderator; incoming owner
    // is pulled out of moderators since that role is now redundant for them
    const newModerators = group.moderators
        .filter(id => id.toString() !== newOwner._id.toString())
        .concat(requester._id);

    // the owner: requester._id match doubles as a compare-and-swap guard
    // against a concurrent transfer (e.g. a double-tap) racing this one
    const updated = await Group.findOneAndUpdate(
        { _id: groupId, owner: requester._id },
        { $set: { owner: newOwner._id, moderators: newModerators } },
        { new: true }
    );
    if (!updated) return res.status(409).json({ error: "Ownership already changed. Please refresh and try again." });
    await touchGroupMeetups(group._id);

    // Premium belongs to the owner's subscription, so it does not follow the
    // group: if the outgoing owner was covering it and the new owner isn't
    // subscribed, the group's Premium features pause. Tell the new owner.
    const premiumPaused = hasPremium(requester) && !hasPremium(newOwner);

    // The transfer is already committed, so a slow push provider must not hold
    // the response past the client's request timeout (which would show the
    // outgoing owner an error for a transfer that succeeded). Wait for the
    // notification, but only up to a cap; it keeps running either way.
    try {
        const notified = notifyAndPersist([newOwner], {
            title: "You're Now the Owner",
            body: `${requester.firstName} made you the owner of "${group.name}".` +
                (premiumPaused ? " Its Premium features are paused until you have your own Premium subscription." : ""),
            data: { groupId: group._id.toString(), type: 'ownership-transferred' },
            type: 'ownership-transferred',
            sender: requester._id,
            group: group._id,
            meta: premiumPaused ? { premiumPaused: true } : undefined,
        });
        notified.catch(err => console.error(err));
        await Promise.race([notified, new Promise(resolve => setTimeout(resolve, 3000))]);
    } catch (err) { console.error(err); }

    await postSystemMessage(group._id, `${requester.firstName} made ${newOwner.firstName} the group owner`);

    res.status(200).json({ message: "Ownership transferred." });
});

export const getGroups = asyncHandler(async (req, res) => {
    const { userId: clerkId } = getAuth(req);
    const user = await User.findOne({ clerkId }).lean();
    if (!user) return res.status(404).json({ error: "User not found." });

    const filter = { members: user._id };
    const { since } = req.query;

    // Delta sync: the client already has a cached copy and only wants what
    // changed since its last sync, plus the current set of valid ids so it
    // can drop anything (left group, deleted group) that's no longer visible.
    if (since) {
        const sinceDate = new Date(since);
        if (isNaN(sinceDate.getTime())) {
            return res.status(400).json({ error: "Invalid 'since' timestamp." });
        }

        const [changed, validIds] = await Promise.all([
            // DM chats are always re-sent: a rename or new photo changes the User, not the Group.
            Group.find({ ...filter, $or: [{ updatedAt: { $gte: sinceDate } }, { isDM: true }] }).lean(),
            Group.find(filter).distinct('_id'),
        ]);

        return res.status(200).json({
            changed: (await withLiveDmParticipants(changed)).map(withLegacyScheduleMirror),
            validIds: validIds.map((id) => id.toString()),
            syncedAt: new Date().toISOString(),
        });
    }

    const groups = await withLiveDmParticipants(await Group.find(filter).lean());
    res.status(200).json(groups.map(withLegacyScheduleMirror));
});

export const getGroupDetails = asyncHandler(async (req, res) => {
    const { groupId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(groupId)) return res.status(400).json({ error: "Invalid ID." });

    // Only members can see a group's people and schedules.
    const { userId: clerkId } = getAuth(req);
    const viewer = await User.findOne({ clerkId }).select('_id').lean();
    if (!viewer) return res.status(404).json({ error: "User not found." });
    // Someone with an open invitation may look before answering: tapping the invitation opens
    // this screen (in every app version).
    const isMember = await Group.exists({ _id: groupId, members: viewer._id });
    if (!isMember) {
        const invited = await Notification.exists({ recipient: viewer._id, group: groupId, type: 'group-invite', status: 'pending' });
        if (!invited) return res.status(403).json({ error: "You are not a member of this group." });
    }

    const group = await Group.findById(groupId)
        .populate("members", "firstName lastName _id profilePicture")
        .populate("moderators", "firstName lastName profilePicture _id")
        .lean();
        
    if (!group) return res.status(404).json({ error: "Group not found." });
    const [live] = await withLiveDmParticipants([group]);
    res.status(200).json({ ...withLegacyScheduleMirror(live), isPremium: await groupHasPremium(group) });
});

export const addMember = asyncHandler(async (req, res) => {
  const { userId: requesterClerkId } = getAuth(req);
  const { groupId } = req.params;
  const { userId: userIdToAdd } = req.body;
  
  const sanitizedUserId = String(userIdToAdd || '').replace(/[^a-f0-9]/gi, '');
  if (!mongoose.Types.ObjectId.isValid(groupId) || !mongoose.Types.ObjectId.isValid(sanitizedUserId)) {
      return res.status(400).json({ error: "Invalid ID." });
  }

  const group = await Group.findById(groupId);
  const requester = await User.findOne({ clerkId: requesterClerkId });
  const userToAdd = await User.findById(sanitizedUserId);

  if (!group || !requester || !userToAdd) return res.status(404).json({ error: "Resource not found." });
  if (!canManageGroup(requester._id, group)) return res.status(403).json({ error: "Permission denied." });
  if (group.members.includes(userToAdd._id)) return res.status(409).json({ message: "User is already a member." });

  await group.updateOne({ $addToSet: { members: userToAdd._id } });
  await userToAdd.updateOne({ $addToSet: { groups: group._id } });
  await addChatMembers(group._id, [userToAdd.clerkId]);

  try {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    await Meetup.updateMany(
        { group: group._id, date: { $gte: today } }, 
        { $addToSet: { members: userToAdd._id, undecided: userToAdd._id } }
    );
    await notifyAndPersist([userToAdd], {
        title: "Added to Group",
        body: `${requester.firstName} added you to "${group.name}".`,
        data: { groupId: group._id.toString(), type: 'group-added' },
        type: 'group-added',
        sender: requester._id,
        group: group._id,
    });
  } catch (err) { console.error(err); }

  await postSystemMessage(group._id, `${requester.firstName} added ${userToAdd.firstName}`);

  res.status(200).json({ message: "User added." });
});

export const inviteUser = asyncHandler(async (req, res) => {
    const { userId: clerkId } = getAuth(req);
    const { groupId } = req.params;
    const { userIdToInvite } = req.body;

    const requester = await User.findOne({ clerkId }).lean();
    const group = await Group.findById(groupId);
    const userToInvite = await User.findById(userIdToInvite);

    if (!requester || !group || !userToInvite) return res.status(404).json({ error: "Resource not found." });
    if (!canManageGroup(requester._id, group)) return res.status(403).json({ error: "Permission denied." });
    if (group.members.includes(userToInvite._id)) return res.status(400).json({ error: "User is already a member." });

    const existingInvite = await Notification.findOne({ recipient: userToInvite._id, group: group._id, type: 'group-invite', status: 'pending' });
    if (existingInvite) return res.status(400).json({ error: "Invite already pending." });

    await notifyAndPersist([userToInvite], {
        title: "Group Invitation",
        body: `${requester.firstName} invited you to join "${group.name}".`,
        data: { groupId: group._id.toString(), type: 'group-invite' },
        type: 'group-invite',
        sender: requester._id,
        group: group._id,
    });
    res.status(200).json({ message: "Invitation sent." });
});

export const removeMember = asyncHandler(async (req, res) => {
    const { userId: clerkId } = getAuth(req);
    const { groupId } = req.params;
    const { memberIdToRemove } = req.body;

    const group = await Group.findById(groupId);
    const requester = await User.findOne({ clerkId }).lean();
    const memberToRemove = await User.findById(memberIdToRemove);

    if (!group || !requester || !memberToRemove) return res.status(404).json({ error: "Resource not found." });
    if (!canManageGroup(requester._id, group)) return res.status(403).json({ error: "Permission denied." });

    if (group.owner.toString() === memberIdToRemove) return res.status(400).json({ error: "Cannot remove owner." });
    if (group.moderators.some(id => id.toString() === memberIdToRemove) && group.owner.toString() !== requester._id.toString()) {
        return res.status(403).json({ error: "Moderators cannot remove other moderators." });
    }

    await group.updateOne({ $pull: { members: memberToRemove._id, moderators: memberToRemove._id } });
    await memberToRemove.updateOne({ $pull: { groups: group._id } });
    await scrubMemberFromUpcomingMeetups({ userId: memberToRemove._id, clerkId: memberToRemove.clerkId, groupId: group._id });
    await removeChatMember(group._id, memberToRemove.clerkId);

    try {
        await notifyAndPersist([memberToRemove], {
            title: "Removed from Group",
            body: `${requester.firstName} removed you from "${group.name}".`,
            data: { groupId: group._id.toString(), type: 'group-removed' },
            type: 'group-removed',
            sender: requester._id,
            group: group._id,
        });
    } catch (err) { console.error(err); }

    await postSystemMessage(group._id, `${requester.firstName} removed ${memberToRemove.firstName}`);

    res.status(200).json({ message: "Member removed." });
});

export const createOneOffMeetup = asyncHandler(async (req, res) => {
    const { userId: clerkId } = getAuth(req);
    const { groupId } = req.params;
    const { date, time, timezone, capacity, name, location, description, scheduleId } = req.body;

    const group = await Group.findById(groupId);
    const requester = await User.findOne({ clerkId }).lean();
    if (!group || !requester) return res.status(404).json({ error: "Resource not found." });
    if (!canManageGroup(requester._id, group)) return res.status(403).json({ error: "Permission denied." });

    const meetupDate = calculateNextMeetupDate(date, time, timezone, 'once');
    if (meetupDate < new Date()) return res.status(400).json({ error: "Cannot schedule in the past." });

    // use the linked schedule's location/capacity defaults if this belongs to a
    // series; otherwise fall back to the group-level defaults.
    const linkedSchedule = scheduleId ? group.schedules.id(scheduleId) : null;
    const fallbackLocation = linkedSchedule ? linkedSchedule.defaultLocation : group.defaultLocation;
    const fallbackCapacity = linkedSchedule ? linkedSchedule.defaultCapacity : group.defaultCapacity;
    const fallbackDescription = linkedSchedule ? linkedSchedule.defaultDescription : "";

    let newMeetup;
    try {
        newMeetup = await Meetup.create({
            group: group._id,
            schedule: linkedSchedule ? linkedSchedule._id : null,
            name: name || (linkedSchedule ? linkedSchedule.name : group.name),
            date: meetupDate,
            time: time,
            timezone: timezone,
            location: location !== undefined ? location : fallbackLocation,
            description: description !== undefined ? description : fallbackDescription,
            members: group.members,
            undecided: group.members,
            capacity: capacity !== undefined ? capacity : fallbackCapacity,
            isOverride: true,
            startsAt: meetupDate,
            createdBy: requester._id,
        });
    } catch (err) {
        // Linked to a series slot that already has a meetup (the unique index
        // on group+schedule+date+time caught it) — a real, if rare, case
        // rather than a server error.
        if (err.code === 11000) {
            return res.status(409).json({ error: "This series already has a meetup at that date and time." });
        }
        throw err;
    }

    // --- NOTIFICATION LOGIC ---
    const membersToNotify = await User.find({ _id: { $in: group.members } });
    if (membersToNotify.length > 0) {
        await notifyAndPersist(membersToNotify, {
            title: "New Meetup Scheduled",
            body: `A new meetup, "${newMeetup.name}", has been scheduled for your group "${group.name}".`,
            data: { meetupId: newMeetup._id.toString(), type: 'meetup_created', groupId: group._id.toString() },
            type: 'meetup-created',
            sender: requester._id,
            meetup: newMeetup._id,
            group: group._id,
        });
    }

    res.status(201).json({ meetup: newMeetup, message: "One-off meetup scheduled." });
});

export const leaveGroup = asyncHandler(async (req, res) => {
    const { userId: clerkId } = getAuth(req);
    const { groupId } = req.params;
    const group = await Group.findById(groupId);
    const user = await User.findOne({ clerkId }).lean();
    if (!group || !user) return res.status(404).json({ error: "Resource not found." });
    if (group.owner.toString() === user._id.toString()) return res.status(403).json({ error: "Owner cannot leave." });

    await group.updateOne({ $pull: { members: user._id, moderators: user._id } });
    await User.updateOne({ _id: user._id }, { $pull: { groups: group._id } });
    await scrubMemberFromUpcomingMeetups({ userId: user._id, clerkId: user.clerkId, groupId: group._id });
    await removeChatMember(group._id, user.clerkId);
    await postSystemMessage(group._id, `${user.firstName} left the group`);
    res.status(200).json({ message: "You have left." });
});

export const deleteGroup = asyncHandler(async (req, res) => {
    const { userId: clerkId } = getAuth(req);
    const { groupId } = req.params;
    const group = await Group.findById(groupId);
    const requester = await User.findOne({ clerkId }).lean();
    if (!group || !requester) return res.status(404).json({ error: "Resource not found." });
    if (group.owner.toString() !== requester._id.toString()) return res.status(403).json({ error: "Only owner can delete." });

    // Tell the other members first (the notification keeps the group's name, since the group itself is about to go).
    const others = await User.find({ _id: { $in: group.members, $ne: requester._id } });

    // Everything that belongs to the group goes with it.
    await Meetup.deleteMany({ group: groupId });
    await Poll.deleteMany({ group: groupId });
    await InviteToken.deleteMany({ groupId });
    await AttendanceRecord.deleteMany({ group: groupId });
    await Notification.deleteMany({ group: groupId });
    await User.updateMany(
        { _id: { $in: group.members } },
        { $pull: { groups: groupId, mutedGroups: groupId, mutedUntilNextMeetup: groupId }, $unset: { [`lastReadAt.${groupId}`]: "" } }
    );
    await Group.findByIdAndDelete(groupId);

    // Chat messages, shared photos and the chat membership copy (no-ops until Supabase is configured on the server).
    await purgeGroupChat(groupId);
    await removeAllChatMembers(groupId);

    if (others.length > 0 && !group.isDM) {
        try {
            await notifyAndPersist(others, {
                title: "Group Deleted",
                body: `${requester.firstName} deleted the group "${group.name}".`,
                data: { type: 'group-deleted' },
                type: 'group-deleted',
                sender: requester._id,
                meta: { groupName: group.name },
            });
        } catch (err) { console.error(err); }
    }
    res.status(200).json({ message: "Deleted." });
});

export const generateInviteLink = asyncHandler(async (req, res) => {
    const { userId: clerkId } = getAuth(req);
    const { groupId } = req.params;

    const [user, group] = await Promise.all([
        User.findOne({ clerkId }),
        Group.findById(groupId),
    ]);
    if (!user || !group) return res.status(404).json({ error: "Resource not found." });
    if (!group.members.some(m => m.toString() === user._id.toString())) {
        return res.status(403).json({ error: "You must be a group member to generate an invite link." });
    }

    // Reuse an existing unexpired token so the same link stays stable
    let invite = await InviteToken.findOne({ groupId, expiresAt: { $gt: new Date() } });
    if (!invite) {
        const token = crypto.randomBytes(16).toString('hex');
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        invite = await InviteToken.create({ token, groupId, createdBy: user._id, expiresAt });
    }

    res.status(200).json({ link: `https://invite.groupthatapp.com/join/${invite.token}` });
});

export const redeemInviteToken = asyncHandler(async (req, res) => {
    const { userId: clerkId } = getAuth(req);
    const { token } = req.params;

    const invite = await InviteToken.findOne({ token, expiresAt: { $gt: new Date() } });
    if (!invite) return res.status(404).json({ error: "This invite link is invalid or has expired." });

    const [user, group] = await Promise.all([
        User.findOne({ clerkId }),
        Group.findById(invite.groupId),
    ]);
    if (!user || !group) return res.status(404).json({ error: "Resource not found." });

    if (group.members.some(m => m.toString() === user._id.toString())) {
        return res.status(200).json({ groupId: group._id, groupName: group.name, alreadyMember: true });
    }

    await group.updateOne({ $addToSet: { members: user._id } });
    await user.updateOne({ $addToSet: { groups: group._id } });
    await addChatMembers(group._id, [user.clerkId]);
    await onInviteRedeemed(user._id, group._id); // remembered for the welcome email

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    await Meetup.updateMany(
        { group: group._id, date: { $gte: today } },
        { $addToSet: { members: user._id, undecided: user._id } }
    );

    const owner = await User.findById(group.owner);
    if (owner && owner._id.toString() !== user._id.toString()) {
        try {
            await notifyAndPersist([owner], {
                title: "New Member",
                body: `${user.firstName} joined "${group.name}" via invite link.`,
                data: { groupId: group._id.toString(), type: 'group-member-joined' },
                type: 'group-member-joined',
                sender: user._id,
                group: group._id,
            });
        } catch (err) { console.error(err); }
    }

    await postSystemMessage(group._id, `${user.firstName} joined the group`);

    res.status(200).json({ groupId: group._id, groupName: group.name, alreadyMember: false });
});

const TIME_RE = /^(0?[1-9]|1[0-2]):[0-5]\d (AM|PM)$/;

/**
 * @desc    Set a series' priority RSVP (Premium): who gets a head start, in what
 *          groups, and for how long. Upcoming meetups are updated in place so
 *          nobody's RSVP is lost.
 * @route   PUT /api/groups/:groupId/schedules/:scheduleId/priority
 * @body    { enabled, order: userId[], tiers: [{ size, windowMinutes }], quiet?: { enabled, start, end } }
 */
export const updateSchedulePriority = asyncHandler(async (req, res) => {
    const { groupId, scheduleId } = req.params;
    const { userId: clerkId } = getAuth(req);
    const { enabled, order, tiers, quiet } = req.body;

    const group = await Group.findById(groupId);
    const user = await User.findOne({ clerkId });
    if (!group || !user) return res.status(404).json({ error: "Resource not found." });
    if (!canManageGroup(user._id, group)) return res.status(403).json({ error: "Permission denied." });

    const target = group.schedules.id(scheduleId);
    if (!target || target.active === false) return res.status(404).json({ error: "Schedule not found." });

    if (!enabled) {
        target.priorityEnabled = false;
    } else {
        if (!(await groupHasPremium(group))) {
            return res.status(403).json({ error: "premium_required", message: "Priority RSVP requires GroupThat Premium." });
        }
        if (target.generationLeadDays == null) {
            return res.status(400).json({ error: "Set when RSVPs open for this series to use priority RSVP." });
        }
        if (!Array.isArray(tiers) || tiers.length < 1 || tiers.length > MAX_PRIORITY_TIERS) {
            return res.status(400).json({ error: `Add between 1 and ${MAX_PRIORITY_TIERS} priority groups.` });
        }
        const cleanTiers = [];
        for (const t of tiers) {
            const size = Number(t?.size);
            const windowMinutes = Number(t?.windowMinutes);
            if (!Number.isInteger(size) || size < 1 || size > 500) {
                return res.status(400).json({ error: "Each group needs a size of at least 1 person." });
            }
            if (!Number.isInteger(windowMinutes) || windowMinutes < 1 || windowMinutes > MAX_WINDOW_MINUTES) {
                return res.status(400).json({ error: "Each group's time must be between 1 minute and 7 days." });
            }
            cleanTiers.push({ size, windowMinutes });
        }

        if (!Array.isArray(order)) return res.status(400).json({ error: "Invalid priority order." });
        const memberIds = new Set(group.members.map(m => m.toString()));
        const seen = new Set();
        const cleanOrder = [];
        for (const id of order.map(String)) {
            if (!memberIds.has(id) || seen.has(id)) continue;
            seen.add(id);
            cleanOrder.push(id);
        }

        const q = {
            enabled: !!quiet?.enabled,
            start: quiet?.start || target.priorityQuiet?.start || "10:00 PM",
            end: quiet?.end || target.priorityQuiet?.end || "08:00 AM",
        };
        if (q.enabled) {
            if (!TIME_RE.test(q.start) || !TIME_RE.test(q.end)) {
                return res.status(400).json({ error: "Quiet hours need a start and end time." });
            }
            if (q.start === q.end) {
                return res.status(400).json({ error: "Quiet hours can't start and end at the same time." });
            }
        }

        target.priorityEnabled = true;
        target.priorityOrder = cleanOrder;
        target.priorityTiers = cleanTiers;
        target.priorityQuiet = q;
    }

    await group.save();
    await refreshPriorityTiers(group, target);

    res.status(200).json({ message: "Priority RSVP updated.", group: withLegacyScheduleMirror(group.toObject()) });
});


/**
 * @desc    Set a series' custom RSVP questions (Premium). Upcoming meetups get the new
 *          questions; answers to questions that still exist are kept.
 * @route   PUT /api/groups/:groupId/schedules/:scheduleId/questions
 * @body    { questions: [{ _id?, prompt, type: 'text'|'choice'|'yesno', options?, required? }] }
 */
export const updateScheduleQuestions = asyncHandler(async (req, res) => {
    const { groupId, scheduleId } = req.params;
    const { userId: clerkId } = getAuth(req);

    const group = await Group.findById(groupId);
    const user = await User.findOne({ clerkId });
    if (!group || !user) return res.status(404).json({ error: "Resource not found." });
    if (!canManageGroup(user._id, group)) return res.status(403).json({ error: "Permission denied." });

    const target = group.schedules.id(scheduleId);
    if (!target || target.active === false) return res.status(404).json({ error: "Schedule not found." });

    const parsed = req.body.questions === undefined
        ? { questions: target.defaultQuestions }
        : parseQuestions(req.body.questions, target.defaultQuestions);
    if (parsed.error) return res.status(400).json({ error: parsed.error });
    if (parsed.questions.length > 0 && !(await groupHasPremium(group))) {
        return res.status(403).json({ error: "premium_required", message: "Custom RSVP questions require GroupThat Premium." });
    }

    target.defaultQuestions = parsed.questions;
    await group.save();
    await refreshSeriesQuestions(group, target);

    res.status(200).json({ message: "RSVP questions updated.", group: withLegacyScheduleMirror(group.toObject()) });
});


const MAX_RSVP_RESPONSES = 20; // per status

/**
 * @desc    Set a group's custom RSVP reactions (Premium; owner/moderators). The full
 *          list is replaced. Ids of existing reactions are kept.
 * @route   PUT /api/groups/:groupId/rsvp-responses
 * @body    { responses: [{ _id?, status: 'in'|'out', text, emoji }] }
 */
export const updateRsvpResponses = asyncHandler(async (req, res) => {
    const { userId: clerkId } = getAuth(req);
    const group = await Group.findById(req.params.groupId);
    const user = await User.findOne({ clerkId });
    if (!group || !user) return res.status(404).json({ error: "Resource not found." });
    if (!canManageGroup(user._id, group)) return res.status(403).json({ error: "Permission denied." });

    const raw = req.body.responses;
    if (!Array.isArray(raw)) return res.status(400).json({ error: "Invalid reactions." });
    const known = new Set((group.rsvpResponses || []).map(r => r._id.toString()));
    const counts = { in: 0, out: 0 };
    const clean = [];
    for (const r of raw) {
        if (r?.status !== 'in' && r?.status !== 'out') return res.status(400).json({ error: "Each reaction must be for In or Out." });
        const text = typeof r.text === 'string' ? r.text.trim() : '';
        const emoji = typeof r.emoji === 'string' ? r.emoji.trim() : '';
        if (!text) return res.status(400).json({ error: "Each reaction needs a catchphrase." });
        if (text.length > 80) return res.status(400).json({ error: "Catchphrases can be at most 80 characters." });
        if (!emoji || emoji.length > 16) return res.status(400).json({ error: "Each reaction needs an emoji." });
        if (++counts[r.status] > MAX_RSVP_RESPONSES) return res.status(400).json({ error: `You can add at most ${MAX_RSVP_RESPONSES} reactions for each of In and Out.` });
        const entry = { status: r.status, text, emoji };
        if (r._id && known.has(String(r._id))) entry._id = r._id;
        clean.push(entry);
    }
    if (clean.length > 0 && !(await groupHasPremium(group))) {
        return res.status(403).json({ error: "premium_required", message: "Custom RSVP reactions require GroupThat Premium." });
    }

    group.rsvpResponses = clean;
    await group.save();
    // Cached meetups carry a snapshot of the group, so nudge them to re-sync.
    await touchGroupMeetups(group._id);
    res.status(200).json({ message: "RSVP reactions updated.", group: withLegacyScheduleMirror(group.toObject()) });
});

const STATS_PREMIUM_REQUIRED = {
    error: "premium_required",
    message: "Group stats and attendance history require GroupThat Premium.",
};

/**
 * @desc    Attendance stats and history for a group (Premium). Any member can view.
 * @route   GET /api/groups/:groupId/stats?scheduleId=
 */
export const getGroupStats = asyncHandler(async (req, res) => {
    const { userId: clerkId } = getAuth(req);
    const [group, user] = await Promise.all([Group.findById(req.params.groupId), User.findOne({ clerkId })]);
    if (!group || !user) return res.status(404).json({ error: "Resource not found." });
    if (!group.members.some(m => m.equals(user._id))) return res.status(403).json({ error: "Permission denied." });
    if (!(await groupHasPremium(group))) return res.status(403).json(STATS_PREMIUM_REQUIRED);

    res.status(200).json(await buildGroupStats(group, { scheduleId: req.query.scheduleId || undefined }));
});

/**
 * @desc    Attendance history as CSV (Premium). Owner and moderators only.
 * @route   GET /api/groups/:groupId/stats/export?scheduleId=
 */
export const exportGroupAttendance = asyncHandler(async (req, res) => {
    const { userId: clerkId } = getAuth(req);
    const [group, user] = await Promise.all([Group.findById(req.params.groupId), User.findOne({ clerkId })]);
    if (!group || !user) return res.status(404).json({ error: "Resource not found." });
    if (!canManageGroup(user._id, group)) return res.status(403).json({ error: "Permission denied." });
    if (!(await groupHasPremium(group))) return res.status(403).json(STATS_PREMIUM_REQUIRED);

    const csv = await buildAttendanceCsv(group, { scheduleId: req.query.scheduleId || undefined });
    res.status(200).json({ filename: `${group.name.replace(/[^\w\-]+/g, "_")}_attendance.csv`, csv });
});
