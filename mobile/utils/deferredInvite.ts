import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Application from 'expo-application';
import * as Clipboard from 'expo-clipboard';
import { parseInstallReferrer, parseInviteUrl, type PendingInvite } from './inviteLink';
import { savePendingInvite } from './pendingInvite';

const CHECKED_KEY = 'GT_DEFERRED_INVITE_CHECKED';
// Only a fresh install looks: people updating from an older build never see a paste prompt.
const FRESH_INSTALL_MS = 3 * 24 * 60 * 60 * 1000;

/**
 * Someone tapped an invite link without the app, installed it from the store, and opened it.
 * - Android: the Play Store hands back the invite as the install referrer (no prompt).
 * - iOS: the invite page copied the link when they tapped "Get GroupThat"; read it once.
 *   iOS asks "Allow Paste" (the invite page told them to expect it). We only read when the
 *   clipboard holds a URL, which can be checked without the prompt.
 * Runs once per install. Saves the invite so the normal pending-invite flow opens it.
 */
export async function checkDeferredInvite(): Promise<PendingInvite | null> {
  try {
    if (await AsyncStorage.getItem(CHECKED_KEY)) return null;
    await AsyncStorage.setItem(CHECKED_KEY, new Date().toISOString());

    const installedAt = await Application.getInstallationTimeAsync().catch(() => null);
    if (installedAt && Date.now() - installedAt.getTime() > FRESH_INSTALL_MS) return null;

    let invite: PendingInvite | null = null;
    if (Platform.OS === 'android') {
      const referrer = await Application.getInstallReferrerAsync().catch(() => null);
      const parsed = parseInstallReferrer(referrer);
      if (parsed) invite = { token: parsed.token, meetupId: parsed.meetupId, source: 'install_referrer' };
    } else if (Platform.OS === 'ios') {
      if (await Clipboard.hasUrlAsync().catch(() => false)) {
        const text = await Clipboard.getStringAsync().catch(() => '');
        const parsed = parseInviteUrl(text);
        if (parsed) invite = { token: parsed.token, meetupId: parsed.meetupId, source: 'clipboard' };
      }
    }

    if (invite) await savePendingInvite(invite);
    return invite;
  } catch {
    return null;
  }
}
