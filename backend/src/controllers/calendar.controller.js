import asyncHandler from "express-async-handler";
import crypto from "crypto";
import { DateTime } from "luxon";
import mongoose from "mongoose";
import { getAuth } from "@clerk/express";
import User from "../models/user.model.js";
import Meetup from "../models/meetup.model.js";
import Group from "../models/group.model.js";
import { parseTimeString } from "../utils/date.utils.js";

const FEED_HOST = "https://cal.groupthatapp.com";
const LINK_HOST = "https://invite.groupthatapp.com";

/** RFC 5545 TEXT escaping: backslash, semicolon, comma and newlines must be escaped. */
export const icsEscape = (value) =>
    String(value ?? "")
        .replace(/\\/g, "\\\\")
        .replace(/;/g, "\\;")
        .replace(/,/g, "\\,")
        .replace(/\r\n|\r|\n/g, "\\n");

/** Folds a content line at 75 octets (continuation lines start with a space). */
export const icsFold = (line) => {
    const buf = Buffer.from(line, "utf8");
    if (buf.length <= 75) return line;
    const parts = [];
    let start = 0;
    let limit = 75;
    while (start < buf.length) {
        let end = Math.min(start + limit, buf.length);
        // never split inside a multi-byte UTF-8 character
        while (end < buf.length && (buf[end] & 0xc0) === 0x80) end--;
        parts.push(buf.slice(start, end).toString("utf8"));
        start = end;
        limit = 74; // the leading space counts toward the 75
    }
    return parts.join("\r\n ");
};

const formatICSDate = (dt) => dt.toUTC().toFormat("yyyyMMdd'T'HHmmss'Z'");

/** Start of a meetup: `startsAt` when present, else date + time-of-day in the meetup's own zone. */
const meetupStart = (meetup) => {
    if (meetup.startsAt) return DateTime.fromJSDate(new Date(meetup.startsAt));
    const { hours, minutes } = parseTimeString(meetup.time);
    return DateTime.fromJSDate(meetup.date, { zone: meetup.timezone }).set({ hour: hours, minute: minutes, second: 0, millisecond: 0 });
};

/**
 * @desc    Gets or generates the secret calendar sync URL for the logged-in user.
 *          Pass ?groupId= for a feed limited to one group.
 * @route   GET /api/users/calendar-url
 * @access  Private
 */
export const getCalendarSyncUrl = asyncHandler(async (req, res) => {
    const { userId: clerkId } = getAuth(req);

    let user = await User.findOne({ clerkId });
    if (!user) {
        return res.status(404).json({ message: "User not found" });
    }

    if (!user.calendarToken) {
        user.calendarToken = crypto.randomBytes(24).toString("hex");
        await user.save();
    }

    let url = `${FEED_HOST}/api/users/calendar/feed?token=${user.calendarToken}`;

    const { groupId } = req.query;
    if (groupId) {
        if (!mongoose.Types.ObjectId.isValid(String(groupId))) {
            return res.status(400).json({ message: "Invalid group id" });
        }
        const isMember = await Group.exists({ _id: groupId, members: user._id });
        if (!isMember) return res.status(403).json({ message: "You are not a member of this group" });
        url += `&group=${groupId}`;
    }

    res.status(200).json({ url });
});

/**
 * @desc    Serves the .ics file to external calendars (everything, or one group with ?group=)
 * @route   GET /api/users/calendar/feed
 * @access  Public (Relies on secret token)
 */
export const getCalendarFeed = asyncHandler(async (req, res) => {
    const { token, group: groupFilter } = req.query;

    if (!token || typeof token !== "string") {
        return res.status(400).send("Calendar sync token is missing.");
    }

    const user = await User.findOne({ calendarToken: token });
    if (!user) {
        return res.status(401).send("Invalid calendar token.");
    }

    // A rolling window of a year, so the linked calendar shows what's coming.
    // Meetups you've said you're Out of are left off; cancelled ones show as cancelled.
    const now = new Date();
    const futureWindow = new Date();
    futureWindow.setDate(futureWindow.getDate() + 366);

    const filter = {
        members: user._id,
        status: { $in: ["scheduled", "cancelled"] },
        out: { $ne: user._id },
        date: { $gte: new Date(now.getTime() - 24 * 60 * 60 * 1000), $lte: futureWindow },
    };
    if (groupFilter) {
        if (!mongoose.Types.ObjectId.isValid(String(groupFilter))) return res.status(400).send("Invalid group.");
        filter.group = groupFilter;
    }

    const upcomingMeetups = await Meetup.find(filter)
        .populate("group", "name defaultLocation")
        .sort({ date: 1 });

    let calName = `GroupThat - ${user.firstName || "My"} Schedule`;
    if (groupFilter && upcomingMeetups[0]?.group?.name) calName = `GroupThat - ${upcomingMeetups[0].group.name}`;

    const lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//GroupThat//Mobile App//EN",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        `X-WR-CALNAME:${icsEscape(calName)}`,
        "X-PUBLISHED-TTL:PT12H", // Suggests external calendars refresh every 12 hours
        "REFRESH-INTERVAL;VALUE=DURATION:PT12H",
    ];

    const stamp = formatICSDate(DateTime.now());

    for (const meetup of upcomingMeetups) {
        if (!meetup.group) continue;
        const startDT = meetupStart(meetup);
        const endDT = startDT.plus({ hours: 1 }); // blocks default to 1 hour
        const cancelled = meetup.status === "cancelled";

        const descriptionParts = [];
        if (meetup.description) descriptionParts.push(meetup.description);
        if (cancelled && meetup.cancelNote) descriptionParts.push(`Cancelled: ${meetup.cancelNote}`);
        descriptionParts.push(`Open in GroupThat: ${LINK_HOST}/go/meetup/${meetup._id}`);

        lines.push(
            "BEGIN:VEVENT",
            `UID:meetup-${meetup._id.toString()}@groupthat.com`,
            `DTSTAMP:${stamp}`,
            `LAST-MODIFIED:${formatICSDate(DateTime.fromJSDate(meetup.updatedAt || now))}`,
            `DTSTART:${formatICSDate(startDT)}`,
            `DTEND:${formatICSDate(endDT)}`,
            `SUMMARY:${icsEscape(`${cancelled ? "CANCELLED: " : ""}${meetup.group.name}: ${meetup.name}`)}`,
            `LOCATION:${icsEscape(meetup.location || meetup.group.defaultLocation || "")}`,
            `DESCRIPTION:${icsEscape(descriptionParts.join("\n\n"))}`,
            `URL:${LINK_HOST}/go/meetup/${meetup._id}`,
            `STATUS:${cancelled ? "CANCELLED" : "CONFIRMED"}`,
            "END:VEVENT"
        );
    }

    lines.push("END:VCALENDAR");

    res.setHeader("Content-Type", "text/calendar; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="groupthat_schedule.ics"');
    res.status(200).send(lines.map(icsFold).join("\r\n"));
});
