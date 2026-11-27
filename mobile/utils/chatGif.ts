// Saved GIFs in chat. A GIF is sent as a normal picture message whose stored file ends in .gif
// (chat/<groupId>/<clientId>.gif), so everything downstream tells GIFs apart by the URL alone.
// See docs/specs/2026-11-27-chat-saved-gifs-design.md.

/** Biggest GIF that can be attached (the chat-images bucket itself allows 10 MB). */
export const MAX_GIF_BYTES = 8 * 1024 * 1024;

const endsWithGif = (s?: string | null) => !!s && /\.gif$/i.test(s.split(/[?#]/)[0]);

/** True when a stored (or local) picture URL is a GIF. Ignores the ?t= cache-buster. */
export function isGifUrl(url?: string | null): boolean {
  return endsWithGif(url);
}

/** True when an asset picked from the photo library is a GIF. Android can leave mimeType out. */
export function isGifAsset(a: { mimeType?: string | null; fileName?: string | null; uri: string }): boolean {
  if (a.mimeType) return a.mimeType.toLowerCase() === 'image/gif';
  return endsWithGif(a.fileName) || endsWithGif(a.uri);
}

/** What a picture-only message is called in previews, pins and notifications. */
export function mediaLabel(url?: string | null): string {
  return isGifUrl(url) ? 'GIF' : '📷 Photo';
}

export interface PickedAsset {
  uri: string;
  width?: number;
  height?: number;
  mimeType?: string | null;
  fileName?: string | null;
  fileSize?: number | null;
}

export interface AcceptedPick {
  uri: string;
  width?: number;
  height?: number;
  isGif: boolean;
}

/**
 * Splits library picks into ones to attach and GIFs too big to send. Only GIFs are size-checked
 * (photos are shrunk before upload); sizeOf measures the file when the picker leaves fileSize out.
 */
export function classifyPicked(
  assets: PickedAsset[],
  sizeOf: (uri: string) => number,
): { accepted: AcceptedPick[]; tooLarge: number } {
  const accepted: AcceptedPick[] = [];
  let tooLarge = 0;
  for (const a of assets) {
    const isGif = isGifAsset(a);
    if (isGif && (a.fileSize ?? sizeOf(a.uri)) > MAX_GIF_BYTES) {
      tooLarge++;
      continue;
    }
    accepted.push({ uri: a.uri, width: a.width, height: a.height, isGif });
  }
  return { accepted, tooLarge };
}
