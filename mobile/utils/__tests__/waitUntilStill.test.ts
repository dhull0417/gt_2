import { waitUntilStill } from '../waitUntilStill';

// A fake element whose on-screen y follows a script of positions, one per measurement.
const scripted = (ys: number[]) => {
  let i = 0;
  const measure = jest.fn((cb: (y: number) => void) => cb(ys[Math.min(i++, ys.length - 1)]));
  return { measure, reads: () => i };
};

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

const run = async (p: Promise<void>, ms: number) => {
  let done = false;
  p.then(() => { done = true; });
  await jest.advanceTimersByTimeAsync(ms);
  return done;
};

it('waits while the element is still moving and resolves once it stops', async () => {
  // Scrolling up: 900, 820, 700, 600, 560, 550, then still at 550.
  const el = scripted([900, 820, 700, 600, 560, 550]);
  const p = waitUntilStill(el.measure, { minMs: 0, maxMs: 2000, intervalMs: 16 });
  expect(await run(p, 16 * 5)).toBe(false); // still moving
  expect(await run(p, 16 * 5)).toBe(true);
  expect(el.reads()).toBeGreaterThanOrEqual(8);
});

it('does not resolve before minMs, even if nothing has moved yet (the scroll may not have started)', async () => {
  const el = scripted([900]);
  const p = waitUntilStill(el.measure, { minMs: 120, maxMs: 2000, intervalMs: 16 });
  expect(await run(p, 100)).toBe(false);
  expect(await run(p, 100)).toBe(true);
});

it('gives up at maxMs if the element never settles', async () => {
  let y = 0;
  const measure = (cb: (y: number) => void) => cb((y += 10));
  const p = waitUntilStill(measure, { minMs: 0, maxMs: 300, intervalMs: 16 });
  expect(await run(p, 250)).toBe(false);
  expect(await run(p, 100)).toBe(true);
});

it('still resolves at maxMs if measuring never answers', async () => {
  const p = waitUntilStill(() => {}, { minMs: 0, maxMs: 300, intervalMs: 16 });
  expect(await run(p, 250)).toBe(false);
  expect(await run(p, 100)).toBe(true);
});
