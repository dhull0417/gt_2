import type { Group } from './api';

export function getDMDisplayName(group: Group, currentUserClerkId?: string): string {
  if (!group.dmParticipants || !currentUserClerkId) return group.name;
  const other = group.dmParticipants.find(p => p.userId !== currentUserClerkId);
  return other?.name ?? group.name;
}
