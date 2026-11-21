import type { Meetup } from '@/utils/api';
import { assignmentsActive } from '@/utils/assignments';
import { questionsActive, hasAnsweredAny } from '@/utils/questions';

/** The tabs of the RSVP confirm sheet, always in this order. */
export type ConfirmTab = 'bring' | 'rides' | 'questions';

export const TAB_LABELS: Record<ConfirmTab, string> = {
  bring: 'Bring',
  rides: 'Rides',
  questions: 'Questions',
};

const idOf = (u: any): string => (typeof u === 'string' ? u : u?._id);
const inList = (list: any[] | undefined, userId: string) => (list ?? []).some((u) => idOf(u) === userId);

/**
 * Which tabs apply to this person: Stuff to bring and Rides (only while they're In), then
 * Questions (In or on the waitlist). [] = nothing to confirm or look at.
 */
export const confirmTabsFor = (meetup: Meetup, userId: string): ConfirmTab[] => {
  const isIn = inList(meetup.in, userId);
  const tabs: ConfirmTab[] = [];
  if (isIn && assignmentsActive(meetup)) {
    if ((meetup.bringItems?.length ?? 0) > 0) tabs.push('bring');
    if (meetup.ridesEnabled) tabs.push('rides');
  }
  if ((isIn || inList(meetup.waitlist, userId)) && questionsActive(meetup)) tabs.push('questions');
  return tabs;
};

/**
 * Right after tapping In: pop the sheet while something is still unpicked (no item or ride yet,
 * or no answers yet). Never for the waitlist, who don't have a spot yet.
 */
export const shouldPromptAfterIn = (meetup: Meetup, userId: string): boolean => {
  if (inList(meetup.waitlist, userId)) return false;
  const tabs = confirmTabsFor(meetup, userId);
  const choseAssignments = (meetup.bringClaims ?? []).some((c) => c.user === userId)
    || (meetup.rides ?? []).some((r) => r.user === userId);
  const assignPending = (tabs.includes('bring') || tabs.includes('rides')) && !choseAssignments;
  const questionsPending = tabs.includes('questions') && !hasAnsweredAny(meetup, userId);
  return assignPending || questionsPending;
};

/**
 * What tapping someone's tile on the meetup page does: your own picks open to edit (read-only on
 * a past/cancelled meetup), anyone else's open read-only; without picks, someone else's tile
 * opens the person sheet and yours does nothing.
 */
export const tileTapAction = (
  meetup: Meetup, viewerId: string, tileUserId: string, readOnly: boolean,
): 'edit' | 'review' | 'person' | 'none' => {
  const hasPicks = confirmTabsFor(meetup, tileUserId).length > 0;
  if (tileUserId === viewerId) return hasPicks ? (readOnly ? 'review' : 'edit') : 'none';
  return hasPicks ? 'review' : 'person';
};
