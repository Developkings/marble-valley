import type { CourseData, CourseOp } from './course';

// Battle arenas, drawn in cells around the middle. Plates that overlap keep the earlier one,
// so the highest things come first and the ground last.

const WALL = 2.5;

const arena = (id: string, name: string, ops: CourseOp[]): CourseData => ({ version: 1, id, name, kind: 'arena', ops });

const spawns = (...at: [number, number][]): CourseOp[] => at.map(([x, z]) => ({ op: 'spawn', x, z }));
const boxes = (...at: [number, number][]): CourseOp[] => at.map(([x, z]) => ({ op: 'box', x, z }));

// A square from -half to half, flat.
const deck = (half: number, h: number): CourseOp => ({ op: 'plate', x: -half, z: -half, w: half * 2, d: half * 2, h });

const wallRound = (half: number, h: number): CourseOp[] => [
  { op: 'plate', x: -half - 1, z: -half - 1, w: half * 2 + 2, d: 1, h: h + WALL, kind: 'wall' },
  { op: 'plate', x: -half - 1, z: half, w: half * 2 + 2, d: 1, h: h + WALL, kind: 'wall' },
  { op: 'plate', x: -half - 1, z: -half, w: 1, d: half * 2, h: h + WALL, kind: 'wall' },
  { op: 'plate', x: half, z: -half, w: 1, d: half * 2, h: h + WALL, kind: 'wall' },
];

// Up onto a square from all four sides: each ramp is `len` long, `width` wide, from `low` at its foot to `high`.
const rampsTo = (half: number, len: number, width: number, low: number, high: number, sides = 'NSEW'): CourseOp[] => {
  const rise = high - low;
  const across = -width / 2;
  const ops: CourseOp[] = [];
  if (sides.includes('N')) ops.push({ op: 'plate', x: across, z: -half - len, w: width, d: len, h: low, rz: rise, dir: 'S' });
  if (sides.includes('S')) ops.push({ op: 'plate', x: across, z: half, w: width, d: len, h: high, rz: -rise, dir: 'N' });
  if (sides.includes('W')) ops.push({ op: 'plate', x: -half - len, z: across, w: len, d: width, h: low, rx: rise, dir: 'E' });
  if (sides.includes('E')) ops.push({ op: 'plate', x: half, z: across, w: len, d: width, h: high, rx: -rise, dir: 'W' });
  return ops;
};

// A walled yard with a deck in the middle and a second deck on top of that.
const stackedYard = arena('stacked-yard', 'Stacked Yard', [
  deck(5, 12),
  ...rampsTo(5, 9, 6, 6, 12, 'NS'),
  deck(14, 6),
  ...rampsTo(14, 9, 8, 0, 6),
  ...wallRound(32, 0),
  deck(32, 0),
  ...spawns([-26, -26], [26, 26], [26, -26], [-26, 26], [-10, 0], [10, 0], [0, -24], [0, 24]),
  ...boxes([-20, -20], [-16, -20], [20, -20], [16, -20], [-20, 20], [-16, 20], [20, 20], [16, 20]),
  ...boxes([-9, -9], [9, -9], [-9, 9], [9, 9], [-2, 0], [2, 0]),
]);

// Four keeps at the corners, two low and two high, joined all round by causeways over a sunken yard.
const fourKeeps = arena('four-keeps', 'Four Keeps', [
  { op: 'plate', x: 18, z: -32, w: 14, d: 14, h: 9 },
  { op: 'plate', x: -32, z: 18, w: 14, d: 14, h: 9 },
  { op: 'plate', x: -32, z: -32, w: 14, d: 14, h: 5 },
  { op: 'plate', x: 18, z: 18, w: 14, d: 14, h: 5 },
  // Round the outside, gently up and down from keep to keep.
  { op: 'plate', x: -18, z: -32, w: 36, d: 6, h: 5, rx: 4, dir: 'E' },
  { op: 'plate', x: -18, z: 26, w: 36, d: 6, h: 9, rx: -4, dir: 'W' },
  { op: 'plate', x: 26, z: -18, w: 6, d: 36, h: 9, rz: -4, dir: 'S' },
  { op: 'plate', x: -32, z: -18, w: 6, d: 36, h: 5, rz: 4, dir: 'N' },
  // Down into the yard from the two low keeps.
  { op: 'plate', x: -26, z: -18, w: 6, d: 12, h: 5, rz: -5, dir: 'S' },
  { op: 'plate', x: 20, z: 6, w: 6, d: 12, h: 0, rz: 5, dir: 'S' },
  // A block in the middle of the yard.
  deck(5, 3),
  ...rampsTo(5, 6, 4, 0, 3, 'NS'),
  deck(32, 0),
  ...spawns([-25, -25], [25, 25], [25, -25], [-25, 25], [-12, -12], [12, 12], [12, -12], [-12, 12]),
  ...boxes([-28, -28], [-22, -22], [22, 22], [28, 28], [28, -28], [22, -22], [-28, 22], [-22, 28]),
  ...boxes([0, -29], [0, 29], [29, 0], [-29, 0], [-1, 0], [1, 0], [-14, 8], [14, -8]),
]);

// A roof with no walls and four holes in it, tile by tile. The middle stands higher.
const TILE = 8;
const skyTile = (tx: number, tz: number, extra: Partial<Extract<CourseOp, { op: 'plate' }>> = {}): CourseOp => ({
  op: 'plate',
  x: (tx - 3.5) * TILE,
  z: (tz - 3.5) * TILE,
  w: TILE,
  d: TILE,
  h: 0,
  ...extra,
});
const SKY_HOLES = new Set(['1,1', '5,1', '1,5', '5,5']);
const skyRoof: CourseOp[] = [];
for (let tx = 0; tx < 7; tx++) {
  for (let tz = 0; tz < 7; tz++) {
    if (!SKY_HOLES.has(`${tx},${tz}`)) skyRoof.push(skyTile(tx, tz));
  }
}
const skyline = arena('skyline', 'Skyline', [
  skyTile(3, 3, { h: 5 }),
  skyTile(3, 2, { h: 0, rz: 5, dir: 'S' }),
  skyTile(3, 4, { h: 5, rz: -5, dir: 'N' }),
  skyTile(2, 3, { h: 0, rx: 5, dir: 'E' }),
  skyTile(4, 3, { h: 5, rx: -5, dir: 'W' }),
  ...skyRoof,
  ...spawns([-24, -24], [24, 24], [24, -24], [-24, 24], [0, -24], [0, 24], [-24, 0], [24, 0]),
  ...boxes([-11, -11], [11, -11], [-11, 11], [11, 11], [-26, -12], [26, 12], [-12, 26], [12, -26], [-2, 0], [2, 0]),
]);

// A square ring round a pit, with an island in the middle reached by narrow bridges, and a raised corner each way.
const craterRing = arena('crater-ring', 'Crater Ring', [
  deck(5, 4),
  { op: 'plate', x: 22, z: 22, w: 10, d: 10, h: 3 },
  { op: 'plate', x: -32, z: -32, w: 10, d: 10, h: 3 },
  { op: 'plate', x: -32, z: 22, w: 10, d: 10, h: 3 },
  { op: 'plate', x: 22, z: -32, w: 10, d: 10, h: 3 },
  { op: 'plate', x: 14, z: 24, w: 8, d: 6, h: 0, rx: 3, dir: 'E' },
  { op: 'plate', x: -22, z: -30, w: 8, d: 6, h: 3, rx: -3, dir: 'W' },
  { op: 'plate', x: -30, z: 14, w: 6, d: 8, h: 0, rz: 3, dir: 'S' },
  { op: 'plate', x: 24, z: -22, w: 6, d: 8, h: 3, rz: -3, dir: 'N' },
  ...rampsTo(5, 9, 4, 0, 4),
  { op: 'plate', x: -32, z: -32, w: 64, d: 18, h: 0 },
  { op: 'plate', x: -32, z: 14, w: 64, d: 18, h: 0 },
  { op: 'plate', x: -32, z: -14, w: 18, d: 28, h: 0 },
  { op: 'plate', x: 14, z: -14, w: 18, d: 28, h: 0 },
  ...spawns([0, -24], [0, 24], [-24, 0], [24, 0], [-27, -27], [27, 27], [27, -27], [-27, 27]),
  ...boxes([-20, 0], [-20, -6], [-20, 6], [20, 0], [20, -6], [20, 6], [0, -20], [-6, -20], [6, -20], [0, 20], [-6, 20], [6, 20]),
  ...boxes([-2, -2], [2, 2], [-27, -24], [27, 24]),
]);

export const ARENAS: CourseData[] = [stackedYard, fourKeeps, skyline, craterRing];
