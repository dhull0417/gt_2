import { File, Directory, Paths } from 'expo-file-system';
import { Asset } from 'expo-asset';
import { shareWithPreview, type ShareOutcome } from '@/modules/rich-share';

// Share sheet preview picture: the group's photo (downloaded once into the cache), otherwise the
// GroupThat logo. Opening the share sheet never waits more than SHARE_IMAGE_TIMEOUT_MS for it,
// and never fails because of it.

export const SHARE_IMAGE_TIMEOUT_MS = 1500;
export const APP_SHARE_MESSAGE =
  'Join me on GroupThat! The easiest way to coordinate meetups with your group.\n\n👉 https://invite.groupthatapp.com/download';

const LOGO = require('../assets/images/icon.png');

export function shareTitle(opts: { groupName?: string; meetupName?: string }): string {
  if (opts.meetupName) return `Join ${opts.meetupName} on GroupThat`;
  if (opts.groupName) return `Join ${opts.groupName} on GroupThat`;
  return 'GroupThat';
}

const isHttps = (url: string | null | undefined): url is string => typeof url === 'string' && /^https:\/\/\S+$/.test(url);

// Stable, filename-safe name for a photo URL (its ?t= changes when the photo changes).
const hashUrl = (s: string): string => {
  let h1 = 5381, h2 = 52711;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = (h1 * 33) ^ c;
    h2 = (h2 * 33) ^ c;
  }
  return (h1 >>> 0).toString(36) + (h2 >>> 0).toString(36);
};

const cacheFileFor = (url: string): File => {
  const dir = new Directory(Paths.cache, 'share-previews');
  if (!dir.exists) dir.create();
  return new File(dir, `${hashUrl(url)}.jpg`);
};

// Downloads in progress, so a prefetch and a tap share one request. A download that hasn't
// finished after STUCK_MS is treated as stuck and started again.
const STUCK_MS = 10_000;
const inflight = new Map<string, { promise: Promise<string | null>; startedAt: number }>();

/** Downloads (or reuses) the cached copy of a group photo. Resolves null on any failure. */
function downloadPhoto(url: string): Promise<string | null> {
  try {
    const file = cacheFileFor(url);
    if (file.exists) return Promise.resolve(file.uri);
    const running = inflight.get(url);
    if (running && Date.now() - running.startedAt < STUCK_MS) return running.promise;
    const p = File.downloadFileAsync(url, file)
      .then((f) => f.uri)
      .catch(() => {
        try { if (file.exists) file.delete(); } catch {}
        return null;
      })
      .finally(() => { if (inflight.get(url)?.promise === p) inflight.delete(url); });
    inflight.set(url, { promise: p, startedAt: Date.now() });
    return p;
  } catch {
    return Promise.resolve(null);
  }
}

/** Start fetching a group photo early (screen opened), so the share sheet has it instantly. */
export function prefetchShareImage(url: string | null | undefined): void {
  if (isHttps(url)) downloadPhoto(url).catch(() => {});
}

const withTimeout = <T,>(p: Promise<T>, ms: number, fallback: T): Promise<T> =>
  new Promise((resolve) => {
    const t = setTimeout(() => resolve(fallback), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, () => { clearTimeout(t); resolve(fallback); });
  });

async function logoUri(): Promise<string | null> {
  try {
    const asset = Asset.fromModule(LOGO);
    await asset.downloadAsync();
    return asset.localUri && asset.localUri.startsWith('file://') ? asset.localUri : null;
  } catch {
    return null;
  }
}

/** Local file for the preview: cached group photo, else the logo, else null (share without a picture). */
export async function previewImageFor(imageUrl: string | null | undefined): Promise<string | null> {
  const photo = isHttps(imageUrl) ? await withTimeout(downloadPhoto(imageUrl), SHARE_IMAGE_TIMEOUT_MS, null) : null;
  return photo ?? (await logoUri());
}

/** Invite share: the exact message, titled with the group or meetup, previewed with its photo or the logo. */
export async function shareInvite(opts: { message: string; groupName?: string; meetupName?: string; imageUrl?: string | null }): Promise<ShareOutcome> {
  const imageUri = await previewImageFor(opts.imageUrl);
  return shareWithPreview({ message: opts.message, title: shareTitle(opts), imageUri });
}

/** "Share GroupThat" (Profile): the single download link, previewed with the logo. */
export async function shareApp(): Promise<ShareOutcome> {
  return shareWithPreview({ message: APP_SHARE_MESSAGE, title: 'GroupThat', imageUri: await logoUri() });
}
