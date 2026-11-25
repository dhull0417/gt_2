import {
  meetupsEmptyTourSteps, groupsEmptyTourSteps, meetupsEmptyTourEnabled, groupsEmptyTourEnabled,
} from '../emptyScreenTours';
import { TOURS } from '../screenTours';

describe('when the empty-screen tours may start', () => {
  it('Meetups: only once loaded, and only with no meetups at all', () => {
    expect(meetupsEmptyTourEnabled({ loaded: true, meetups: [] })).toBe(true);
    expect(meetupsEmptyTourEnabled({ loaded: false, meetups: [] })).toBe(false);
    expect(meetupsEmptyTourEnabled({ loaded: true, meetups: undefined })).toBe(false);
    // Hidden by filters still counts as having meetups.
    expect(meetupsEmptyTourEnabled({ loaded: true, meetups: [{}] as any })).toBe(false);
  });
  it('Groups: only once loaded, and only with no groups', () => {
    expect(groupsEmptyTourEnabled({ loaded: true, groups: [] })).toBe(true);
    expect(groupsEmptyTourEnabled({ loaded: false, groups: [] })).toBe(false);
    expect(groupsEmptyTourEnabled({ loaded: true, groups: undefined })).toBe(false);
    expect(groupsEmptyTourEnabled({ loaded: true, groups: [{}] as any })).toBe(false);
  });
});

describe('the steps', () => {
  it('Meetups: create a group, the + button, the RSVP filters, then the bell', () => {
    expect(meetupsEmptyTourSteps.map((s) => s.target)).toEqual(['create-group', 'add', 'filters', 'bell']);
  });
  it('Groups: create a group, invite code, then the + button (no sample group)', () => {
    expect(groupsEmptyTourSteps.map((s) => s.target)).toEqual(['create-group', 'invite-code', 'add']);
    expect(JSON.stringify(groupsEmptyTourSteps).toLowerCase()).not.toContain('sample');
  });
  it('every step has a title, a short description, an icon and a corner radius', () => {
    for (const s of [...meetupsEmptyTourSteps, ...groupsEmptyTourSteps]) {
      expect(s.title.length).toBeGreaterThan(0);
      expect(s.body.length).toBeGreaterThan(0);
      expect(s.body.length).toBeLessThanOrEqual(90);
      expect(s.icon.length).toBeGreaterThan(0);
      expect(s.radius).toBeGreaterThan(0);
    }
  });
  it('the header icons are highlighted as circles', () => {
    const circles = [...meetupsEmptyTourSteps, ...groupsEmptyTourSteps].filter((s) => s.circle).map((s) => s.target);
    expect(circles).toEqual(['add', 'bell', 'add']);
  });
});

it('the new tour keys are ones the server accepts', () => {
  expect(TOURS.meetupsEmpty).toBe('meetups-empty');
  expect(TOURS.groupsEmpty).toBe('groups-empty');
  for (const key of Object.values(TOURS)) expect(key).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
});
