# Share sheet preview — implementation plan

**Goal:** Invite and app shares show the group photo (or the GroupThat logo) in the system share sheet preview, with the message unchanged.

**Architecture:** A local Expo module (`mobile/modules/rich-share`) opens the native share sheet with the message plus a title and a local image file for the preview. `utils/shareInvite.ts` picks the image (cached group photo → bundled logo → none) and falls back to `Share.share` when the module isn't in the binary.

**Tech stack:** Expo SDK 54 Modules API (Swift, Kotlin), expo-file-system (`File`, `Paths`, `File.downloadFileAsync`), expo-asset, jest-expo.

**Spec:** `docs/specs/2026-11-18-share-preview-design.md`

## Global constraints
- Titles exactly: `Join ${groupName} on GroupThat`, `Join ${meetupName} on GroupThat`, `GroupThat`.
- Image download limit: 1500 ms. Cache folder: `Paths.cache/share-previews/`.
- Fallback logo: `assets/images/icon.png`.
- Android FileProvider authority: `${packageName}.FileSystemFileProvider`.
- Message text comes only from `buildInviteMessage` (unchanged); app-share text:
  `Join me on GroupThat! The easiest way to coordinate meetups with your group.\n\n👉 https://invite.groupthatapp.com/download`
- No git commits (owner commits).

## Review focus
1. A slow or failing photo download blocks or breaks sharing → Task 2 tests (timeout, rejection → logo).
2. Old binaries without the module after an OTA update → Task 1 test (falls back to `Share.share`).
3. A group with `image: ""` or a non-https value downloading anything → Task 2 test.
4. The image being sent to recipients as an attachment → Task 3/4 device check (only text arrives).

## Files
- Create `mobile/modules/rich-share/{expo-module.config.json,index.ts}`
- Create `mobile/modules/rich-share/ios/{RichShareModule.swift,RichShare.podspec}`
- Create `mobile/modules/rich-share/android/{build.gradle,src/main/java/expo/modules/richshare/RichShareModule.kt}`
- Create `mobile/utils/shareInvite.ts`, `mobile/utils/__tests__/shareInvite.test.ts`
- Modify `components/GroupDetailsView.tsx`, `components/MeetupDetailModal.tsx`, `app/add-members/[id].tsx`,
  `components/create-group/MembersScreen.tsx`, `app/group-invite/[id].tsx`, `app/(tabs)/profile.tsx`

## Tasks
1. [ ] **JS module wrapper** — `modules/rich-share/index.ts`: `shareWithPreview(opts)` uses `requireOptionalNativeModule('RichShare')`; when null → `Share.share({ message })`, returns `'shared' | 'dismissed'` from its result. Test (in Task 2's file, module mocked): missing native module → `Share.share` called with only `{ message }`.
2. [ ] **Image picker + helper** — `utils/shareInvite.ts`:
   - `shareTitle({ groupName?, meetupName? })` → constraint titles.
   - `previewImageFor(imageUrl?: string | null): Promise<string | null>` → cached file URI | logo URI | null.
   - `prefetchShareImage(imageUrl)` (fire-and-forget).
   - `shareInvite({ message, groupName?, meetupName?, imageUrl? })` / `shareApp()`.
   Tests: title strings; https URL → download into `share-previews/`, second call reuses the file; download rejects or exceeds 1500 ms → logo URI; `''`/`null`/`'http://x'` → logo without download; logo load failure → `null` and share still happens.
3. [ ] **iOS native** — `RichShareModule.swift`: `AsyncFunction("share")` on the main queue; `RichShareItem: NSObject, UIActivityItemSource` (placeholder + item = message; link metadata = title + image/icon providers from the file URL); present from the top-most view controller; iPad popover anchor; resolve `"shared"`/`"dismissed"` from `completionWithItemsHandler`. `RichShare.podspec` (`s.dependency 'ExpoModulesCore'`, frameworks `LinkPresentation`).
4. [ ] **Android native** — `RichShareModule.kt`: `AsyncFunction("share")` builds the intent per the spec, `FileProvider.getUriForFile(context, "$packageName.FileSystemFileProvider", file)` when an image is given, starts the chooser from the current activity, resolves `"unknown"`. `build.gradle` (expo module plugin, `androidx.core:core-ktx`). `expo-module.config.json` lists both platforms.
5. [ ] **Call sites** — replace `Share.share` in the 6 invite places with `shareInvite(...)` (passing the group's `image`, and the meetup name for the meetup sheet); Profile uses `shareApp()`. Prefetch in Group Details and the meetup sheet. Keep the "ask for a new link" share on the join screen as plain text.
6. [ ] **Verify** — mobile `tsc` + full jest; owner: EAS development build, then check on iPhone (group with photo, group without, meetup, app share, iPad if available), standard Android 10+, and a Samsung Galaxy; confirm recipients get only the text and the link card.
