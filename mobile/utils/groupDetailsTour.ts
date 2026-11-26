import type { DetailTileKey } from '@/utils/groupDetailTiles';

export type GroupDetailsTourStep = { tile: DetailTileKey; title: string; body: string };

// The words shown for each Group Details tile during the first-visit tour. Titles match the tiles.
const COPY: Record<DetailTileKey, (canManage: boolean) => { title: string; body: string }> = {
  invite: () => ({ title: 'Invite Friends', body: 'Share a link or code so friends can join this group.' }),
  members: () => ({ title: 'Group Members', body: "See everyone who's in this group." }),
  schedule: (canManage) => canManage
    ? { title: 'Edit Meetup Details', body: 'Set when and where the group meets, and when reminders go out.' }
    : { title: 'Meetup Details', body: 'See when and where this group usually meets.' },
  meetups: () => ({ title: 'Upcoming Meetups', body: 'Every meetup coming up for this group.' }),
  calendar: () => ({ title: 'Add to My Calendar', body: "Get a link that adds this group's meetups to your calendar app." }),
  past: () => ({ title: 'Past Meetups', body: 'Look back at earlier meetups.' }),
  settings: () => ({ title: 'Group Settings', body: 'Name, photo, moderators, stats and more.' }),
};

// One step per tile, in the order the tiles are shown (see buildDetailTiles).
export function groupDetailsTourSteps(tiles: DetailTileKey[], canManage: boolean): GroupDetailsTourStep[] {
  return tiles.map((tile) => ({ tile, ...COPY[tile](canManage) }));
}
