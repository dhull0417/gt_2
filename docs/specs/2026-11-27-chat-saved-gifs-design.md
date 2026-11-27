# Send saved GIFs in chat — design

Size: small-to-medium change (mobile upload path + display, one backend preview string,
one Supabase bucket setting). No database migration.

## Intent
People can send an animated GIF they already have saved on their phone, from the chat's
existing **+ → Photos** button, on iPhone and Android. Everyone in the group sees it play
inline. (Theirs.)

## Why it doesn't work today
- `uploadImage.ts` → `processAndUpload` runs every chat photo through
  `ImageManipulator` (resize 1280px, JPEG 0.85). A GIF comes out as a single still frame.
- The chat library picker passes `quality: 0.85`; on iPhone that alone makes the picker
  re-encode the file, and without `preferredAssetRepresentationMode: Current` iOS may hand
  back a converted still.
- The `chat-images` bucket only allows `image/jpeg, image/png, image/webp, image/heic`
  (checked in the dashboard 2026-11-27). Size limit is 10 MB.

## Decisions
- **Saved GIFs only.** No GIPHY / Klipy / search picker, no keyboard GIF insertion. (Theirs.)
- **GIFs autoplay** while on screen, in the chat bubble and the full-screen viewer. (Theirs.)
- **Detect a GIF by file name (Approach A).** GIFs upload to `chat/<groupId>/<clientId>.gif`;
  photos stay `.jpg`. A shared `isGifUrl(url)` (ignores the `?t=` query string) drives
  labels and display. (Theirs, from options I laid out.)
- **Upload the original bytes** for a GIF: no resize, no re-encode, `contentType: image/gif`,
  dimensions taken from the picker asset. (My call.)
- **Library picker keeps originals:** chat's `launchImageLibraryAsync` uses `quality: 1` and
  `preferredAssetRepresentationMode: Current` (iOS). Photos are still resized/compressed
  afterwards in `uploadImage.ts`, so photo output is unchanged. Camera capture is untouched.
  (My call.)
- **Recognising a picked GIF:** `asset.mimeType === 'image/gif'`, falling back to a `.gif`
  file name. The flag travels with the queued send (`PendingImage.isGif`) so offline-queued
  GIFs still upload as GIFs. (My call.)
- **Size cap 8 MB** per GIF, checked at pick time from `asset.fileSize`; over it → alert
  "That GIF is too large to send (max 8 MB)." and it isn't attached. Under the bucket's
  10 MB limit. (My call; can drop to 5 MB while on the Supabase Free plan.)
- **GIFs count toward the existing 4-attachments limit**, same as photos. (My call.)
- **Labels:** wherever a picture-only message shows "📷 Photo" it shows "GIF" for a GIF:
  push notification (`backend/src/utils/chatPush.js` `messagePreview`), the last-message
  text sent from the chat screen, pinned-message summary. (My call on the wording.)
- **Chat search photo grid:** GIF tiles stay still (`autoplay={false}`) with a small
  "GIF" badge, so a grid of dozens doesn't animate at once; tapping opens the viewer,
  which plays it. (My call.)
- **No content rating.** GIFs from people's own phones fall under the existing
  report / delete / timeout moderation exactly like photos. (Agreed.)

## Approaches considered
- **A — file name (picked).** No migration, no 4th rewrite of `send_message`, old app
  builds and old rows unaffected. Safe because only our upload code names files.
- B — `media_type` column + `p_media_type` on `send_message`. Rejected for now: migration
  on production and a version-skew window for no user-visible gain. Natural to add if video
  or stickers arrive later (backfill from file names).

## Goals / non-goals / anti-goals
- Goal: a saved GIF picked on iPhone or Android arrives animated for everyone.
- Goal: works through the existing offline send queue, retry, delete and moderation cleanup.
- Non-goal: GIF search, stickers, video, keyboard rich-content insertion.
- Non-goal: converting GIFs to MP4/WebP to save bandwidth (revisit if egress grows).
- Anti-goal: changing how normal photos are compressed or stored.

## Constraints
- Supabase org is on the **Free plan** (5 GB egress, 1 GB storage). GIFs are 5–10× a
  compressed photo; watch usage after launch.
- Requires a new app build (picker option change); no native module added.
- Deploy order: add `image/gif` to the `chat-images` bucket's allowed MIME types **before**
  the app release that sends GIFs.

## Left to the builder
- Exact placement/styling of the "GIF" badge (match existing chip styles).
- Whether `expo-image` needs an explicit `autoplay` prop in the bubble (default is on);
  FlatList virtualisation already unmounts far-off rows, so no custom viewability pausing
  unless Android memory testing shows a problem.
- Device check on both platforms with: a GIF from Photos/Gallery, an iCloud-only GIF on
  iPhone, a GIF over 8 MB, and a GIF picked while offline.

## Out of scope, noted
- Dashboard warning: "Clients can list all files in this bucket" (broad SELECT policy on
  `chat-images`). Separate hardening task.
