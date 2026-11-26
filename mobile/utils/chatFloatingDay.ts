// The floating date pill at the top of the chat (our own stand-in for SectionList sticky headers,
// which cache their positions and drift out of place when older pages are prepended).
//
// Given what the list reports as on screen, top to bottom, it shows the day of the top message,
// except while that day's own date bubble is still visible, so the two never double up.
// Day headers and footers both arrive with index null; a null entry for the top message's day
// that comes before that message can only be the day's header.

export interface VisibleRow {
  index: number | null;
  section: { title: string } | null | undefined;
}

export function floatingDayLabel(rows: readonly VisibleRow[]): string | null {
  const topMessageAt = rows.findIndex((r) => r.index != null && r.section);
  if (topMessageAt < 0) return null;
  const section = rows[topMessageAt].section!;
  const ownBubbleVisible = rows.slice(0, topMessageAt).some((r) => r.index == null && r.section === section);
  return ownBubbleVisible ? null : section.title;
}
