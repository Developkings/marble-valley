import type { CourseOp, Dir } from './course';

// Stretches of track to build courses from: the levels here, and the track creator.

export const times = (n: number, make: (i: number) => CourseOp[]): CourseOp[] => {
  const ops: CourseOp[] = [];
  for (let i = 0; i < n; i++) ops.push(...make(i));
  return ops;
};

export const start = (width: number): CourseOp[] => [
  { op: 'backstop', width },
  { op: 'run', dir: 'N', len: 8, width },
];

export const finish = (width: number, dir: Dir = 'N'): CourseOp[] => [
  { op: 'run', dir, len: 3, width, kind: 'finish' },
  { op: 'run', dir, len: 18, width },
];

export const flat = (len: number, width: number, dir: Dir = 'N', orbs = 0): CourseOp[] => [{ op: 'run', dir, len, width, orbs }];

export const boost = (width: number, dir: Dir = 'N'): CourseOp[] => [{ op: 'run', dir, len: 4, width, kind: 'boost' }];

// A long fast run, falling by default so that it keeps gaining.
export const speed = (len: number, width: number, fall = len * 0.18, dir: Dir = 'N', orbs = 3): CourseOp[] => [
  { op: 'run', dir, len, width, kind: 'fast', rise: -fall, orbs, orbLane: (len % 5) - 2 },
];

export const climb = (len: number, width: number, rise: number, dir: Dir = 'N'): CourseOp[] => [{ op: 'run', dir, len, width, rise }];

// Off a ramp, over a gap and onto a long run downhill, long enough for any speed to land on.
export const jump = (width: number, gap = 14, dir: Dir = 'N'): CourseOp[] => [
  { op: 'run', dir, len: 4, width, kind: 'boost' },
  { op: 'run', dir, len: 6, width, kind: 'launch', rise: 3.6, sameSection: true },
  { op: 'gap', len: gap },
  { op: 'drop', amount: 6 },
  { op: 'run', dir, len: 60, width, kind: 'fast', rise: -10, orbs: 3 },
];

export const loop = (): CourseOp[] => [
  { op: 'run', dir: 'N', len: 12, width: 6, kind: 'fast' },
  { op: 'run', dir: 'N', len: 4, width: 6, kind: 'boost' },
  { op: 'loop', radius: 6, shift: 6, orb: true },
  { op: 'run', dir: 'N', len: 4, width: 10, kind: 'boost' },
  { op: 'run', dir: 'N', len: 20, width: 10, kind: 'fast', rise: -4 },
];

// Out to one side, onward, and back again. Legs must be longer than the track is wide.
export const zigzag = (leg: number, width: number, onward: number, first: Dir = 'E'): CourseOp[] => [
  { op: 'run', dir: first, len: leg, width },
  { op: 'run', dir: 'N', len: onward, width },
  { op: 'run', dir: first === 'E' ? 'W' : 'E', len: leg, width },
  { op: 'run', dir: 'N', len: onward, width },
];

export const ice = (len: number, width: number, fall = 0, dir: Dir = 'N'): CourseOp[] => [{ op: 'run', dir, len, width, kind: 'ice', rise: -fall }];

export const crumble = (len: number, width: number): CourseOp[] => [{ op: 'run', dir: 'N', len, width, kind: 'crumble' }];

export const rough = (len: number, width: number): CourseOp[] => [{ op: 'run', dir: 'N', len, width, kind: 'maze' }];

// Blocks coming down in turn, on alternating sides of the road.
export const pistons = (count: number, width: number, period = 3, dir: Dir = 'N'): CourseOp[] => {
  const side = Math.floor(width / 4);
  return times(count, (i) => [
    { op: 'run', dir, len: 12, width },
    { op: 'piston', along: -6, across: i % 2 ? side : -side, size: 3, period, phase: (i * 0.37) % 1 },
  ]);
};

export const lasers = (count: number, width: number, period = 2.6, dir: Dir = 'N'): CourseOp[] =>
  times(count, (i) => [
    { op: 'run', dir, len: 12, width },
    { op: 'laser', along: -6, width, period, phase: (i * 0.29) % 1 },
  ]);

export const magnets = (count: number, width: number, dir: Dir = 'N'): CourseOp[] =>
  times(count, (i) => [
    { op: 'run', dir, len: 16, width },
    { op: 'magnet', along: -8, across: i % 2 ? 2 : -2, radius: 7, strength: 44 },
  ]);

// Hops between floating pads, tilting the way the arrow says and back to land.
export const rally = (offsets: number[], space = 10): CourseOp[] => [
  { op: 'run', dir: 'N', len: 8, width: 6 },
  { op: 'rally', offsets, space },
  { op: 'run', dir: 'N', len: 12, width: 6 },
];

const seeded = (start: number) => {
  let seed = start;
  return (): number => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
};

// A maze with one way through, three blocks wide everywhere. Columns must be odd so the door sits in the middle.
export function mazeRows(seed: number, cols: number, rows: number): string[] {
  const rand = seeded(seed * 7919 + 13);
  const grid = Array.from({ length: rows * 4 + 1 }, () => new Array<string>(cols * 4 + 1).fill('#'));
  const open = (cx: number, cy: number, fromX: number, fromY: number): void => {
    for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) grid[cy * 4 + 1 + y][cx * 4 + 1 + x] = '.';
    // The wall between two cells opens along the shared side.
    if (fromX < cx) for (let y = 0; y < 3; y++) grid[cy * 4 + 1 + y][cx * 4] = '.';
    if (fromX > cx) for (let y = 0; y < 3; y++) grid[cy * 4 + 1 + y][cx * 4 + 4] = '.';
    if (fromY < cy) for (let x = 0; x < 3; x++) grid[cy * 4][cx * 4 + 1 + x] = '.';
    if (fromY > cy) for (let x = 0; x < 3; x++) grid[cy * 4 + 4][cx * 4 + 1 + x] = '.';
  };
  const seen = new Set<number>();
  const startX = (cols - 1) / 2;
  const stack: [number, number][] = [[startX, rows - 1]];
  seen.add((rows - 1) * cols + startX);
  open(startX, rows - 1, startX, rows - 1);
  while (stack.length > 0) {
    const [x, y] = stack[stack.length - 1];
    const next = [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]].filter(
      ([nx, ny]) => nx >= 0 && ny >= 0 && nx < cols && ny < rows && !seen.has(ny * cols + nx),
    );
    if (next.length === 0) {
      stack.pop();
      continue;
    }
    const [nx, ny] = next[Math.floor(rand() * next.length)];
    seen.add(ny * cols + nx);
    open(nx, ny, x, y);
    stack.push([nx, ny]);
  }
  // Doors in the middle of the near and far walls.
  const door = cols * 2;
  for (let x = -1; x <= 1; x++) {
    grid[0][door + x] = '.';
    grid[rows * 4][door + x] = '.';
  }
  return grid.map((row) => row.join(''));
}

export const maze = (seed: number, cols: number, rows: number, width = 6): CourseOp[] => [
  { op: 'run', dir: 'N', len: 6, width },
  { op: 'maze', rows: mazeRows(seed, cols, rows) },
  { op: 'run', dir: 'N', len: 8, width },
];
