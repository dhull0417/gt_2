import type { Meetup } from '@/utils/api';

/** Custom RSVP questions only apply while the group's owner has Premium (absent = unknown, treat as on). */
export const questionsActive = (meetup: Meetup): boolean =>
  meetup.group?.isPremium !== false && (meetup.questions?.length ?? 0) > 0;

export const answerFor = (meetup: Meetup, userId: string, questionId: string): string | undefined =>
  meetup.answers?.find((a) => a.user === userId && a.question === questionId)?.value;

export const hasAnsweredAny = (meetup: Meetup, userId: string): boolean =>
  !!meetup.answers?.some((a) => a.user === userId);

export const displayAnswer = (type: 'text' | 'choice' | 'yesno', value: string): string =>
  type === 'yesno' ? (value === 'yes' ? 'Yes' : 'No') : value;

/** Button text for the In/Out RSVP buttons: the series' custom text (Premium) or the default. */
export const rsvpLabel = (meetup: Meetup, which: 'in' | 'out'): string => {
  const custom = meetup.group?.isPremium !== false
    ? (which === 'in' ? meetup.rsvpLabels?.inLabel : meetup.rsvpLabels?.outLabel)?.trim()
    : '';
  return custom || (which === 'in' ? "I'm In" : "I'm Out");
};
