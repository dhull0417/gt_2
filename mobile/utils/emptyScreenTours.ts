import type { Feather } from '@expo/vector-icons';

// First-visit tours for the empty Meetups and Groups tabs (spec:
// docs/specs/2026-11-25-empty-screen-tours-and-sample-removal-design.md). Edit the wording here.
export type EmptyTourStep = {
  /** Which element on the screen this step highlights (each screen maps these to its elements). */
  target: string;
  title: string;
  body: string;
  icon: keyof typeof Feather.glyphMap;
  /** Corner radius of the highlighted element, so the highlight can match its shape. */
  radius: number;
  /** A round element (header icon): highlight it as a circle. */
  circle?: boolean;
};

export const meetupsEmptyTourSteps: EmptyTourStep[] = [
  { target: 'create-group', title: 'Create a group', body: 'Start here. A group is where you and your people plan meetups.', icon: 'users', radius: 12 },
  { target: 'add', title: 'Add a meetup or group', body: 'Schedule a meetup or start another group any time.', icon: 'plus-circle', radius: 18, circle: true },
  { target: 'filters', title: 'Filter by your RSVP', body: "Once meetups arrive, see the ones you're In, Out or undecided on.", icon: 'sliders', radius: 10 },
  { target: 'bell', title: 'Notifications', body: 'Invites, reminders and meetup changes show up here.', icon: 'bell', radius: 18, circle: true },
];

export const groupsEmptyTourSteps: EmptyTourStep[] = [
  { target: 'create-group', title: 'Create a group', body: 'Make a group, then invite your friends with a link or code.', icon: 'users', radius: 14 },
  { target: 'invite-code', title: 'Have an invite code?', body: "Got a code from a friend? Enter it here to join their group.", icon: 'key', radius: 10 },
  { target: 'add', title: 'New group', body: 'You can start a new group from here any time.', icon: 'plus-circle', radius: 18, circle: true },
];

// Only once the list has loaded: not while loading, offline or failed, which show their own screens.
// Meetups counts as empty only with no meetups at all (hidden by a filter still counts as having some).
export const meetupsEmptyTourEnabled = ({ loaded, meetups }: { loaded: boolean; meetups: unknown[] | undefined }) =>
  loaded && Array.isArray(meetups) && meetups.length === 0;

export const groupsEmptyTourEnabled = ({ loaded, groups }: { loaded: boolean; groups: unknown[] | undefined }) =>
  loaded && Array.isArray(groups) && groups.length === 0;
