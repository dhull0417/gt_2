type Measurable = { measureInWindow: (cb: (x: number, y: number, w: number, h: number) => void) => void };

type Args = {
  node: Measurable | null;
  /** Scrolls the page to this content offset, animated. */
  scrollTo: (y: number) => void;
  /** The page's live content offset, as last reported by its onScroll. */
  getScrollY: () => number;
  /** How far the page can scroll (content height minus the page's own height), if known. */
  maxScrollY?: number;
  windowH: number;
  insetTop: number;
  insetBottom: number;
  /** Runs before a scroll (only when one is needed): hide the current highlight so its fixed spot
   *  doesn't stay lit while the page moves under it. */
  beforeScroll?: () => Promise<void>;
  /** Give up waiting after this long and let the tour carry on. */
  maxMs?: number;
};

const INTERVAL_MS = 16;

const measureY = (node: Measurable) =>
  new Promise<{ y: number; h: number }>((resolve) => node.measureInWindow((_x, y, _w, h) => resolve({ y, h })));

// Polls until `done` returns true (checked every frame-ish), or until `deadline`.
async function pollUntil(done: () => Promise<boolean> | boolean, deadline: number): Promise<void> {
  while (Date.now() < deadline) {
    if (await done()) return;
    await new Promise((r) => setTimeout(r, INTERVAL_MS));
  }
}

// Brings a tour target fully on screen. The tour places its highlight from one measurement of where
// the target is, so this only resolves once that measurement is right.
//
// Two things to wait for: the scroll itself (tracked through the page's own scroll offset, which
// native reports reliably), and then the target's measured position catching up with it. On the
// new architecture measureInWindow can keep returning the pre-scroll position for a while after a
// programmatic scroll, so "the measurement stopped changing" isn't proof the scroll finished;
// that's what left the highlight below the tile it was meant for.
export async function scrollIntoViewForTour({
  node, scrollTo, getScrollY, maxScrollY, windowH, insetTop, insetBottom, beforeScroll, maxMs = 1500,
}: Args): Promise<void> {
  if (!node) return;
  const { y, h } = await measureY(node);
  if (y >= insetTop + 16 && y + h <= windowH - insetBottom - 16) return;

  await beforeScroll?.();
  const startScrollY = getScrollY();
  // Put the target a little above the middle, leaving room for the tip below or above it.
  let target = Math.max(0, startScrollY + y + h / 2 - windowH * 0.4);
  if (maxScrollY !== undefined) target = Math.min(target, Math.max(0, maxScrollY));
  if (Math.abs(target - startScrollY) < 1) return;
  scrollTo(target);

  const deadline = Date.now() + maxMs;
  // 1) The page has reached the target and stopped. If it stops short (the page couldn't scroll
  //    that far), accept that too, but only once it has actually moved and held still a while, so
  //    a scroll that hasn't started yet isn't taken for a finished one.
  let last = Number.NaN;
  let still = 0;
  await pollUntil(() => {
    const now = getScrollY();
    still = Math.abs(now - last) < 0.5 ? still + 1 : 0;
    last = now;
    if (Math.abs(now - target) < 1) return still >= 2;
    return Math.abs(now - startScrollY) >= 1 && still >= 6;
  }, deadline);

  // 2) The target's measurement reflects how far the page actually moved.
  const expectedY = y - (getScrollY() - startScrollY);
  await pollUntil(async () => Math.abs((await measureY(node)).y - expectedY) < 1, deadline);
}
