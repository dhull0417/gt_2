// What to send when Priority RSVP is switched on from a schedule form (not the Priority RSVP screen).
// No React in here.
import type { PriorityTierDef } from './api';

/** A first-time setup: one priority group holding just the owner, with a 2-hour head start. */
export const DEFAULT_PRIORITY_TIERS: PriorityTierDef[] = [{ size: 1, windowMinutes: 120 }];
export const DEFAULT_PRIORITY_QUIET = { enabled: false, start: '10:00 PM', end: '08:00 AM' };

/**
 * Body for turning Priority RSVP on. Keeps a saved ranking, groups and quiet hours if the series had
 * them; otherwise the owner is ranked first and the default group (just the owner) applies.
 */
export const priorityOnBody = (
    ownerId: string | undefined,
    memberIds: string[],
    saved?: { priorityOrder?: string[]; priorityTiers?: PriorityTierDef[]; priorityQuiet?: { enabled: boolean; start: string; end: string } } | null,
) => {
    const savedOrder = (saved?.priorityOrder ?? []).filter(m => memberIds.includes(m));
    const kept = savedOrder.length ? savedOrder : ownerId && memberIds.includes(ownerId) ? [ownerId] : [];
    return {
        enabled: true as const,
        order: [...kept, ...memberIds.filter(m => !kept.includes(m))],
        tiers: saved?.priorityTiers?.length ? saved.priorityTiers : DEFAULT_PRIORITY_TIERS,
        quiet: saved?.priorityQuiet ?? DEFAULT_PRIORITY_QUIET,
    };
};
