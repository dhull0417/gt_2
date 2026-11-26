import { scrollIntoViewForTour } from '../scrollIntoViewForTour';

// A fake page: scrolling animates over `scrollMs`, and the element's measured position only catches
// up `lagMs` after the scroll ends (like measureInWindow on the new architecture).
const setup = (y: number, { h = 170, scrollMs = 300, lagMs = 0, maxScrollY }: { h?: number; scrollMs?: number; lagMs?: number; maxScrollY?: number } = {}) => {
  const order: string[] = [];
  let scrollY = 100;
  let measuredScrollY = 100;
  const node = { measureInWindow: (cb: (x: number, y: number, w: number, h: number) => void) => cb(0, y - (measuredScrollY - 100), 160, h) };
  const scrollTo = jest.fn((to: number) => {
    order.push(`scrollTo:${Math.round(to)}`);
    setTimeout(() => { scrollY = to; }, scrollMs);
    setTimeout(() => { measuredScrollY = to; }, scrollMs + lagMs);
  });
  const beforeScroll = jest.fn(async () => { order.push('hide'); });
  const args = { node, scrollTo, getScrollY: () => scrollY, maxScrollY, windowH: 800, insetTop: 50, insetBottom: 30, beforeScroll };
  return { order, scrollTo, beforeScroll, args, node };
};

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

it('does nothing for a tile already fully on screen', async () => {
  const { args, scrollTo, beforeScroll } = setup(200);
  await scrollIntoViewForTour(args);
  expect(beforeScroll).not.toHaveBeenCalled();
  expect(scrollTo).not.toHaveBeenCalled();
});

it('for a tile below the fold, hides the highlight first, then scrolls, then waits for it to stop', async () => {
  const { args, order } = setup(700);
  let done = false;
  scrollIntoViewForTour(args).then(() => { done = true; });
  await jest.advanceTimersByTimeAsync(0);
  expect(order).toEqual(['hide', 'scrollTo:565']); // 100 + 700 + 170/2 - 800*0.4
  await jest.advanceTimersByTimeAsync(200);
  expect(done).toBe(false); // still scrolling
  await jest.advanceTimersByTimeAsync(300);
  expect(done).toBe(true);
});

it('waits for a lagging measurement to catch up with the scroll (the highlight-below-the-tile bug)', async () => {
  const { args, node } = setup(700, { lagMs: 250 });
  let done = false;
  scrollIntoViewForTour(args).then(() => { done = true; });
  await jest.advanceTimersByTimeAsync(400); // scroll finished, measurement still stale
  expect(done).toBe(false);
  await jest.advanceTimersByTimeAsync(300);
  expect(done).toBe(true);
  let y = 0;
  node.measureInWindow((_x, y2) => { y = y2; });
  expect(y).toBe(700 - 465);
});

it('never scrolls past the end of the page', async () => {
  const { args, scrollTo } = setup(700, { maxScrollY: 300 });
  const p = scrollIntoViewForTour(args);
  await jest.advanceTimersByTimeAsync(1000);
  await p;
  expect(scrollTo).toHaveBeenCalledWith(300);
});

it('never scrolls above the top of the page', async () => {
  const { args, scrollTo } = setup(-500);
  const p = scrollIntoViewForTour(args);
  await jest.advanceTimersByTimeAsync(1000);
  await p;
  expect(scrollTo).toHaveBeenCalledWith(0);
});

it('gives up after maxMs rather than hanging the tour', async () => {
  const { args } = setup(700, { lagMs: 100000 });
  let done = false;
  scrollIntoViewForTour({ ...args, maxMs: 1000 }).then(() => { done = true; });
  await jest.advanceTimersByTimeAsync(1100);
  expect(done).toBe(true);
});

it('resolves straight away when there is no tile', async () => {
  const { args } = setup(700);
  await expect(scrollIntoViewForTour({ ...args, node: null })).resolves.toBeUndefined();
});
