# Share sheet preview: group photo or GroupThat logo — design

_2026-11-18. Small project (one native module, one helper, 7 call sites)._

## Intent
When a member taps Invite / Share, the preview at the top of the system share sheet shows a picture
instead of iOS's generic text icon ("A" with a cursor) or Android's plain text box:
the group's photo when the group has one, otherwise the GroupThat logo. "Share GroupThat" on Profile
shows the logo. The message people receive does not change (text, INVITE CODE block, one link last).

## Goals
- iPhone: preview header shows title + image for every invite and app share.
- Android 10+ (standard Sharesheet): preview shows title + thumbnail.
- Same message text as today; recipients still get the link card from the invite page's og:image.
- Never slower than ~1.5 s to open the share sheet; never fails to share because of the image.

## Non-goals
- Changing what recipients see (the invite page already sets og:image to the group photo / logo).
- Android 9 and older (the system share sheet has no preview there) — plain text, as today.
- Guaranteeing Samsung's own share panel shows the thumbnail (unverified; test, accept plain text if not).

## Anti-goals
- Sharing the image as an attachment (it would be sent to the recipient as a photo).
- Adding the link as a second share item on iOS (Messages/WhatsApp would show the link twice).

## Constraints
- Expo SDK 54, CNG (no checked-in `ios/`/`android/`), EAS builds; runtime version = fingerprint.
- Group photos: public Supabase Storage URLs on `Group.image` (800×800 JPEG, ~35 KB), e.g.
  `https://dtvnalpytbyonvnpoojw.supabase.co/storage/v1/object/public/group-images/<path>/cover.jpg?t=…`.
  Empty string = no photo.
- Older binaries receiving an OTA update must keep working (fall back to `Share.share`).
- Native code can't be compiled in Claude's environment; first native check is an EAS development build.

## Approaches considered
1. **Link only (GroupMe's way)** — share just the URL; iOS fetches og:image. Rejected: drops the text and
   invite code; Android still has no image.
2. **`Share.share({ message, url })` on iOS** — header comes from the page. Rejected: link appears twice
   in several apps; needs network; Android unchanged.
3. **Local Expo native module (chosen)** — iOS `UIActivityItemSource` returning the message text and an
   `LPLinkMetadata` (title + image) for the header; Android `ACTION_SEND` text with `EXTRA_TITLE` and the
   image as `ClipData` (content URI via expo-file-system's existing `FileSystemFileProvider`, read
   permission granted). Exact image, no network fetch by the OS, message unchanged.

## Decisions
- Module: `mobile/modules/rich-share`, JS API `shareWithPreview({ message, title, imageUri? }): Promise<'shared' | 'dismissed' | 'unknown'>`.
  `imageUri` is a local `file://` URI.
- iOS: item source's `itemForActivityType` returns the message string (every target gets exactly today's
  text); `activityViewControllerLinkMetadata` returns `LPLinkMetadata` with `title`, `imageProvider` and
  `iconProvider` from the image file. iPad: anchor the popover to the centre of the root view.
- Android: `Intent(ACTION_SEND)`, `type = "text/plain"`, `EXTRA_TEXT`, `EXTRA_TITLE`, `clipData =
  ClipData.newRawUri(null, contentUri)`, `FLAG_GRANT_READ_URI_PERMISSION`, wrapped in
  `Intent.createChooser(intent, null)`. The chooser can't report the outcome → `'unknown'`.
  Authority: `${packageName}.FileSystemFileProvider` (declared by expo-file-system, covers the cache dir).
- Image choice (`utils/shareInvite.ts`): group `image` set → download once into
  `cache/share-previews/<hash of URL>.jpg` (reused while the file exists), 1.5 s limit; failure or no photo →
  bundled `assets/images/icon.png` via `expo-asset`. If even that fails → share without an image.
- Titles: group `Join <group name> on GroupThat`; meetup `Join <meetup name> on GroupThat`;
  app `GroupThat`.
- Fallback when the native module is missing: `Share.share({ message })` (today's behaviour).
- Prefetch: the meetup sheet, Add Members and the invite screen start the photo download when they open, so the
  preview is instant when Invite is tapped. (My call.)
- "Share GroupThat" on Profile: one message on both platforms with the single link
  `https://invite.groupthatapp.com/download` and the logo (replaces the iOS-only `url` variant). (My call.)

## Left to the builder
- Exact hashing for the cache file name (any stable, filename-safe hash of the URL).
- Whether to scale the logo before handing it over (only if it looks wrong on device).
