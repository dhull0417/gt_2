// Lines for a "meetup / schedule updated" notification: what changed and the new value.
// The server builds them (backend utils/changeSummary.js) and stores them in `meta.changes`;
// notifications from before that change have none and keep the older one-line wording.
export interface ChangeLine {
  label: string;
  value: string;
}

export function getChangeLines(meta?: { changes?: { field?: string; label?: string; value?: string }[]; [key: string]: unknown } | null): ChangeLine[] {
  const list = meta?.changes;
  if (!Array.isArray(list)) return [];
  return list
    .filter((c): c is { label: string; value: string } => !!c && typeof c.label === 'string' && typeof c.value === 'string')
    .map(c => ({ label: c.label, value: c.value }));
}
