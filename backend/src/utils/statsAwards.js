// All-time group awards for Stats & Attendance. Pure functions: the inputs are the
// finished-meetup events from groupStats.loadEvents (newest first) and per-person counts.
// Spec: docs/specs/2026-11-10-stats-awards-design.md

export const AWARDS = [
  { key: 'reliable', title: "Ol' Reliable", emoji: '🫡', joke: false, lowerIsBetter: false },
  { key: 'streak', title: 'Iron Streak', emoji: '🔥', joke: false, lowerIsBetter: false },
  { key: 'responder', title: 'Always Answers', emoji: '✋', joke: false, lowerIsBetter: false },
  { key: 'quickDraw', title: 'Quick Draw', emoji: '⚡', joke: false, lowerIsBetter: true },
  { key: 'plusOne', title: 'Plus-One Pro', emoji: '👯', joke: false, lowerIsBetter: false },
  { key: 'chauffeur', title: 'Chauffeur', emoji: '🚗', joke: false, lowerIsBetter: false },
  { key: 'snackCaptain', title: 'Snack Captain', emoji: '🍕', joke: false, lowerIsBetter: false },
  { key: 'chatty', title: 'Chatty Cathy', emoji: '💬', joke: false, lowerIsBetter: false },
  { key: 'voice', title: 'Voice of the People', emoji: '🗳️', joke: false, lowerIsBetter: false },
  { key: 'decliner', title: 'Professional Decliner', emoji: '🙅', joke: true, lowerIsBetter: false },
  { key: 'ghost', title: 'The Ghost', emoji: '👻', joke: true, lowerIsBetter: false },
  { key: 'buzzer', title: 'Buzzer Beater', emoji: '⏰', joke: true, lowerIsBetter: false },
  { key: 'weathervane', title: 'Weathervane', emoji: '🌀', joke: true, lowerIsBetter: false },
];

export const MIN_MEETUPS = 3;      // eligible meetups (or logged answers) a person needs
export const MIN_EVENTS_WITH_DATA = 3; // events in the group carrying per-person data
const MINIMUMS = { chatty: 10, voice: 3, weathervane: 2, buzzer: 2 };
const MINUTE = 60 * 1000;
const BUZZER_WINDOW = 2 * 60 * MINUTE;
const time = (d) => (d ? new Date(d).getTime() : null);

/** How many events carry an RSVP log, and how many carry per-person guests/items/seats. */
export const countEventsWith = (events) => ({
  log: events.filter((e) => Array.isArray(e.rsvpLog)).length,
  perPerson: events.filter((e) => Array.isArray(e.guestsBy)).length,
});

/**
 * Competition ranking (1, 1, 3). Higher wins unless lowerIsBetter. Drops null values,
 * values <= 0 (higher-is-better only) and values below `min`. `tieBreak(a, b)` only orders
 * people who share a rank.
 */
export const rankBy = (entries, { lowerIsBetter = false, min = null, tieBreak = null } = {}) => {
  const kept = entries.filter((e) => e.value !== null && e.value !== undefined && Number.isFinite(e.value)
    && (lowerIsBetter ? e.value >= 0 : e.value > 0 && (min === null || e.value >= min)));
  kept.sort((a, b) => (lowerIsBetter ? a.value - b.value : b.value - a.value) || (tieBreak ? tieBreak(a, b) : 0));
  let rank = 0;
  return kept.map((e, i) => {
    if (i === 0 || e.value !== kept[i - 1].value) rank = i + 1;
    return { id: e.id, value: e.value, rank };
  });
};

const emptyMetrics = () => ({
  eligible: 0, attended: 0, declined: 0, waitlisted: 0, noResponse: 0, rate: 0, bestStreak: 0, currentStreak: 0,
  timedAnswered: 0, quickDrawMin: null, buzzer: 0, changes: 0, guests: 0, items: 0, seats: 0,
});

/** Per-member numbers over the events. Only ids in memberIds are counted. */
export const memberMetrics = (events, memberIds) => {
  const out = new Map(memberIds.map((id) => [id, emptyMetrics()]));
  const chronological = [...events].reverse();
  const run = new Map();
  const answerMinutes = new Map(); // id -> minutes from opening to first answer, per event
  for (const e of chronological) {
    if (Array.isArray(e.rsvpLog)) addTiming(e, out, answerMinutes);
    if (Array.isArray(e.guestsBy)) {
      for (const g of e.guestsBy) { const m = out.get(String(g.user)); if (m) m.guests += g.count || 0; }
      for (const g of e.itemsBy || []) { const m = out.get(String(g.user)); if (m) m.items += g.count || 0; }
      for (const g of e.seatsBy || []) { const m = out.get(String(g.user)); if (m) m.seats += g.seats || 0; }
    }
    for (const [id, m] of out) {
      const isIn = e.in.includes(id);
      const isOut = e.out.includes(id);
      const isWaiting = !isIn && !isOut && (e.waitlist || []).includes(id);
      if (!(isIn || isOut || isWaiting || e.members.includes(id))) continue;
      m.eligible++;
      if (isIn) {
        m.attended++;
        const r = (run.get(id) || 0) + 1;
        run.set(id, r);
        if (r > m.bestStreak) m.bestStreak = r;
      } else {
        run.set(id, 0);
        if (isOut) m.declined++;
        else if (isWaiting) m.waitlisted++;
      }
    }
  }
  for (const [id, m] of out) {
    m.noResponse = m.eligible - m.attended - m.declined - m.waitlisted;
    m.rate = m.eligible ? m.attended / m.eligible : 0;
    m.currentStreak = run.get(id) || 0;
    const mins = answerMinutes.get(id) || [];
    m.quickDrawMin = mins.length >= MIN_MEETUPS
      ? Math.round((mins.reduce((a, b) => a + b, 0) / mins.length) * 10) / 10
      : null;
  }
  return out;
};

// Reads one event's RSVP log: answered count, first-answer speed, last-minute answers, changes.
const addTiming = (e, out, answerMinutes) => {
  const byUser = new Map();
  for (const entry of e.rsvpLog) {
    const id = String(entry.user);
    if (!out.has(id)) continue;
    if (!byUser.has(id)) byUser.set(id, []);
    byUser.get(id).push(entry);
  }
  const deadline = time(e.rsvpCloseDate) ?? time(e.date);
  for (const [id, entries] of byUser) {
    entries.sort((a, b) => time(a.at) - time(b.at));
    const m = out.get(id);
    const first = time(entries[0].at);
    m.timedAnswered++;
    if (e.rsvpOpenDate) {
      const tier = (e.tierOpens || []).find((t) => String(t.user) === id);
      const opens = time(tier?.opensAt) ?? time(e.rsvpOpenDate);
      if (!answerMinutes.has(id)) answerMinutes.set(id, []);
      answerMinutes.get(id).push(Math.max(0, first - opens) / MINUTE);
    }
    if (deadline !== null && first <= deadline && first >= deadline - BUZZER_WINDOW) m.buzzer++;
    for (let i = 1; i < entries.length; i++) if (entries[i].status !== entries[i - 1].status) m.changes++;
  }
};

const fromMetrics = (metrics, pick, { needEligible = false } = {}) => [...metrics]
  .filter(([, m]) => !needEligible || m.eligible >= MIN_MEETUPS)
  .map(([id, m]) => ({ id, value: pick(m), rate: m.rate }));

const fromMap = (map) => (map ? [...map].map(([id, value]) => ({ id, value })) : []);

/**
 * Builds every award that has at least one qualifying person, in AWARDS order.
 * extras: { chat: Map<userId, messages> | null, polls: Map<userId, pollsVoted>,
 *           eventsWith: { log: number, perPerson: number } }
 */
export const computeAwards = (metrics, extras) => {
  const byRate = (a, b) => b.rate - a.rate;
  const rankings = {
    reliable: rankBy(fromMetrics(metrics, (m) => m.attended, { needEligible: true }), { tieBreak: byRate }),
    streak: rankBy(fromMetrics(metrics, (m) => m.bestStreak, { needEligible: true })),
    responder: rankBy(fromMetrics(metrics, (m) => m.attended + m.declined + m.waitlisted, { needEligible: true })),
    decliner: rankBy(fromMetrics(metrics, (m) => m.declined, { needEligible: true })),
    ghost: rankBy(fromMetrics(metrics, (m) => m.noResponse, { needEligible: true })),
    quickDraw: rankBy(fromMetrics(metrics, (m) => m.quickDrawMin), { lowerIsBetter: true }),
    buzzer: rankBy(fromMetrics(metrics, (m) => (m.timedAnswered >= MIN_MEETUPS ? m.buzzer : 0)), { min: MINIMUMS.buzzer }),
    weathervane: rankBy(fromMetrics(metrics, (m) => (m.timedAnswered >= MIN_MEETUPS ? m.changes : 0)), { min: MINIMUMS.weathervane }),
  };
  const onlyMembers = (map) => fromMap(map).filter((e) => metrics.has(e.id));
  if (extras.chat) rankings.chatty = rankBy(onlyMembers(extras.chat), { min: MINIMUMS.chatty });
  rankings.voice = rankBy(onlyMembers(extras.polls), { min: MINIMUMS.voice });
  if ((extras.eventsWith?.perPerson || 0) >= MIN_EVENTS_WITH_DATA) {
    rankings.plusOne = rankBy(fromMetrics(metrics, (m) => m.guests));
    rankings.chauffeur = rankBy(fromMetrics(metrics, (m) => m.seats));
    rankings.snackCaptain = rankBy(fromMetrics(metrics, (m) => m.items));
  }
  return AWARDS
    .filter((a) => rankings[a.key]?.length)
    .map((a) => ({ ...a, ranking: rankings[a.key] }));
};
