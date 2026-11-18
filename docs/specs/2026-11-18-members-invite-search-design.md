# Members page — invite bar + search

Size: small change (mobile only).

- **Invite bar** at the top of the Members page (`app/group-members/[id].tsx`): full-width teal bar, "Invite Members", opens `/group-invite/[id]` (same destination as the Invite tile). Shown to every member, like the Invite tile (user asked; visibility my call).
- **Search bar** directly under it: filters both sections (Owner & Moderators, Members) as you type, case-insensitive match on display name (first, last, or full). Section counts show the filtered number; a section with no matches is hidden; with no matches at all, show "No members match "<query>"". Clear (x) button resets. Client-side only — the full member list is already loaded.
- Both scroll with the list (not pinned) — my call.
- Sorting stays A–Z within each section.
