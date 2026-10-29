import { DateTime } from "luxon";
import Meetup from "../models/meetup.model.js";
import { resolveRsvpOpen } from "./priorityRsvp.js";
import { groupHasPremium } from "./premium.js";
import { calculateNextMeetupDate, computeNextGenerationAt, getGenerationWindowDays, parseTimeString } from "./date.utils.js";

const existenceKey = (date, time) => `${new Date(date).toISOString()}|${time}`;

/**
 * Pass 1 (in memory, no DB): walks each routine/dayTime out to its generation
 * window and returns the slots the series SHOULD have, the next trigger beyond
 * the window, and the bounds used.
 */
export const computeScheduleCandidates = (group, schedule) => {
  const empty = { candidates: [], earliestNextTrigger: null, overallWindowEnd: null, kickoffDate: null };
  if (!schedule.routines?.length) return empty;

  const timezone = group.timezone;
  const now = DateTime.now().setZone(timezone);

  const kickoffDate = schedule.startDate
    ? DateTime.fromJSDate(schedule.startDate, { zone: 'utc' })
        .setZone(timezone, { keepLocalTime: true })
        .startOf('day')
        .toJSDate()
    : now.startOf('day').toJSDate();

  // Pass 1 (in memory): walk each routine/dayTime out to its window,
  // collecting candidates and the next trigger beyond it.
  const candidates = [];
  let earliestNextTrigger = null;
  let overallWindowEnd = null;

  for (const routine of schedule.routines) {
    const windowEndDT = now.plus({ days: getGenerationWindowDays(routine.frequency) }).endOf('day');
    if (!overallWindowEnd || windowEndDT > overallWindowEnd) overallWindowEnd = windowEndDT;

    for (let dtIndex = 0; dtIndex < routine.dayTimes.length; dtIndex++) {
      const dtEntry = routine.dayTimes[dtIndex];
      // ordinal: dayTimes and rules are parallel arrays — index by position,
      // not rules[0], or every dayTime collapses onto the first rule.
      const ordinalRule = routine.frequency === 'ordinal' ? routine.rules?.[dtIndex] : null;
      let currentAnchor = null;

      if (routine.frequency === 'biweekly' && dtEntry.startDate) {
        // phase-lock to this dayTime's own first occurrence (e.g. Tuesdays
        // start one week, Fridays the next) rather than the weekday nearest "now".
        // seed the anchor 14 days early so the normal continuation math lands on it.
        const startDateLocal = DateTime.fromJSDate(dtEntry.startDate, { zone: 'utc' })
          .setZone(timezone, { keepLocalTime: true })
          .startOf('day');
        const phaseAnchor = calculateNextMeetupDate(
          dtEntry.day, dtEntry.time, timezone, 'weekly',
          startDateLocal.minus({ days: 1 }).toJSDate(), null
        );
        currentAnchor = DateTime.fromJSDate(phaseAnchor).minus({ days: 14 }).toJSDate();
      }

      let fillingWindow = true;
      let safetyCounter = 0;

      while (fillingWindow && safetyCounter < 100) {
        safetyCounter++;

        const nextDate = calculateNextMeetupDate(
          routine.frequency === 'monthly' ? dtEntry.date : dtEntry.day,
          dtEntry.time,
          timezone,
          routine.frequency,
          currentAnchor,
          ordinalRule
        );

        if (nextDate < kickoffDate) {
          currentAnchor = nextDate;
          continue;
        }

        const nextMeetupDT = DateTime.fromJSDate(nextDate).setZone(timezone);

        if (nextMeetupDT > windowEndDT) {
          fillingWindow = false;
          break;
        }

        candidates.push({ routine, dtEntry, nextDate, nextMeetupDT });
        currentAnchor = nextDate;
      }

      const trigger = computeNextGenerationAt(schedule, timezone, currentAnchor, routine, dtEntry, ordinalRule);
      if (!earliestNextTrigger || trigger < earliestNextTrigger) {
        earliestNextTrigger = trigger;
      }
    }
  }

  return { candidates, earliestNextTrigger, overallWindowEnd, kickoffDate };
};

/**
 * Fills one named schedule's meetup pipeline out to each routine's generation
 * window, creating missing Meetup docs and advancing nextGenerationAt to the
 * earliest still-due trigger.
 *
 * Existence is scoped to (group, schedule) so sibling schedules never collide,
 * even on the same date+time. Runs in two DB round-trips total regardless of
 * window size: candidates are computed in memory, diffed once, then bulk-inserted.
 */
const generateMeetupsForSchedule = async (group, schedule, { onMeetupCreated } = {}) => {
  if (!schedule.routines?.length) return { generatedCount: 0 };

  const timezone = group.timezone;
  const { candidates, earliestNextTrigger, overallWindowEnd, kickoffDate } = computeScheduleCandidates(group, schedule);

  let generatedCount = 0;

  if (candidates.length > 0) {
    // Pass 2 (one query): candidates all fall within [kickoffDate,
    // overallWindowEnd], so this range query (scoped to this schedule)
    // covers every possible collision.
    const existing = await Meetup.find(
      { group: group._id, schedule: schedule._id, date: { $gte: kickoffDate, $lte: overallWindowEnd.toJSDate() } },
      'date time'
    ).lean();
    const seenKeys = new Set(existing.map(m => existenceKey(m.date, m.time)));
    // Slots the organizer deleted or skipped are never recreated.
    for (const skipped of schedule.skippedSlots || []) seenKeys.add(existenceKey(skipped.date, skipped.time));

    const { hours: leadH, minutes: leadM } = parseTimeString(schedule.generationLeadTime || "09:00 AM");
    const { hours: closeH, minutes: closeM } = parseTimeString(schedule.generationDeadlineTime || "09:00 AM");

    const priorityActive = !!schedule.priorityEnabled && (await groupHasPremium(group));

    const docsToCreate = [];
    for (const { routine, dtEntry, nextDate, nextMeetupDT } of candidates) {
      const key = existenceKey(nextDate, dtEntry.time);
      if (seenKeys.has(key)) continue;
      seenKeys.add(key); // guards against two routines colliding within this batch

      // The series' "earliest time to RSVP". With priority RSVP this is when the first
      // group opens; rsvpOpenDate below is then when everyone else can RSVP.
      const baseOpen = schedule.generationLeadDays != null
        ? nextMeetupDT.minus({ days: schedule.generationLeadDays }).set({ hour: leadH, minute: leadM, second: 0, millisecond: 0 }).toJSDate()
        : null;

      const rsvpCloseDate = schedule.generationDeadlineDays != null
        ? nextMeetupDT.minus({ days: schedule.generationDeadlineDays }).set({ hour: closeH, minute: closeM, second: 0, millisecond: 0 }).toJSDate()
        : null;

      // Groups are kept even after everyone can RSVP: the ranking still decides who
      // keeps a spot when the meetup fills up.
      const { rsvpOpenDate, priorityTiers, priorityOpened } = resolveRsvpOpen({ schedule, group, baseOpen, active: priorityActive });

      docsToCreate.push({
        group: group._id,
        schedule: schedule._id,
        name: schedule.name,
        date: nextDate,
        time: dtEntry.time,
        timezone,
        location: schedule.defaultLocation || "",
        description: schedule.defaultDescription || "",
        members: group.members,
        undecided: group.members,
        capacity: schedule.defaultCapacity || 0,
        minAttendees: schedule.defaultMinAttendees || 0,
        bringItems: (schedule.defaultBringItems || []).map((i) => ({ _id: i._id, name: i.name, max: i.max ?? null })),
        ridesEnabled: !!schedule.defaultRidesEnabled,
        questions: (schedule.defaultQuestions || []).map((q) => ({ _id: q._id, prompt: q.prompt, type: q.type, options: q.options || [], required: !!q.required })),
        priorityTiers,
        priorityOpened,
        // A meetup created after its RSVP deadline already passed (e.g. a series
        // edited late) is never evaluated against the minimum.
        minimumChecked: !!(rsvpCloseDate && rsvpCloseDate <= new Date()),
        isOverride: false,
        frequency: routine.frequency,
        startsAt: nextDate,
        rsvpOpenDate,
        rsvpCloseDate,
      });
    }

    if (docsToCreate.length > 0) {
      // unordered + tolerant of duplicate-key errors: if a concurrent call
      // (the regen cron overlapping a manual edit, or a double-fired save)
      // already inserted one of these slots, the unique index on
      // (group, schedule, date, time) rejects just that doc — everything
      // else in the batch still goes through.
      let created = [];
      try {
        created = await Meetup.insertMany(docsToCreate, { ordered: false });
      } catch (err) {
        // Mongoose attaches the docs that DID succeed to a partial-failure
        // error (insertMany with ordered:false) — anything absent from that
        // list lost the race to a concurrent insert of the same slot, which
        // is the expected/harmless outcome here. A non-duplicate-key failure
        // has no insertedDocs and should still surface.
        if (!err.insertedDocs) throw err;
        created = err.insertedDocs;
      }
      generatedCount = created.length;

      if (onMeetupCreated) {
        for (const newMeetup of created) {
          await onMeetupCreated(newMeetup);
        }
      }
    }
  }

  if (earliestNextTrigger) {
    schedule.nextGenerationAt = earliestNextTrigger;
  }

  return { generatedCount };
};

/**
 * Runs generateMeetupsForSchedule across every active schedule, then saves the
 * group once (nextGenerationAt is a subdocument field, so one save persists all).
 * Shared by group create/update, the regen cron job, and the post-delete backfill.
 */
export const generateMeetupsForGroup = async (group, { onMeetupCreated } = {}) => {
  if (!group.schedules?.length) return { generatedCount: 0 };

  let generatedCount = 0;
  let touched = false;

  for (const schedule of group.schedules) {
    if (schedule.active === false) continue;
    const before = schedule.nextGenerationAt;
    const { generatedCount: count } = await generateMeetupsForSchedule(group, schedule, { onMeetupCreated });
    generatedCount += count;
    if (schedule.nextGenerationAt !== before) touched = true;
    // Forget skipped dates once they are safely in the past.
    if (schedule.skippedSlots?.length) {
      const cutoff = Date.now() - 2 * 24 * 60 * 60 * 1000;
      const keep = schedule.skippedSlots.filter((slot) => new Date(slot.date).getTime() > cutoff);
      if (keep.length !== schedule.skippedSlots.length) {
        schedule.skippedSlots = keep;
        touched = true;
      }
    }
  }

  if (touched) {
    await group.save();
  }

  return { generatedCount };
};

export { generateMeetupsForSchedule };

/**
 * Re-derives the RSVP window (open/close dates) and minimum headcount of a
 * series' upcoming OVERRIDE meetups from the series' current settings.
 *
 * A series edit deletes and regenerates only non-override meetups (overrides
 * carry manual edits, e.g. a changed time or location), so without this an
 * override keeps whatever deadline the series had when it was generated or last
 * edited, even though nothing lets you set an RSVP window or minimum per
 * meetup. Mirrors how generation and updateMeetup derive the window from the
 * meetup's own start time. Cancelled meetups and past ones are left alone, and
 * only meetups whose values actually change are written.
 *
 * `minimumChecked` follows the same rule as generation: a meetup whose
 * deadline is already past is marked checked, so changing the settings never
 * cancels a meetup retroactively; a deadline moved into the future re-arms it.
 *
 * @returns {Promise<number>} how many meetups were updated
 */
export const refreshOverrideMeetupWindows = async (group, schedule, { includeSeries = false } = {}) => {
  const now = new Date();
  const meetups = await Meetup.find({
    group: group._id,
    schedule: schedule._id,
    ...(includeSeries ? {} : { isOverride: true }),
    status: 'scheduled',
    date: { $gte: now },
  })
    .select('startsAt date rsvpOpenDate rsvpCloseDate rsvpNotified minAttendees minimumChecked priorityTiers')
    .lean();
  if (meetups.length === 0) return 0;

  const priorityActive = !!schedule.priorityEnabled && (await groupHasPremium(group));

  const { hours: leadH, minutes: leadM } = parseTimeString(schedule.generationLeadTime || "09:00 AM");
  const { hours: closeH, minutes: closeM } = parseTimeString(schedule.generationDeadlineTime || "09:00 AM");
  const minAttendees = schedule.defaultMinAttendees || 0;
  const sameTime = (a, b) => (a ? new Date(a).getTime() : null) === (b ? new Date(b).getTime() : null);

  const ops = [];
  for (const m of meetups) {
    const startsAtDT = DateTime.fromJSDate(new Date(m.startsAt || m.date)).setZone(group.timezone);
    const baseOpen = schedule.generationLeadDays != null
      ? startsAtDT.minus({ days: schedule.generationLeadDays }).set({ hour: leadH, minute: leadM, second: 0, millisecond: 0 }).toJSDate()
      : null;
    // With priority RSVP the series' open time is the first group's; everyone else opens later.
    const { rsvpOpenDate } = resolveRsvpOpen({ schedule, group, baseOpen, active: priorityActive, now });
    const rsvpCloseDate = schedule.generationDeadlineDays != null
      ? startsAtDT.minus({ days: schedule.generationDeadlineDays }).set({ hour: closeH, minute: closeM, second: 0, millisecond: 0 }).toJSDate()
      : null;
    const minimumChecked = !!(rsvpCloseDate && rsvpCloseDate <= now);
    // already-open (no gate, or open date past) skips the "RSVPs are open" ping; a future open date re-arms it
    const rsvpNotified = !rsvpOpenDate || rsvpOpenDate <= now;

    const unchanged =
      sameTime(m.rsvpOpenDate, rsvpOpenDate) &&
      sameTime(m.rsvpCloseDate, rsvpCloseDate) &&
      (m.minAttendees || 0) === minAttendees &&
      !!m.minimumChecked === minimumChecked &&
      !!m.rsvpNotified === rsvpNotified;
    if (unchanged) continue;

    ops.push({
      updateOne: {
        filter: { _id: m._id, status: 'scheduled' },
        update: { $set: { rsvpOpenDate, rsvpCloseDate, minAttendees, minimumChecked, rsvpNotified } },
      },
    });
  }

  if (ops.length > 0) await Meetup.bulkWrite(ops);
  return ops.length;
};

/**
 * Brings upcoming override meetups' assignment setup (items to bring, rides) in
 * line with the series. Claims on items that still exist are kept; claims on
 * removed items, and rides when rides are switched off, are dropped.
 *
 * @returns {Promise<number>} how many meetups were updated
 */
export const refreshOverrideAssignments = async (group, schedule, { includeSeries = false } = {}) => {
  const meetups = await Meetup.find({
    group: group._id,
    schedule: schedule._id,
    ...(includeSeries ? {} : { isOverride: true }),
    status: 'scheduled',
    date: { $gte: new Date() },
  })
    .select('bringItems ridesEnabled bringClaims rides')
    .lean();

  const items = (schedule.defaultBringItems || []).map((i) => ({ _id: i._id, name: i.name, max: i.max ?? null }));
  const ridesEnabled = !!schedule.defaultRidesEnabled;
  const itemIds = new Set(items.map((i) => i._id.toString()));
  const sig = (list) => JSON.stringify((list || []).map((i) => [i._id.toString(), i.name, i.max ?? null]));

  const ops = [];
  for (const m of meetups) {
    const claims = (m.bringClaims || []).filter((c) => itemIds.has(String(c.item)));
    const rides = ridesEnabled ? (m.rides || []) : [];
    const unchanged =
      sig(m.bringItems) === sig(items) &&
      !!m.ridesEnabled === ridesEnabled &&
      claims.length === (m.bringClaims || []).length &&
      rides.length === (m.rides || []).length;
    if (unchanged) continue;
    ops.push({
      updateOne: {
        filter: { _id: m._id, status: 'scheduled' },
        update: { $set: { bringItems: items, ridesEnabled, bringClaims: claims, rides } },
      },
    });
  }

  if (ops.length > 0) await Meetup.bulkWrite(ops);
  return ops.length;
};


/**
 * Brings a series' upcoming meetups in line with an edited schedule WITHOUT
 * wiping anyone's RSVPs:
 *   - meetups whose slot (date + time) is still part of the series are kept and
 *     updated in place (location, description, capacity, name, RSVP window,
 *     minimum, things to bring, rides, questions, priority groups);
 *   - meetups whose slot is no longer part of the series (the days/times or
 *     start date changed) are removed;
 *   - missing slots are created afterwards by generateMeetupsForSchedule.
 * Manually edited (override) and cancelled meetups are never deleted.
 *
 * @param {object} opts.resetAll  delete every upcoming series meetup instead (used when
 *                                the group's timezone changed, which moves every slot)
 * @returns {Promise<{removed: number, kept: number}>}
 */
export const reconcileScheduleMeetups = async (group, schedule, { resetAll = false } = {}) => {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const upcoming = await Meetup.find({
    group: group._id,
    schedule: schedule._id,
    isOverride: false,
    date: { $gte: today },
  }).select('date time').lean();

  const { candidates } = schedule.routines?.length ? computeScheduleCandidates(group, schedule) : { candidates: [] };
  const wanted = new Set(candidates.map(({ nextDate, dtEntry }) => existenceKey(nextDate, dtEntry.time)));

  const staleIds = upcoming
    .filter((m) => resetAll || !wanted.has(existenceKey(m.date, m.time)))
    .map((m) => m._id);
  if (staleIds.length > 0) await Meetup.deleteMany({ _id: { $in: staleIds } });

  const kept = upcoming.length - staleIds.length;
  if (kept > 0) {
    // Plain fields are copied straight from the series to the meetups that stay.
    await Meetup.updateMany(
      { group: group._id, schedule: schedule._id, isOverride: false, status: 'scheduled', date: { $gte: today } },
      {
        $set: {
          name: schedule.name,
          location: schedule.defaultLocation || '',
          description: schedule.defaultDescription || '',
          capacity: schedule.defaultCapacity || 0,
        },
      }
    );
    // Overrides that never got a location/description of their own follow the series too.
    if (schedule.defaultLocation) {
      await Meetup.updateMany(
        { group: group._id, schedule: schedule._id, isOverride: true, status: 'scheduled', date: { $gte: today }, location: { $in: ['', null] } },
        { $set: { location: schedule.defaultLocation } }
      );
    }
    if (schedule.defaultDescription) {
      await Meetup.updateMany(
        { group: group._id, schedule: schedule._id, isOverride: true, status: 'scheduled', date: { $gte: today }, description: { $in: ['', null] } },
        { $set: { description: schedule.defaultDescription } }
      );
    }
    await refreshOverrideMeetupWindows(group, schedule, { includeSeries: true });
    await refreshOverrideAssignments(group, schedule, { includeSeries: true });
  }

  return { removed: staleIds.length, kept };
};

/** Remembers a deleted/skipped slot so the series never recreates it. */
export const rememberSkippedSlot = async (group, scheduleId, meetup) => {
  const schedule = group.schedules?.id(scheduleId);
  if (!schedule) return false;
  const key = existenceKey(meetup.date, meetup.time);
  if ((schedule.skippedSlots || []).some((slot) => existenceKey(slot.date, slot.time) === key)) return true;
  schedule.skippedSlots.push({ date: meetup.date, time: meetup.time });
  await group.save();
  return true;
};
