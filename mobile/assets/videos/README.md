# Videos

## welcome-create-group-ios.mov / welcome-create-group-android.mov

Screen recordings shown in the new-user welcome modal ([WelcomeModal.tsx](../../components/WelcomeModal.tsx)), demonstrating how to create a first group. Recorded separately per platform since the status bar/nav chrome differs; [WelcomeModal.tsx](../../components/WelcomeModal.tsx) picks the right one via `Platform.select`.

- Format: mov (H.264), no audio needed — the player is muted
- Suggested length: 5-10s, looping
- Portrait, matching each device's native screen resolution
- To update: replace the file at the matching path — same filename, no code changes needed, unless the new recording's resolution changes, in which case also update the `aspectRatio` in `styles.videoWrap` in [WelcomeModal.tsx](../../components/WelcomeModal.tsx).
