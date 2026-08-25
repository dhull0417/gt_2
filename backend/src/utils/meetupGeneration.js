import { DateTime } from "luxon";
import Meetup from "../models/meetup.model.js";
import { calculateNextMeetupDate, computeNextGenerationAt, getGenerationWindowDays, parseTimeString } from "./date.utils.js";

const existenceKey = (date, time) => `${new Date(date).toISOString()}|${time}`;

/**
 * Fills a group's recurring-meetup pipeline out to each routine's generation
 * window (see getGenerationWindowDays), creating any missing Meetup docs and
 * advancing the group's nextGenerationAt to the earliest still-due trigger.
 * Shared by group create/update, the regenerate-meetups cron job, and the
 * post-delete backfill so the per-frequency window logic lives in one place.
 *
 * Runs as two DB round-trips total (one read, one bulk write) regardless of
 * window size: candidate occurrences are walked entirely in memory first,
 * diffed against a single existence query, then inserted in one batch.
 * Windows now span up to ~2 years, so checking/creating one row at a time
 * (the original approach) could mean hundreds of sequential awaits per call.
 */
export const generateMeetupsForGroup = async (group, { onMeetupCreated } = {}) => {
  if (!group.schedule?.routines?.length) return { generatedCount: 0 };

  const timezone = group.timezone;
  const now = DateTime.now().setZone(timezone);

  const kickoffDate = group.schedule.startDate
    ? DateTime.fromJSDate(group.schedule.startDate, { zone: 'utc' })
        .setZone(timezone, { keepLocalTime: true })
        .startOf('day')
        .toJSDate()
    : now.startOf('day').toJSDate();

  // Pass 1 (in memory, no DB calls): walk each routine/dayTime's occurrence
  // sequence out to its own generation window, collecting every candidate
  // date and the trigger for the next occurrence beyond the window.
  const candidates = [];
  let earliestNextTrigger = null;
  let overallWindowEnd = null;

  for (const routine of group.schedule.routines) {
    const windowEndDT = now.plus({ days: getGenerationWindowDays(routine.frequency) }).endOf('day');
    if (!overallWindowEnd || windowEndDT > overallWindowEnd) overallWindowEnd = windowEndDT;

    for (let dtIndex = 0; dtIndex < routine.dayTimes.length; dtIndex++) {
      const dtEntry = routine.dayTimes[dtIndex];
      // For 'ordinal' routines, dayTimes and rules are parallel arrays (one
      // rule per dayTime, e.g. dayTimes[1]="Sunday @ 5pm" pairs with
      // rules[1]={occurrence:"Last", day:0}) — must index by position, not
      // just take rules[0], or every dayTime collapses onto the first rule's
      // occurrence.
      const ordinalRule = routine.frequency === 'ordinal' ? routine.rules?.[dtIndex] : null;
      let currentAnchor = null;

      if (routine.frequency === 'biweekly' && dtEntry.startDate) {
        // Phase-lock this dayTime's cadence to its own chosen first
        // occurrence (e.g. Tuesdays starting one week, Fridays starting the
        // next) instead of whichever weekday happens to fall nearest "now".
        // Seed the anchor one full 14-day cycle before the actual first
        // occurrence on/after the chosen date — the unchanged continuation
        // math below (which always advances a fixed 14 days from a real
        // anchor) then lands exactly on it as the first real candidate.
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

      const trigger = computeNextGenerationAt(group, currentAnchor, routine, dtEntry, ordinalRule);
      if (!earliestNextTrigger || trigger < earliestNextTrigger) {
        earliestNextTrigger = trigger;
      }
    }
  }

  let generatedCount = 0;

  if (candidates.length > 0) {
    // Pass 2 (one query): every candidate falls within [kickoffDate,
    // overallWindowEnd] by construction, so this single range query covers
    // anything a candidate could possibly collide with.
    const existing = await Meetup.find(
      { group: group._id, date: { $gte: kickoffDate, $lte: overallWindowEnd.toJSDate() } },
      'date time'
    ).lean();
    const seenKeys = new Set(existing.map(m => existenceKey(m.date, m.time)));

    const { hours: leadH, minutes: leadM } = parseTimeString(group.generationLeadTime || "09:00 AM");
    const { hours: closeH, minutes: closeM } = parseTimeString(group.generationDeadlineTime || "09:00 AM");

    const docsToCreate = [];
    for (const { routine, dtEntry, nextDate, nextMeetupDT } of candidates) {
      const key = existenceKey(nextDate, dtEntry.time);
      if (seenKeys.has(key)) continue;
      seenKeys.add(key); // guards against two routines landing on the same date+time within this same batch

      const rsvpOpenDate = group.generationLeadDays != null
        ? nextMeetupDT.minus({ days: group.generationLeadDays }).set({ hour: leadH, minute: leadM, second: 0, millisecond: 0 }).toJSDate()
        : null;

      const rsvpCloseDate = group.generationDeadlineDays != null
        ? nextMeetupDT.minus({ days: group.generationDeadlineDays }).set({ hour: closeH, minute: closeM, second: 0, millisecond: 0 }).toJSDate()
        : null;

      docsToCreate.push({
        group: group._id,
        name: group.name,
        date: nextDate,
        time: dtEntry.time,
        timezone,
        location: group.defaultLocation || "",
        members: group.members,
        undecided: group.members,
        capacity: group.defaultCapacity || 0,
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
    group.nextGenerationAt = earliestNextTrigger;
    await group.save();
  }

  return { generatedCount };
};
