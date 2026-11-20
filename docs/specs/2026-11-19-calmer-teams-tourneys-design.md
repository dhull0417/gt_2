# Calmer Teams & Tourneys — design

Date: 2026-11-19 · Size: medium (3 screens, 1 shared UI file, 4 new sheet components)

## Why
The Teams & Tourneys setup screen feels busy: seven accent colours (one per section), tinted cards, section
heights that range from a 40pt segmented control to 104pt tiles to an ever-growing Weighting card, and
sections that appear/disappear as options change. Goal: one calm, consistent rhythm across the feature.

## Goals
- One accent (brand colour) for selected states, switches and checks. Neutral surfaces everywhere else.
- Settings collapse to one-line summary rows; tapping a row opens a sheet with the detail.
- Rows that don't apply stay in place, greyed, with a short reason — no layout jumps.
- Same grouped-card style on the Results screen and the meetup-sheet card.

## Non-goals
- No change to what can be configured, server API, tournament logic or validation (`fixConfig`, `allowedFormats`, etc.).
- No change to RankingEditor's drag behaviour, ResultSheet, or BracketView's layout.
- No restyle of the rest of the app (Group Settings keeps its pastel style).

## Anti-goals
- Don't hide the preview behind a tap — it is the result of the choices.
- Don't drop team colour dots — they identify teams.

## Decisions (user)
- Collapse settings into one-line summaries that open sheets.
- Apply the calmer style to setup, Results, and the meetup Teams & Tourneys card.
- Approach B: shared building blocks in `components/tournament/ui.tsx`, one file per setup sheet.

## Decisions (Claude's calls — correct if wrong)
### Shared pieces (`components/tournament/ui.tsx`)
- `GroupCard` — `styles.card` with no inner padding, children separated by 1px `colors.border` hairlines.
- `SummaryRow({ label, value, onPress, disabledReason? })` — fixed min height 52pt; label left (optionLabel),
  value right (textMuted) + `chevron-right`. With `disabledReason`: 0.45 opacity, not pressable, value
  replaced by the reason.
- `SettingSheet({ visible, title, onClose, children })` — bottom sheet modelled on `ActionSheet` (transparent
  Modal, slide, backdrop tap / Android back closes), header with title and "Done", body in a ScrollView
  capped at 80% of screen height.
- Remove `useAccents`, `Accent`, `SectionHeader`, `TileGrid`/`Tile`, and the `accent` props on
  `Segmented`, `OptionRow`, `Stepper`. `Reveal`/`Glide` stay only where the preview appears.
- `TEAM_COLORS` unchanged.

### Summary text (pure helpers in `utils/tournament.ts`, unit-tested)
- Team split: `Teams of N` / `N teams`.
- Format: `FORMAT_LABEL[format]`.
- Per match: `N teams` / `N players` (singles).
- Results as: `RESULT_LABEL[resultType]`.
- Players: `N playing` (guests counted).
- Strength ranking: `Off`, or `On` / `<list name>` followed by ` · Balanced`, ` · Finale`, ` · Balanced, Finale` as switched on.
- Disabled reasons: Team split in Singles → `Teams only`; Per match and Results as when format is `none`
  → `Not used for Just teams`; a Format option not allowed → its existing note.

### Setup screen layout (top → bottom)
1. Subtitle: `<meetup> · N players` (unchanged). Premium gate unchanged.
2. Teams / Singles segmented control (neutral, brand pill), inline.
3. GroupCard "Match": Team split · Format · Per match · Results as.
4. GroupCard "Players": Players · Strength ranking.
5. Preview (when present): team cards as today (dot + name input + player chips), schedule rounds in plain
   cards with a sectionLabel-style round title (no purple), "Show all N rounds" in brand colour.
6. Error, "Preview teams" / "Shuffle again", "Start"/"Save" — unchanged.

### Sheets (`components/tournament/setup/`)
- `TeamSplitSheet` — size/count segmented, stepper, uneven-split note. Done closes.
- `FormatSheet`, per-match and results-as choices — `OptionRow` lists; picking one applies and closes.
  (Per match and Results as share one generic `ChoiceSheet`.)
- `PlayersSheet` — "I'm In" rows (locked) then "Also add (haven't answered)" checkboxes.
- `RankingSheet` — on/off switch, saved-list chips (neutral, brand when selected), Edit ranking, top-5 line,
  save-as-list field, Balance teams / Build to a finale switches. "Edit ranking" closes the sheet, opens
  RankingEditor, and reopens the sheet on Done/Cancel (avoids stacked modals on iOS).

### Results screen (`app/tournament/[id].tsx`)
- Champion: plain card, gold `award` icon kept, no amber border.
- "You're on / Your next match": a GroupCard of rows; "Enter result" becomes the row's action.
- Matches tab: one GroupCard per round, one row per match (title + status line); my matches marked with a
  small brand dot instead of a brand border.
- Teams tab: one GroupCard, one row per team (dot, name, players line, seed for managers).
- Standings table unchanged.

### Meetup card (`components/MeetupTournamentCard.tsx`)
- Whole card is pressable with a chevron; remove the full-width "See Results" button. Gold icon only when
  finished. Lines: format · count, then champion OR team/next-match.

## Left to the builder
Exact spacing values within these constraints; component prop naming beyond what's listed.
