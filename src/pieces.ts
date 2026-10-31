import type { CourseOp, Dir, Kind } from './course';

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

export const seeded = (start: number) => {
  let seed = start;
  return (): number => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
};

export interface MazePlan {
  rows: string[];
  // The way through, as the middle of each room passed, from the door in to the door out, with row 0 at the far end.
  way: { col: number; row: number }[];
}

export interface MazeShape {
  corridor?: number; // blocks wide, odd so the doors can sit in the middle
  wall?: number;
  open?: boolean; // nothing between the corridors but a drop
}

// One way through and many dead ends. Of several tries it keeps the one with the longest way, and divides
// the way into regions that each have a respawn point, so that a fall never sends the marble further on.
export function mazePlan(seed: number, cols: number, rows: number, shape: MazeShape = {}): MazePlan {
  const corridor = shape.corridor ?? 3;
  const wall = shape.wall ?? 1;
  const pitch = corridor + wall;
  const rand = seeded(seed * 7919 + 13);
  const startRoom = (rows - 1) * cols + (cols - 1) / 2;
  const endRoom = (cols - 1) / 2;
  let parents: Int32Array = new Int32Array(0);
  let way: number[] = [];
  for (let attempt = 0; attempt < 16; attempt++) {
    const parent = new Int32Array(cols * rows).fill(-1);
    parent[startRoom] = startRoom;
    const stack = [startRoom];
    while (stack.length > 0) {
      const room = stack[stack.length - 1];
      const x = room % cols;
      const y = Math.floor(room / cols);
      const next: number[] = [];
      if (x + 1 < cols && parent[room + 1] < 0) next.push(room + 1);
      if (x > 0 && parent[room - 1] < 0) next.push(room - 1);
      if (y + 1 < rows && parent[room + cols] < 0) next.push(room + cols);
      if (y > 0 && parent[room - cols] < 0) next.push(room - cols);
      if (next.length === 0) {
        stack.pop();
        continue;
      }
      const chosen = next[Math.floor(rand() * next.length)];
      parent[chosen] = room;
      stack.push(chosen);
    }
    const path: number[] = [];
    for (let at = endRoom; ; at = parent[at]) {
      path.push(at);
      if (at === startRoom) break;
    }
    if (path.length > way.length) {
      way = path.reverse();
      parents = parent;
    }
  }

  // Each room belongs to the stretch of the way its branch leaves from.
  const stretches = Math.max(1, Math.min(9, Math.floor(way.length / 10)));
  const region = new Int32Array(cols * rows).fill(-1);
  way.forEach((room, i) => (region[room] = Math.floor((i * stretches) / way.length)));
  const regionOf = (room: number): number => (region[room] >= 0 ? region[room] : (region[room] = regionOf(parents[room])));
  const mark = (r: number): string => (r === 0 ? '.' : String(r));

  const blank = shape.open ? ' ' : '#';
  const grid = Array.from({ length: rows * pitch + wall }, () => new Array<string>(cols * pitch + wall).fill(blank));
  const fill = (x: number, y: number, w: number, h: number, ch: string): void => {
    for (let b = y; b < y + h; b++) for (let a = x; a < x + w; a++) grid[b][a] = ch;
  };
  for (let room = 0; room < cols * rows; room++) {
    const x = room % cols;
    const y = Math.floor(room / cols);
    const ch = mark(regionOf(room));
    fill(wall + x * pitch, wall + y * pitch, corridor, corridor, ch);
    const up = parents[room];
    if (up === room) continue;
    const ux = up % cols;
    const uy = Math.floor(up / cols);
    if (ux !== x) fill(wall + Math.min(x, ux) * pitch + corridor, wall + y * pitch, wall, corridor, ch);
    else fill(wall + x * pitch, wall + Math.min(y, uy) * pitch + corridor, corridor, wall, ch);
  }
  const door = wall + ((cols - 1) / 2) * pitch;
  fill(door, 0, corridor, wall, mark(stretches - 1));
  fill(door, rows * pitch, corridor, wall, '.');
  // A respawn point where each stretch begins.
  const middle = (corridor - 1) / 2;
  way.forEach((room, i) => {
    const r = Math.floor((i * stretches) / way.length);
    if (r === 0 || Math.floor(((i - 1) * stretches) / way.length) === r) return;
    grid[wall + Math.floor(room / cols) * pitch + middle][wall + (room % cols) * pitch + middle] = String.fromCharCode(64 + r);
  });
  return {
    rows: grid.map((row) => row.join('')),
    way: way.map((room) => ({ col: wall + (room % cols) * pitch + middle, row: wall + Math.floor(room / cols) * pitch + middle })),
  };
}

export const mazeRows = (seed: number, cols: number, rows: number, shape?: MazeShape): string[] => mazePlan(seed, cols, rows, shape).rows;

export interface MazeOptions extends MazeShape {
  floor?: Kind;
  pistons?: number;
  lasers?: number;
}

// A big maze with lanes to and from its doors, and with hazards standing in the way through it.
export function bigMaze(seed: number, cols: number, rows: number, options: MazeOptions = {}): CourseOp[] {
  const plan = mazePlan(seed, cols, rows, options);
  const centre = Math.floor(plan.rows[0].length / 2);
  const ops: CourseOp[] = [
    { op: 'run', dir: 'N', len: 6, width: 6 },
    { op: 'maze', rows: plan.rows, floor: options.floor, regions: true },
  ];
  const place = (spots: { col: number; row: number }[], count: number, make: (along: number, across: number, i: number) => CourseOp): void => {
    for (let i = 0; i < count && spots.length > 0; i++) {
      const at = spots[Math.floor(((i + 1) * spots.length) / (count + 1))];
      ops.push(make(-(Math.floor(at.row) + 1), at.col - centre, i));
    }
  };
  // Nothing comes down on a respawn point, and a laser only ever crosses a doorway on the way through,
  // since along a corridor there would be no getting past it.
  const rooms = plan.way.filter((at) => !/[A-Z]/.test(plan.rows[at.row][at.col]));
  const doorways = plan.way.slice(1).flatMap((at, i) => (plan.way[i].col === at.col ? [{ col: at.col, row: (at.row + plan.way[i].row) / 2 }] : []));
  place(rooms, options.pistons ?? 0, (along, across, i) => ({ op: 'piston', along, across, size: 3, period: 2.8 + (i % 3) * 0.3, phase: (i * 0.37) % 1 }));
  place(doorways, options.lasers ?? 0, (along, across, i) => ({ op: 'laser', along, across, width: options.corridor ?? 3, period: 2.6 + (i % 3) * 0.4, phase: (i * 0.29) % 1 }));
  ops.push({ op: 'run', dir: 'N', len: 8, width: 6 });
  return ops;
}

export const maze = (seed: number, cols: number, rows: number, width = 6): CourseOp[] => [
  { op: 'run', dir: 'N', len: 6, width },
  { op: 'maze', rows: mazeRows(seed, cols, rows), regions: true },
  { op: 'run', dir: 'N', len: 8, width },
];