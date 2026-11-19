import * as SecureStore from 'expo-secure-store';

/**
 * Sign in with Apple hands over the person's name exactly once, on their first authorization.
 * We keep a copy on the device until the server confirms it, so a dropped connection or a
 * crash between Apple's sheet and our sync can't lose it for good. Tied to the Apple user id
 * so it can only ever be applied to the account it came from.
 */
export const PENDING_APPLE_NAME_KEY = 'GROUPTHAT_PENDING_APPLE_NAME';

export interface PendingAppleName {
  appleUserId: string;
  firstName: string;
  lastName: string;
}

export function encodePendingAppleName(p: PendingAppleName): string {
  return JSON.stringify(p);
}

export function decodePendingAppleName(raw: string | null | undefined): PendingAppleName | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw);
    if (!v || typeof v.appleUserId !== 'string' || !v.appleUserId) return null;
    const firstName = typeof v.firstName === 'string' ? v.firstName.trim() : '';
    const lastName = typeof v.lastName === 'string' ? v.lastName.trim() : '';
    if (!firstName && !lastName) return null;
    return { appleUserId: v.appleUserId, firstName, lastName };
  } catch {
    return null;
  }
}

/** The saved name, if it belongs to one of these Apple account ids. */
export function pendingNameFor(
  p: PendingAppleName | null,
  appleUserIds: (string | null | undefined)[],
): { firstName: string; lastName: string } | null {
  if (!p || !appleUserIds.includes(p.appleUserId)) return null;
  return { firstName: p.firstName, lastName: p.lastName };
}

export async function savePendingAppleName(p: PendingAppleName): Promise<void> {
  try { await SecureStore.setItemAsync(PENDING_APPLE_NAME_KEY, encodePendingAppleName(p)); } catch {}
}

export async function peekPendingAppleName(): Promise<PendingAppleName | null> {
  try { return decodePendingAppleName(await SecureStore.getItemAsync(PENDING_APPLE_NAME_KEY)); } catch { return null; }
}

export async function clearPendingAppleName(): Promise<void> {
  try { await SecureStore.deleteItemAsync(PENDING_APPLE_NAME_KEY); } catch {}
}
