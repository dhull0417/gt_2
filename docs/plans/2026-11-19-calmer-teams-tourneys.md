# Calmer Teams & Tourneys — implementation plan

> **Status 2026-11-19:** Tasks 1–9 implemented; tsc clean; full jest suite passes (excluding two suites that need image assets missing from the test mirror). Not committed (unrelated uncommitted work in the tree). Manual device checks in Tasks 6, 8, 9 still to do. Deviation: on Results, "Enter result" is its own row under "Your next match" so the match title stays visible.

**Goal:** Replace the seven-colour, mixed-height Teams & Tourneys UI with one-accent grouped cards and one-line summary rows that open sheets, across setup, Results and the meetup card.

**Architecture:** Three shared primitives (`GroupCard`, `SummaryRow`, `SettingSheet`) live in `components/tournament/ui.tsx`. Each setup detail moves into its own sheet component under `components/tournament/setup/`. Summary strings come from pure helpers in `utils/tournament.ts`. Screens keep all state and API calls where they are today; only presentation moves.

**Tech stack:** Expo / React Native, TypeScript, jest-expo + @testing-library/react-native.

**Spec:** `docs/specs/2026-11-19-calmer-teams-tourneys-design.md`

**Global constraints**
- Accent = `colors.brand` only. No hex colours in the touched files except `TEAM_COLORS` and the gold trophy `#F59E0B`.
- `SummaryRow` min height 52; GroupCard hairline 1px `colors.border`; disabled opacity 0.45.
- `SettingSheet` body max height 80% of window height.
- No change to API calls, `fixConfig`/`allowedFormats`/`allowedResultTypes`, or the `body()`/`save()`/`runPreview()` logic in setup.
- Commands, run from `mobile/`: tests `npx jest`, types `npx tsc --noEmit`.

**Review focus** (each has a test in the named task)
1. Disabled row must not fire `onPress` (Task 2).
2. Turning the ranking on with both toggles off auto-enables Balance (teams) / Finale (singles), as today (Task 5).
3. Ranking summary when a selected list was deleted/missing → falls back to `On` (Task 1).
4. Players count includes guests (Task 1).
5. Choice sheet: tapping a disabled option does nothing and doesn't close (Task 3).

## File map
| File | Change | Responsibility |
|---|---|---|
| `mobile/utils/tournament.ts` | modify | summary + disabled-reason helpers |
| `mobile/utils/__tests__/tournament.test.ts` | modify | helper tests |
| `mobile/components/tournament/ui.tsx` | modify | add primitives; later remove accents/tiles/SectionHeader |
| `mobile/components/tournament/__tests__/ui.test.tsx` | create | primitive tests |
| `mobile/components/tournament/setup/ChoiceSheet.tsx` | create | single-choice list sheet (Format, Per match, Results as) |
| `mobile/components/tournament/setup/TeamSplitSheet.tsx` | create | size/count + stepper + uneven note |
| `mobile/components/tournament/setup/PlayersSheet.tsx` | create | In list + add undecided |
| `mobile/components/tournament/setup/RankingSheet.tsx` | create | everything from the Weighting block |
| `mobile/components/tournament/setup/__tests__/sheets.test.tsx` | create | sheet tests |
| `mobile/app/tournament-setup/[meetupId].tsx` | modify | rows + sheets, neutral preview |
| `mobile/app/tournament/[id].tsx` | modify | grouped cards on Results |
| `mobile/components/MeetupTournamentCard.tsx` | modify | pressable card |

---

### Task 1 — Summary helpers
**Files:** `utils/tournament.ts`, `utils/__tests__/tournament.test.ts`
**Produces:**
- `splitSummary(splitBy: 'size'|'count', n: number): string`
- `perMatchSummary(mode: TMode, n: number): string`
- `playersSummary(total: number): string`
- `rankingSummary(on: boolean, listName: string | null, balance: boolean, finale: boolean): string`
- `NOT_FOR_JUST_TEAMS = 'Not used for Just teams'`, `TEAMS_ONLY = 'Teams only'`
- [ ] Write failing tests:
  - `splitSummary('size',2)` → `'Teams of 2'`; `splitSummary('count',4)` → `'4 teams'`
  - `perMatchSummary('teams',3)` → `'3 teams'`; `('singles',2)` → `'2 players'`
  - `playersSummary(8)` → `'8 playing'`; `playersSummary(1)` → `'1 playing'`
  - `rankingSummary(false,'Spring',true,true)` → `'Off'`; `(true,null,false,false)` → `'On'`; `(true,'Spring',true,false)` → `'Spring · Balanced'`; `(true,null,false,true)` → `'On · Finale'`; `(true,'Spring',true,true)` → `'Spring · Balanced, Finale'`
- [ ] `npx jest utils/__tests__/tournament.test.ts` → FAIL (`splitSummary is not a function` / import error)
- [ ] Implement in `utils/tournament.ts`
- [ ] Run → PASS
- [ ] Commit `Teams & Tourneys: summary text helpers`
(Caller passes `listName = lists.find(l => l._id === listId)?.name ?? null`, covering review focus 3; guest-inclusive total is `totalPlayers` already computed in setup, focus 4 is covered by passing that.)

### Task 2 — Shared primitives
**Files:** `components/tournament/ui.tsx`, `components/tournament/__tests__/ui.test.tsx`
**Produces:**
- `GroupCard({ children, style? })` — interleaves hairlines between non-null children.
- `SummaryRow({ label: string; value: string; onPress: () => void; disabledReason?: string; testID?: string })`
- `SettingSheet({ visible: boolean; title: string; onClose: () => void; children })` — header "Done" calls `onClose`.
- [ ] Failing tests (mock AppearanceContext + safe-area like `ActionSheet.test.tsx`):
  - SummaryRow shows label and value; press calls `onPress`.
  - With `disabledReason='Teams only'`: shows `'Teams only'`, not the value; press does **not** call `onPress`.
  - SettingSheet visible renders title + children; pressing `Done` calls `onClose`; `visible={false}` renders no title.
  - GroupCard with 3 children renders 2 elements with `testID="group-divider"`.
- [ ] Run → FAIL (exports missing)
- [ ] Implement (SettingSheet modelled on `components/ActionSheet.tsx`: transparent Modal, slide, backdrop + `onRequestClose` close).
- [ ] Run → PASS; run full `npx jest`
- [ ] Commit `Teams & Tourneys: GroupCard, SummaryRow, SettingSheet`

### Task 3 — ChoiceSheet
**Files:** `components/tournament/setup/ChoiceSheet.tsx`, `setup/__tests__/sheets.test.tsx`
**Consumes:** `SettingSheet`, `OptionRow`
**Produces:** `ChoiceSheet<T extends string|number>({ visible, title, value: T, options: { value: T; label: string; sub?: string; disabled?: boolean; note?: string }[], onPick: (v: T) => void, onClose })`. Disabled options show `note` as their sub.
- [ ] Failing tests: tapping an enabled option calls `onPick(value)` then `onClose`; tapping a disabled option calls neither; disabled option shows its note.
- [ ] Run → FAIL; implement; run → PASS; full suite
- [ ] Commit `Teams & Tourneys: ChoiceSheet`

### Task 4 — TeamSplitSheet and PlayersSheet
**Files:** `setup/TeamSplitSheet.tsx`, `setup/PlayersSheet.tsx`, `setup/__tests__/sheets.test.tsx`
**Produces:**
- `TeamSplitSheet({ visible, onClose, splitBy, value, totalPlayers, ranked: boolean, onSplitBy(v), onValue(n) })` — renders the uneven-split note text exactly as today's setup screen.
- `PlayersSheet({ visible, onClose, inRows: { id; label; sub }[], undecided: { id; label }[], extra: string[], onToggle(id) })`
- [ ] Failing tests: TeamSplitSheet with `splitBy='size', value=3, totalPlayers=7, ranked=false` shows text containing `'7 players can't be split evenly into teams of 3'`; pressing "More players per team" calls `onValue(4)`. PlayersSheet: undecided row press calls `onToggle(id)`; "Also add (haven't answered)" hidden when `undecided` is empty.
- [ ] Run → FAIL; implement (move JSX from setup screen, accents removed); run → PASS; full suite
- [ ] Commit `Teams & Tourneys: team split and players sheets`

### Task 5 — RankingSheet
**Files:** `setup/RankingSheet.tsx`, `setup/__tests__/sheets.test.tsx`
**Produces:** `RankingSheet({ visible, onClose, on, onToggle(v: boolean), mode: TMode, format: TFormat, lists: RankingList[], listId, onPickList(id|null), preview: string, count: number, onEditRanking(), newListName, onNewListName(s), onSaveList(), saving: boolean, balance, finale, onBalance(v), onFinale(v) })`
- [ ] Failing tests: switch on calls `onToggle(true)`; when `on=false` the list chips/Edit ranking are not rendered; Balance switch hidden for `mode='singles'`; Finale hidden for `format='none'`; "Edit ranking (5)" press calls `onEditRanking`.
- [ ] Run → FAIL; implement; PASS; full suite
- [ ] Commit `Teams & Tourneys: ranking sheet`
(Auto-enable rule, review focus 2, stays in the screen's `onToggle` handler — test it by extracting `rankingToggledOn(config, mode): Partial<TournamentConfig>` into `utils/tournament.ts` with tests: teams + both off → `{ balanceTeams: true }`; singles + both off → `{ buildToFinale: true }`; any already on → `{}`.)

### Task 6 — Rewire the setup screen
**Files:** `app/tournament-setup/[meetupId].tsx`
**Consumes:** everything above.
- [ ] Add state `sheet: null | 'split' | 'format' | 'perMatch' | 'results' | 'players' | 'ranking'`.
- [ ] Replace sections with: neutral `Segmented` (mode) → `GroupCard` Match rows → `GroupCard` Players rows, disabled reasons per spec. Rows always rendered (no Reveal around them).
- [ ] "Edit ranking": `setSheet(null); setEditing('players')`; RankingEditor `onDone`/`onCancel` also `setSheet('ranking')`.
- [ ] Preview: remove `tinted(accents.purple)` → `styles.card`; round title uses `styles.sectionLabel`-like text (textFaint); "Show all" uses `styles.action`; remove SectionHeaders, use `styles.sectionLabel` "Preview" / "Schedule" / "Bracket".
- [ ] `npx tsc --noEmit` → no new errors; full `npx jest` → PASS
- [ ] Manual check on device (light + dark): every row opens its sheet; Singles greys Team split; Just teams greys Per match and Results as; no layout jump on toggles; preview/start still work; edit flow from Results "Edit setup" loads saved values into summaries.
- [ ] Commit `Teams & Tourneys setup: summary rows and sheets`

### Task 7 — Remove the colourful pieces
**Files:** `components/tournament/ui.tsx`
- [ ] Delete `useAccents`, `Accent`, `SectionHeader`, `Tile`, `TileGrid`, and `accent` props from `Segmented`/`OptionRow`/`Stepper`; drop the now-unused `useAppearance` import.
- [ ] `grep -rn "useAccents\|TileGrid\|accent=" mobile/app mobile/components` → no tournament hits
- [ ] tsc + full jest → PASS
- [ ] Commit `Teams & Tourneys: drop per-section accents`

### Task 8 — Results screen
**Files:** `app/tournament/[id].tsx`
- [ ] Champion card: remove `borderColor: '#F59E0B'`, keep icon.
- [ ] You're on / Next match → `GroupCard` with `SummaryRow`-style rows; when reportable, the next-match row's press opens ResultSheet and its value reads `Enter result`.
- [ ] Matches tab: per round one `GroupCard`; `MatchRow` becomes a row (title + status), my match shows an 8px brand dot left of the title, no border.
- [ ] Teams tab: one `GroupCard`, one row per team.
- [ ] tsc + full jest; manual check (matches, standings, bracket, teams tabs; enter a result).
- [ ] Commit `Teams & Tourneys results: grouped cards`

### Task 9 — Meetup card
**Files:** `components/MeetupTournamentCard.tsx`
- [ ] Wrap the card in `PressableOpacity` → `onOpen(...)`; add `chevron-right` at the title row end; remove the secondary button; icon colour `textMuted` unless finished (gold).
- [ ] tsc + full jest; manual check on the meetup sheet.
- [ ] Commit `Teams & Tourneys card: tappable, no button`

### Final
- [ ] Reread spec line by line against the app; fresh-eyes review of the full diff against the spec.
