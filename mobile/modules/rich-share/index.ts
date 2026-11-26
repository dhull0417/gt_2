import { Share } from 'react-native';
import { requireOptionalNativeModule } from 'expo';

// Opens the system share sheet with a message plus a title and picture for the sheet's preview
// (iOS header / Android 10+ Sharesheet preview). Only the message is sent to the other app.
// Native code: ios/RichShareModule.swift, android/.../RichShareModule.kt.

export type ShareOutcome = 'shared' | 'dismissed' | 'unknown';

type RichShareNative = {
  share(message: string, title: string, imageUri: string | null): Promise<ShareOutcome>;
};

// Missing in Expo Go and in app binaries built before this module (an OTA update can reach those).
const Native = requireOptionalNativeModule<RichShareNative>('RichShare');

export const isRichShareAvailable = Native != null;

export async function shareWithPreview(opts: { message: string; title: string; imageUri: string | null }): Promise<ShareOutcome> {
  if (Native) {
    try {
      return await Native.share(opts.message, opts.title, opts.imageUri ?? null);
    } catch {
      // Fall back to the plain share below rather than failing to share at all.
    }
  }
  const result = await Share.share({ message: opts.message });
  return result.action === Share.sharedAction ? 'shared' : 'dismissed';
}
