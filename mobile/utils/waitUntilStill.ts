type Options = {
  /** Never resolve sooner than this, so a scroll that hasn't started yet isn't mistaken for "still". */
  minMs: number;
  /** Resolve by this time even if it's still moving. */
  maxMs: number;
  intervalMs?: number;
  /** How many identical readings in a row count as still. */
  stableReads?: number;
};

// Resolves once an element has stopped moving on screen, by measuring it repeatedly. Used before a
// tour step highlights something it just scrolled to: the highlight is placed from one measurement,
// so taking it mid-scroll leaves the highlight where the item was, not where it ends up.
export function waitUntilStill(
  measure: (cb: (y: number) => void) => void,
  { minMs, maxMs, intervalMs = 16, stableReads = 3 }: Options,
): Promise<void> {
  return new Promise((resolve) => {
    // Hard stop, even if a measurement never answers (e.g. the element unmounted).
    const giveUp = setTimeout(resolve, maxMs);
    const finish = () => { clearTimeout(giveUp); resolve(); };
    const startedAt = Date.now();
    let last: number | undefined;
    let still = 0;
    const tick = () => {
      measure((y) => {
        still = last !== undefined && Math.abs(y - last) < 0.5 ? still + 1 : 0;
        last = y;
        const elapsed = Date.now() - startedAt;
        if ((still >= stableReads && elapsed >= minMs) || elapsed >= maxMs) finish();
        else setTimeout(tick, intervalMs);
      });
    };
    tick();
  });
}
