import type { Meetup } from '@/utils/api';

/**
 * Whether the meetup's ⋯ sheet offers "Set up Teams & Tourneys": owner/moderator, Premium,
 * scheduled, and the tournament lookup has finished with none (undefined = still loading).
 */
export const showTourneySetup = ({ canManage, meetup, tournament }: { canManage: boolean; meetup: Meetup; tournament: unknown }): boolean =>
  canManage && meetup.group?.isPremium !== false && meetup.status === 'scheduled' && tournament === null;
