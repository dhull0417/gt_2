import { DateTime } from "luxon";
import Meetup from "../models/meetup.model.js";
import { calculateNextMeetupDate, computeNextGenerationAt, getGenerationWindowDays, parseTimeString } from "./date.utils.js";

const existenceKey = (date, time) => `${new Date(date).toISOString()}|${time}`;

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

    const { hours: leadH, minutes: leadM } = parseTimeString(schedule.generationLeadTime || "09:00 AM");
    const { hours: closeH, minutes: closeM } = parseTimeString(schedule.generationDeadlineTime || "09:00 AM");

    const docsToCreate = [];
    for (const { routine, dtEntry, nextDate, nextMeetupDT } of candidates) {
      const key = existenceKey(nextDate, dtEntry.time);
      if (seenKeys.has(key)) continue;
      seenKeys.add(key); // guards against two routines colliding within this batch

      const rsvpOpenDate = schedule.generationLeadDays != null
        ? nextMeetupDT.minus({ days: schedule.generationLeadDays }).set({ hour: leadH, minute: leadM, second: 0, millisecond: 0 }).toJSDate()
        : null;

      const rsvpCloseDate = schedule.generationDeadlineDays != null
        ? nextMeetupDT.minus({ days: schedule.generationDeadlineDays }).set({ hour: closeH, minute: closeM, second: 0, millisecond: 0 }).toJSDate()
        : null;

      docsToCreate.push({
        group: group._id,
        schedule: schedule._id,
        name: schedule.name,
        date: nextDate,
        time: dtEntry.time,
        timezone,
        location: schedule.defaultLocation || "",
        members: group.members,
        undecided: group.members,
        capacity: schedule.defaultCapacity || 0,
        isOverride: false,
        frequency: routine.frequency,
        startsAt: nextDate,
        rsvpOpenDate,
        rsvpCloseDate,
      });
    }

    if (docsToCreate.length > 0) {
      const created = await Meetup.insertMany(docsToCreate);
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
  }

  if (touched) {
    await group.save();
  }

  return { generatedCount };
};

export { generateMeetupsForSchedule };
