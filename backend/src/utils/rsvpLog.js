// Each meetup keeps a short log of members' own RSVP answers (who, what, when) for the
// timing awards in Stats (Quick Draw, Buzzer Beater, Weathervane). Admin overrides,
// waitlist promotions and priority bumps are not logged.

export const RSVP_LOG_CAP = 200;

/**
 * Adds one entry, keeping at most RSVP_LOG_CAP. When trimming, the oldest entry that isn't
 * someone's first answer goes first, so first answers (used for Quick Draw / Buzzer Beater)
 * survive. hadAnswers: whether anyone had already answered before this change; if so and the
 * log is still empty, those earlier answers were never logged (e.g. made before logging
 * shipped), so the log is marked partial and Stats ignores it.
 * Works on Mongoose docs and plain objects.
 */
export const appendRsvpLog = (meetup, userId, status, at = new Date(), { hadAnswers = false } = {}) => {
  if (!meetup.rsvpLog) meetup.rsvpLog = [];
  if (meetup.rsvpLog.length === 0 && hadAnswers) meetup.rsvpLogPartial = true;
  meetup.rsvpLog.push({ user: userId, status, at });
  while (meetup.rsvpLog.length > RSVP_LOG_CAP) {
    const seen = new Set();
    let drop = 0;
    for (let i = 0; i < meetup.rsvpLog.length; i++) {
      const who = String(meetup.rsvpLog[i].user);
      if (seen.has(who)) { drop = i; break; }
      seen.add(who);
    }
    meetup.rsvpLog.splice(drop, 1);
  }
};
