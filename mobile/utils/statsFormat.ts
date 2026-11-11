// Wording for the Stats awards. Values arrive as plain numbers from the API; the label
// for each award lives here so all award copy is in one place.
import type { AwardKey } from './api';

export const AWARD_KEYS: AwardKey[] = [
  'reliable', 'streak', 'responder', 'quickDraw', 'plusOne', 'chauffeur', 'snackCaptain',
  'chatty', 'voice', 'decliner', 'ghost', 'buzzer', 'weathervane',
];

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const trim = (n: number) => String(Math.round(n * 10) / 10);

const formatMinutes = (min: number) => {
  if (min < 1) return 'under 1 min avg';
  if (min < 60) return `${Math.round(min)} min avg`;
  if (min < 24 * 60) return `${trim(min / 60)} hr avg`;
  return `${trim(min / (24 * 60))} days avg`;
};

export const formatAwardValue = (key: AwardKey, value: number | null | undefined): string => {
  if (value === null || value === undefined) return '—';
  switch (key) {
    case 'reliable': return plural(value, 'meetup', 'meetups');
    case 'streak': return `${value} in a row`;
    case 'responder': return plural(value, 'answer', 'answers');
    case 'quickDraw': return formatMinutes(value);
    case 'plusOne': return plural(value, 'guest', 'guests');
    case 'chauffeur': return plural(value, 'seat', 'seats');
    case 'snackCaptain': return plural(value, 'item', 'items');
    case 'chatty': return plural(value, 'message', 'messages');
    case 'voice': return plural(value, 'poll', 'polls');
    case 'decliner': return plural(value, "I'm Out", "I'm Outs");
    case 'ghost': return plural(value, 'no-reply', 'no-replies');
    case 'buzzer': return `${value} last-minute`;
    case 'weathervane': return plural(value, 'change', 'changes');
    default: return String(value);
  }
};

export const formatRank = (rank: number | null | undefined, of: number): string =>
  (rank ? `#${rank} of ${of}` : '—');

export const AWARD_BLURBS: Record<AwardKey, string> = {
  reliable: 'Said "I\'m In" to the most meetups that happened.',
  streak: 'Longest run of meetups in a row with "I\'m In".',
  responder: 'Answered In or Out the most times.',
  quickDraw: 'Fastest on average to answer once RSVPs open.',
  plusOne: 'Brought the most guests.',
  chauffeur: 'Offered the most seats as a driver.',
  snackCaptain: 'Signed up to bring the most things.',
  chatty: 'Sent the most messages in the group chat.',
  voice: 'Voted in the most polls.',
  decliner: 'Said "I\'m Out" the most. Always busy, always polite.',
  ghost: 'Left the most meetups without any answer at all.',
  buzzer: 'Answered in the final two hours the most times.',
  weathervane: 'Changed their RSVP the most. In, out, in again...',
};
