import type { Group } from './api';

export function getDMDisplayName(group: Group, currentUserClerkId?: string): string {
  if (!group.dmParticipants || !currentUserClerkId) return group.name;
  const other = group.dmParticipants.find(p => p.userId !== currentUserClerkId);
  return other?.name ?? group.name;
}

// Apple users can end up with no firstName/lastName (Apple only hands us a name on the very
// first sign-in). Never fall back to showing their email — for Apple's private-relay users
// that's a meaningless string like "abc123@privaterelay.appleid.com".
export function getUserDisplayName(user?: { firstName?: string; lastName?: string } | null): string {
  const name = [user?.firstName, user?.lastName].filter(Boolean).join(' ');
  return name || 'New Member';
}

export function getUserInitial(user?: { firstName?: string } | null): string {
  return user?.firstName?.[0] ?? '?';
}
