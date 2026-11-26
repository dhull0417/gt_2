import { Platform, Share } from 'react-native';

// `expo-sharing` is optional so the app still builds without it (install it with `npx expo install expo-sharing`
// for sharing real files on Android). Metro treats a require inside try/catch as optional.
let Sharing: any = null;
try { Sharing = require('expo-sharing'); } catch { Sharing = null; }

/**
 * Saves text as a real file (so it opens in Sheets/Excel as a CSV) and opens the share sheet for it.
 * Falls back to sharing the text itself if a file can't be written or shared on this device.
 */
export async function shareTextFile(filename: string, contents: string, mimeType = 'text/csv'): Promise<void> {
    try {
        const { File, Paths } = require('expo-file-system');
        const file = new File(Paths.cache, filename);
        if (file.exists) file.delete();
        file.create();
        // A byte-order mark makes Excel read UTF-8 names (accents, emoji) correctly.
        file.write('﻿' + contents);

        if (Sharing?.isAvailableAsync && (await Sharing.isAvailableAsync())) {
            await Sharing.shareAsync(file.uri, { mimeType, dialogTitle: filename, UTI: 'public.comma-separated-values-text' });
            return;
        }
        if (Platform.OS === 'ios') {
            await Share.share({ url: file.uri, title: filename });
            return;
        }
    } catch {
        // fall through to plain text
    }
    await Share.share({ title: filename, message: contents });
}
