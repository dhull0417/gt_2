import asyncHandler from "express-async-handler";
import crypto from "crypto";
import { DateTime } from "luxon";
import { getAuth } from "@clerk/express"; // <-- NEW: Import Clerk auth
import User from "../models/user.model.js";
import Meetup from "../models/meetup.model.js";

/**
 * @desc    Gets or generates the secret calendar sync URL for the logged-in user
 * @route   GET /api/users/calendar-url
 * @access  Private
 */
export const getCalendarSyncUrl = asyncHandler(async (req, res) => {
    // 👇 NEW: Use Clerk's getAuth to find the clerkId
    const { userId: clerkId } = getAuth(req);

    // 👇 NEW: Search by clerkId, not req.user._id
    let user = await User.findOne({ clerkId });

    if (!user) {
        return res.status(404).json({ message: "User not found" });
    }

    // Generate a secure token if the user doesn't have one yet
    if (!user.calendarToken) {
        // Use the same foolproof generator
        user.calendarToken = Date.now().toString(36) + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15); 
        await user.save();
    }

    const protocol = req.protocol === 'https' ? 'https' : req.headers['x-forwarded-proto'] || 'http';
    const host = req.get('host');
    const syncUrl = `${protocol}://${host}/api/users/calendar/feed?token=${user.calendarToken}`;

    res.status(200).json({ url: syncUrl });
});

/**
 * @desc    Serves the .ics file to external calendars
 * @route   GET /api/users/calendar/feed
 * @access  Public (Relies on secret token)
 */
export const getCalendarFeed = asyncHandler(async (req, res) => {
    const { token } = req.query;

    if (!token) {
        return res.status(400).send("Calendar sync token is missing.");
    }

    // 1. Find the user securely via the token
    const user = await User.findOne({ calendarToken: token });
    if (!user) {
        return res.status(401).send("Invalid calendar token.");
    }

    // 2. Fetch the rolling window of meetups (Next 60 days)
    const now = new Date();
    const futureWindow = new Date();
    futureWindow.setDate(futureWindow.getDate() + 60);

    const upcomingMeetups = await Meetup.find({
        group: { $in: user.groups },
        status: 'scheduled',
        date: { $gte: now, $lte: futureWindow }
    }).populate('group', 'name defaultLocation');

    // 3. Construct the .ics text file content
    let icsContent = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//GroupThat//Mobile App//EN',
        'CALSCALE:GREGORIAN',
        'METHOD:PUBLISH',
        `X-WR-CALNAME:GroupThat - ${user.firstName}'s Schedule`,
        'X-PUBLISHED-TTL:PT12H' // Suggests external calendars refresh every 12 hours
    ];

    upcomingMeetups.forEach(meetup => {
        // Parse the meetup time and combine it with the date
        const meetupDate = DateTime.fromJSDate(meetup.date, { zone: meetup.timezone });
        const [time, modifier] = meetup.time.split(' ');
        let [hours, minutes] = time.split(':').map(Number);
        if (modifier === 'PM' && hours < 12) hours += 12;
        if (modifier === 'AM' && hours === 12) hours = 0;
        
        const startDT = meetupDate.set({ hour: hours, minute: minutes });
        const endDT = startDT.plus({ hours: 1 }); // Defaulting blocks to 1 hour

        // RFC 5545 Datetime format: YYYYMMDDThhmmssZ (Must be UTC)
        const formatICSDate = (dt) => dt.toUTC().toFormat("yyyyMMdd'T'HHmmss'Z'");

        icsContent.push(
            'BEGIN:VEVENT',
            `UID:meetup-${meetup._id.toString()}@groupthat.com`,
            `DTSTAMP:${formatICSDate(DateTime.now())}`,
            `DTSTART:${formatICSDate(startDT)}`,
            `DTEND:${formatICSDate(endDT)}`,
            `SUMMARY:${meetup.group.name}: ${meetup.name}`,
            `LOCATION:${meetup.location || meetup.group.defaultLocation || ''}`,
            `STATUS:CONFIRMED`,
            'END:VEVENT'
        );
    });

    icsContent.push('END:VCALENDAR');

    // 4. Send the file back with the correct headers so calendars recognize it as an ICS feed
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="groupthat_schedule.ics"');
    res.status(200).send(icsContent.join('\r\n'));
});