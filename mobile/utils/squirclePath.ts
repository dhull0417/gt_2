type Rect = { x: number; y: number; width: number; height: number };
type Vec = [number, number];

// Proportions of Apple's "continuous" rounded corner (the squircle iOS draws for borderCurve:
// 'continuous'), as the widely used PaintCode approximation. Distances are multiples of the radius,
// measured back along the edge coming into the corner (s) and along the edge leaving it (t).
const A = 1.52866483, B = 1.08849296, C = 0.86840694, D = 0.63149399, E = 0.074911, F = 0.37282237, G = 0.16905899;
const CONTINUOUS: [number, number][][] = [
  [[B, 0], [C, 0], [D, E]],
  [[F, G], [G, F], [E, D]],
  [[0, C], [0, B], [0, A]],
];

const r2 = (n: number) => Math.round(n * 100) / 100;

// SVG path for a rectangle with rounded corners. continuous: iOS-style squircle corners (matching
// tiles drawn with borderCurve: 'continuous'); otherwise plain circular corners, as Android draws them.
export function squirclePath({ x, y, width, height }: Rect, radius: number, continuous: boolean): string {
  const w = Math.max(0, width), h = Math.max(0, height);
  // A continuous corner needs A*r of each edge; a circular one needs r.
  const r = Math.max(0, Math.min(radius, Math.min(w, h) / 2 / (continuous ? A : 1)));
  // Corners clockwise from top-right: the corner point, the direction of the edge coming in (u) and
  // going out (v).
  const corners: [Vec, Vec, Vec][] = [
    [[x + w, y], [1, 0], [0, 1]],
    [[x + w, y + h], [0, 1], [-1, 0]],
    [[x, y + h], [-1, 0], [0, -1]],
    [[x, y], [0, -1], [1, 0]],
  ];
  const at = ([cx, cy]: Vec, [ux, uy]: Vec, [vx, vy]: Vec, s: number, t: number) =>
    `${r2(cx - ux * s * r + vx * t * r)} ${r2(cy - uy * s * r + vy * t * r)}`;

  const startS = continuous ? A : 1;
  let d = `M ${at(...corners[0], startS, 0)}`;
  for (const corner of corners) {
    d += ` L ${at(...corner, startS, 0)}`;
    if (continuous) {
      for (const seg of CONTINUOUS) d += ` C ${seg.map(([s, t]) => at(...corner, s, t)).join(' ')}`;
    } else {
      d += ` A ${r2(r)} ${r2(r)} 0 0 1 ${at(...corner, 0, 1)}`;
    }
  }
  return `${d} Z`;
}
