import { squirclePath } from '../squirclePath';

const numbers = (d: string) => (d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
// Every x,y pair in the path (arc commands mix in radii/flags, so only check continuous paths this way).
const points = (d: string) => {
  const n = numbers(d);
  const out: [number, number][] = [];
  for (let i = 0; i + 1 < n.length; i += 2) out.push([n[i], n[i + 1]]);
  return out;
};
const rect = { x: 20, y: 100, width: 170, height: 170 };

describe('squirclePath', () => {
  it('is a closed path', () => {
    const d = squirclePath(rect, 31, true);
    expect(d.startsWith('M')).toBe(true);
    expect(d.trim().endsWith('Z')).toBe(true);
  });

  it('with continuous corners, uses curves and stays inside the rectangle', () => {
    const d = squirclePath(rect, 31, true);
    expect(d).toContain('C');
    expect(d).not.toContain('A');
    for (const [x, y] of points(d)) {
      expect(x).toBeGreaterThanOrEqual(rect.x - 0.01);
      expect(x).toBeLessThanOrEqual(rect.x + rect.width + 0.01);
      expect(y).toBeGreaterThanOrEqual(rect.y - 0.01);
      expect(y).toBeLessThanOrEqual(rect.y + rect.height + 0.01);
    }
  });

  it('touches all four sides of the rectangle', () => {
    const pts = points(squirclePath(rect, 31, true));
    expect(Math.min(...pts.map((p) => p[0]))).toBeCloseTo(rect.x);
    expect(Math.max(...pts.map((p) => p[0]))).toBeCloseTo(rect.x + rect.width);
    expect(Math.min(...pts.map((p) => p[1]))).toBeCloseTo(rect.y);
    expect(Math.max(...pts.map((p) => p[1]))).toBeCloseTo(rect.y + rect.height);
  });

  it('with plain corners (Android), uses circular arcs', () => {
    const d = squirclePath(rect, 31, false);
    expect(d.match(/A/g)).toHaveLength(4);
  });

  it('shrinks the corner radius to fit a small rectangle, with no NaN', () => {
    for (const continuous of [true, false]) {
      const d = squirclePath({ x: -1003, y: -1003, width: 6, height: 6 }, 31, continuous);
      expect(d).not.toMatch(/NaN|Infinity/);
    }
  });
});
