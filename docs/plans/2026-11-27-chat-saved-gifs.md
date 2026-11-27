# Send saved GIFs in chat — implementation plan

**Goal:** A GIF saved on the phone, picked from chat's + → Photos, is sent and plays animated for everyone on iPhone and Android.
**Architecture:** A picked asset is flagged `isGif` (mime type / file name) and carried on the queued send's `PendingImage`. At send time a GIF skips `ImageManipulator` and its original bytes upload to `chat/<groupId>/<clientId>.gif` as `image/gif`. Everything downstream tells GIFs apart with `isGifUrl()` on the stored URL — no database change.
**Tech stack:** Expo 58 / React Native 0.88, expo-image-picker, expo-image, expo-file-system (`File`), Supabase Storage; jest-expo (mobile/), `node --test` (backend/).
**Spec:** docs/specs/2026-11-27-chat-saved-gifs-design.md

**Global constraints**
- `MAX_GIF_BYTES = 8 * 1024 * 1024` (8 MB). Bucket limit stays 10 MB.
- GIF storage path: `chat/<groupId>/<clientId>.gif`; photo path unchanged: `chat/<groupId>/<clientId>.jpg`.
- GIF upload: `contentType: "image/gif"`, original bytes, no resize/re-encode, `upsert: true`, URL gets the same `?t=<ms>` suffix as photos.
- Label for a picture-only GIF message: exactly `GIF`. Photos keep `📷 Photo`.
- Photo output (size, compression, JPEG) must not change. Camera capture untouched.
- No migration, no change to `send_message`.
- Don't commit unless the user asks (work stays uncommitted on `staging`).

**Review focus**
1. A GIF queued offline survives an app restart and still uploads as `.gif` → Task 3 test "queued GIF keeps its .gif path".
2. Stored URLs carry `?t=…` and file names can be upper-case → Task 1 tests "ignores the query string" and "is case-insensitive".
3. Android may omit `fileSize` / `mimeType` → Task 4 tests "falls back to the file's size" and "recognises a .gif file name with no mime type".
4. Queued sends from app 1.4.3 have no `isGif` → Task 3 test "an old queued photo without isGif still uploads as .jpg".
5. A photo must not take the GIF path → Task 2 test "photos still go through the JPEG re-save".

## File map
- Create `mobile/utils/chatGif.ts` — `MAX_GIF_BYTES`, `isGifUrl`, `isGifAsset`, `mediaLabel`.
- Create `mobile/utils/__tests__/chatGif.test.ts`.
- Modify `mobile/utils/uploadImage.ts` — new `uploadChatGif`.
- Create `mobile/utils/__tests__/uploadImage.test.ts`.
- Modify `mobile/types/chat.ts` — `PendingImage.isGif?: boolean`.
- Modify `mobile/utils/chatMutations.ts` — `chatPhotoPath(groupId, clientId, isGif?)`, GIF branch in send `mutationFn`.
- Modify `mobile/utils/__tests__/chatMutations.test.ts`.
- Modify `mobile/components/ChatMessageInput.tsx` — picker options, GIF classification, size alert, pass `isGif`.
- Modify `mobile/components/ChatPinnedMessages.tsx`, `mobile/app/group-chat/[id].tsx` — labels.
- Modify `mobile/app/group-chat/search/[id].tsx` — still GIF tiles + badge.
- Modify `backend/src/utils/chatPush.js`, `backend/src/utils/chatPush.test.mjs` — push preview.

## Task 1: GIF helpers
**Files:** create `mobile/utils/chatGif.ts`, `mobile/utils/__tests__/chatGif.test.ts`.
**Interfaces produced:**
- `MAX_GIF_BYTES: number`
- `isGifUrl(url?: string | null): boolean` — path (before `?`/`#`) ends in `.gif`, case-insensitive.
- `isGifAsset(a: { mimeType?: string | null; fileName?: string | null; uri: string }): boolean` — `mimeType === 'image/gif'`, else `.gif` on `fileName`, else on `uri`.
- `mediaLabel(url?: string | null): string` — `'GIF'` if `isGifUrl`, else `'📷 Photo'`.

- [x] Write failing tests: `isGifUrl('https://x/chat/g/c.gif?t=123')` true ("ignores the query string"); `'…/c.GIF'` true ("is case-insensitive"); `'…/c.jpg?t=1'` false; `null` false; `isGifAsset({mimeType:'image/gif',uri:'file:///a'})` true; `isGifAsset({fileName:'Funny.GIF',uri:'content://x'})` true ("recognises a .gif file name with no mime type"); `isGifAsset({mimeType:'image/jpeg',fileName:'a.jpg',uri:'file:///a.jpg'})` false; `mediaLabel('…/c.gif?t=1')` === `'GIF'`; `mediaLabel('…/c.jpg')` === `'📷 Photo'`.
- [x] Run `npx jest utils/__tests__/chatGif` in mobile/ → FAIL: cannot find module `../chatGif`.
- [x] Implement the four exports in `mobile/utils/chatGif.ts`.
- [x] Run → PASS. Run full `npm test` in mobile/ → all pass.

## Task 2: Upload a GIF untouched
**Files:** modify `mobile/utils/uploadImage.ts`; create `mobile/utils/__tests__/uploadImage.test.ts`.
**Interfaces:** produces `uploadChatGif(localUri: string, filePath: string, clerkToken: string, size: { width?: number; height?: number }): Promise<UploadedImage>` (bucket fixed to `chat-images`). Reads bytes with `new File(localUri).bytes()` from `expo-file-system`.

- [x] Write failing tests (mock `expo-file-system` `File.bytes()` → `Uint8Array([71,73,70])`, mock `getSupabaseClient` with `storage.from().upload/getPublicUrl` spies, mock `expo-image-manipulator`):
  - "uploads a GIF's original bytes as image/gif": `upload` called with `('chat/g/c.gif', <those bytes>, { contentType: 'image/gif', upsert: true })`; `manipulateAsync` not called; result `{ url: '<public>?t=…', width: 320, height: 240 }` from the passed size.
  - "photos still go through the JPEG re-save": `uploadImageFromUriWithDimensions('file:///p.jpg','chat-images','chat/g/c.jpg','tok')` calls `manipulateAsync` and uploads with `contentType: 'image/jpeg'`.
- [x] Run → FAIL: `uploadChatGif` is not a function.
- [x] Implement `uploadChatGif` in `uploadImage.ts` (missing width/height → 0).
- [x] Run → PASS. Full mobile suite → pass.

## Task 3: Queued sends carry `isGif`
**Files:** modify `mobile/types/chat.ts`, `mobile/utils/chatMutations.ts`, `mobile/utils/__tests__/chatMutations.test.ts`.
**Interfaces:** consumes `uploadChatGif` (Task 2). `PendingImage` gains `isGif?: boolean`. `chatPhotoPath(groupId: string, clientId: string, isGif = false): string`.

- [x] Write failing tests:
  - `chatPhotoPath('g1','c1', true)` === `'chat/g1/c1.gif'`; existing `.jpg` test unchanged.
  - "queued GIF keeps its .gif path": extract the upload step into an exported `uploadQueuedImage(vars, token)` and assert that for `vars.image = { localUri:'file:///a', isGif:true, width:10, height:20 }` it calls `uploadChatGif('file:///a','chat/g1/c1.gif','tok',{width:10,height:20})` (mock `@/utils/uploadImage`).
  - "an old queued photo without isGif still uploads as .jpg": `{ localUri }` only → `uploadImageFromUriWithDimensions(…, 'chat/g1/c1.jpg', …)`.
  - Already-uploaded `image.url` → no upload call, returns `undefined`.
- [x] Run → FAIL (`uploadQueuedImage` missing; `.gif` path wrong).
- [x] Implement `uploadQueuedImage` and use it inside the send `mutationFn` in place of the inline upload.
- [x] Run → PASS. Full mobile suite → pass.

## Task 4: Pick GIFs in the chat input
**Files:** modify `mobile/components/ChatMessageInput.tsx`, `mobile/utils/chatGif.ts`, `mobile/utils/__tests__/chatGif.test.ts`.
**Interfaces:** consumes `isGifAsset`, `MAX_GIF_BYTES`. Adds to `chatGif.ts`: `classifyPicked(assets, sizeOf: (uri: string) => number): { accepted: {uri,width?,height?,isGif}[]; tooLarge: number }` (uses `asset.fileSize ?? sizeOf(uri)` only for GIFs). Exports `CHAT_LIBRARY_PICKER_OPTIONS_BASE = { mediaTypes: ['images'], quality: 1, allowsEditing: false, allowsMultipleSelection: true, preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Current }` from `ChatMessageInput.tsx` (or chatGif.ts if importing the enum there is cleaner).

- [x] Write failing tests for `classifyPicked`: a 9 MB GIF → `tooLarge: 1`, not accepted; a 3 MB GIF → accepted with `isGif: true`; a 20 MB JPEG → accepted (photos are compressed later); "falls back to the file's size" — GIF with no `fileSize` and `sizeOf` returning 9 MB → rejected.
- [x] Run → FAIL: `classifyPicked` missing.
- [x] Implement `classifyPicked`. In `ChatMessageInput`: `PendingEntry` gains `isGif`; `pickImage` uses the new picker options (keeping `selectionLimit`), runs `classifyPicked(result.assets, (u) => new File(u).size)`, alerts `"That GIF is too large to send (max 8 MB)."` (title `"GIF too large"`) when `tooLarge > 0`, then `addPhotos(accepted)`; `handleSend` maps `isGif` into each `PendingImage`. `takePhoto` unchanged.
- [x] Run → PASS. Full mobile suite → pass.

## Task 5: "GIF" labels (app + push)
**Files:** modify `mobile/components/ChatPinnedMessages.tsx`, `mobile/app/group-chat/[id].tsx`, `backend/src/utils/chatPush.js`, `backend/src/utils/chatPush.test.mjs`.
**Interfaces:** consumes `mediaLabel` (Task 1). Backend gets its own one-line `isGifUrl` in `chatPush.js` (no shared package).

- [x] Write failing backend test in `chatPush.test.mjs`: `messagePreview({ content:'', image_url:'https://x/chat/g/c.gif?t=1' })` === `'GIF'`; existing `'📷 Photo'` case unchanged; text still wins over GIF.
- [x] Run `npm test` in backend/ → FAIL: got `'📷 Photo'`.
- [x] Implement in `messagePreview`. Mobile: `ChatPinnedMessages` `summary` uses `mediaLabel(m.image_url)`; chat screen `notifyText = text || (image?.isGif ? 'GIF' : '📷 Photo')`.
- [x] Run → PASS. Full backend and mobile suites → pass.

## Task 6: Still GIF tiles in chat search
**Files:** modify `mobile/app/group-chat/search/[id].tsx`.
**Interfaces:** consumes `isGifUrl`.

- [x] For tiles where `isGifUrl(item.image_url)`: `<Image autoplay={false} …/>` plus a small "GIF" chip in the bottom-left corner (existing chip styling). Viewer unchanged (expo-image autoplays).
- [x] Full mobile suite → pass; `npx tsc --noEmit` in mobile/ → no new errors.

## Task 7: Bucket setting + device check
- [x] With the user's OK: Supabase → Storage → `chat-images` → Bucket settings → Allowed MIME types append `, image/gif` → Save. Confirm it shows `image/jpeg, image/png, image/webp, image/heic, image/gif`.
- [ ] Dev build on iPhone and Android; check: GIF from Photos/Gallery animates for sender and a second account; iCloud-only GIF on iPhone; GIF over 8 MB shows the alert; GIF picked in airplane mode sends animated after reconnecting (and after an app restart); push and pinned show "GIF"; normal photos unchanged; search grid tile is still with badge and plays in viewer; scroll a chat with several GIFs on Android without stutter/crash.
- [ ] Reread spec and this plan line by line; every requirement ticked.
