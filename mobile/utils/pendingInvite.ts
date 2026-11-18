import * as SecureStore from 'expo-secure-store';
import type { Router } from 'expo-router';
import { encodePendingInvite, decodePendingInvite, type PendingInvite } from './inviteLink';

/** An invite waiting for the person to sign in (or picked up after a fresh install). */
export const PENDING_INVITE_KEY = 'GROUPTHAT_PENDING_INVITE';

export async function savePendingInvite(invite: PendingInvite): Promise<void> {
  try { await SecureStore.setItemAsync(PENDING_INVITE_KEY, encodePendingInvite(invite)); } catch {}
}

export async function peekPendingInvite(): Promise<PendingInvite | null> {
  try { return decodePendingInvite(await SecureStore.getItemAsync(PENDING_INVITE_KEY)); } catch { return null; }
}

/** Reads and forgets the saved invite. */
export async function takePendingInvite(): Promise<PendingInvite | null> {
  const invite = await peekPendingInvite();
  if (invite) { try { await SecureStore.deleteItemAsync(PENDING_INVITE_KEY); } catch {} }
  return invite;
}

export function inviteRoute(invite: PendingInvite) {
  return {
    pathname: '/join/[token]' as const,
    params: { token: invite.token, s: invite.source, ...(invite.meetupId ? { m: invite.meetupId } : {}) },
  };
}

/** Opens the saved invite's join screen, if there is one. Returns whether it did. */
export async function openPendingInvite(router: Router, how: 'push' | 'replace' = 'push'): Promise<boolean> {
  const invite = await takePendingInvite();
  if (!invite) return false;
  if (how === 'replace') router.replace(inviteRoute(invite)); else router.push(inviteRoute(invite));
  return true;
}
