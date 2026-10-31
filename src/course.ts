export const CELL = 2;

export type Kind = 'plain' | 'ramp' | 'boost' | 'fast' | 'maze' | 'pad' | 'wall' | 'finish' | 'crumble';
export type Dir = 'N' | 'W' | 'E';

// The camera faces -z, so N is straight up the screen, W is left and E is right.
export const DIR_VEC: Record<Dir, { x: number; z: number }> = {
  N: { x: 0, z: -1 },
  W: { x: -1, z: 0 },
  E: { x: 1, z: 0 },
};

export interface Cell {
  ix: number;
  iz: number;
  h: number; // height at the cell's min-x, min-z corner
  sx: number; // height gradient per world unit
  sz: number;
  kind: Kind;
  section: number;
  dir?: Dir;
}

export interface Point {
  x: number;
  y: number;
  z: number;
}

// One ping-pong hop: from a pad to the next pad, or to the track after the last one.
export interface Hop {
  from: Point;
  to: Point;
}

export interface Piston extends Point {
  type: 'piston';
  size: number; // world units
  period: number;
  phase: number;
}

export interface Laser extends Point {
  type: 'laser';
  span: number; // world units across the track
  axis: 'x' | 'z'; // the world axis the beam lies along
  period: number;
  phase: number;
}

export interface Magnet extends Point {
  type: 'magnet';
  radius: number;
  strength: number;
}

export type Hazard = Piston | Laser | Magnet;

// A course is plain JSON: a list of building steps, so it can be saved, edited and sent to another player.
// Hazards are placed relative to the end of the last piece: along is back (negative) or ahead
// in the travel direction, across is to the right of it, both in cells.
export type CourseOp =
  | { op: 'backstop'; width: number }
  | { op: 'run'; dir: Dir; len: number; width: number; rise?: number; kind?: Kind; orbs?: number; orbLane?: number }
  | { op: 'drop'; amount: number }
  | { op: 'maze'; rows: string[] }
  | { op: 'rally'; offsets: number[]; space: number; size?: number }
  | { op: 'piston'; along: number; across: number; size: number; period: number; phase?: number }
  | { op: 'laser'; along: number; width: number; period: number; phase?: number }
  | { op: 'magnet'; along: number; across: number; radius: number; strength: number };

export interface CourseData {
  version: 1;
  id: string;
  name: string;
  ops: CourseOp[];
}

const WALL_HEIGHT = 2.5;
const LANDING_ROWS = 3;
const ORB_HEIGHT = 1.4;

const key = (ix: number, iz: number): number => (ix + 5000) * 10000 + (iz + 5000);

export class Course {
  readonly cells = new Map<number, Cell>();
  readonly list: Cell[] = [];
  readonly checkpoints: Point[] = [];
  readonly hops = new Map<number, Hop>();
  readonly orbs: Point[] = [];
  readonly hazards: Hazard[] = [];

  private cx = 0;
  private cz = 0;
  private h = 0;
  private dir: Dir | null = null;
  private width = 0;
  private lastPad = -1;

  constructor(readonly data: CourseData) {
    for (const step of data.ops) this.apply(step);
  }

  cellAt(x: number, z: number): Cell | undefined {
    return this.cells.get(key(Math.floor(x / CELL), Math.floor(z / CELL)));
  }

  heightOn(c: Cell, x: number, z: number): number {
    return c.h + c.sx * (x - c.ix * CELL) + c.sz * (z - c.iz * CELL);
  }

  private apply(step: CourseOp): void {
    switch (step.op) {
      case 'backstop':
        return this.backstop(step.width);
      case 'run':
        return this.run(step);
      case 'drop':
        this.h -= step.amount;
        return;
      case 'maze':
        return this.maze(step.rows);
      case 'rally':
        return this.rally(step.offsets, step.space, step.size ?? 5);
      case 'piston': {
        const p = this.placed(step.along, step.across);
        this.hazards.push({ type: 'piston', ...p, size: step.size * CELL, period: step.period, phase: step.phase ?? 0 });
        return;
      }
      case 'laser': {
        const p = this.placed(step.along, 0);
        const axis = this.dir === 'N' ? 'x' : 'z';
        this.hazards.push({ type: 'laser', ...p, span: step.width * CELL, axis, period: step.period, phase: step.phase ?? 0 });
        return;
      }
      case 'magnet': {
        const p = this.placed(step.along, step.across);
        this.hazards.push({ type: 'magnet', ...p, radius: step.radius * CELL, strength: step.strength });
        return;
      }
    }
  }

  private placed(along: number, across: number): Point {
    const d = DIR_VEC[this.dir ?? 'N'];
    // Right of travel: N gives +x, W gives -z, E gives +z.
    const x = (this.cx + 0.5 + d.x * along - d.z * across) * CELL;
    const z = (this.cz + 0.5 + d.z * along + d.x * across) * CELL;
    const c = this.cellAt(x, z);
    return { x, y: c ? this.heightOn(c, x, z) : this.h, z };
  }

  // A wall behind the start, so tilting back before setting off doesn't lose the marble.
  private backstop(width: number): void {
    const left = -Math.floor(width / 2) - 1;
    for (let w = left; w <= left + width + 1; w++) {
      this.put({ ix: this.cx + w, iz: this.cz + 1, h: this.h + WALL_HEIGHT, sx: 0, sz: 0, kind: 'wall', section: 0 });
    }
  }

  // A straight strip of blocks. Changing direction first lays a flat walled corner.
  private run(s: Extract<CourseOp, { op: 'run' }>): void {
    const { dir, len, width } = s;
    if (this.dir && this.dir !== dir) this.corner(dir, width);
    this.dir = dir;
    this.width = width;
    const section = this.addCheckpoint((this.cx + 0.5) * CELL, this.h, (this.cz + 0.5) * CELL);
    const d = DIR_VEC[dir];

    if (this.lastPad >= 0) {
      const c = this.checkpoints[section];
      this.linkHop({ x: c.x + d.x * LANDING_ROWS * CELL, y: c.y, z: c.z + d.z * LANDING_ROWS * CELL });
      this.lastPad = -1;
    }

    const rise = s.rise ?? 0;
    const kind = s.kind ?? (rise !== 0 ? 'ramp' : 'plain');
    const left = -Math.floor(width / 2);
    // Heights are stored at the min corner, which is the far end when travelling towards -x or -z.
    const towardsMin = dir !== 'E';

    for (let k = 0; k < len; k++) {
      const near = this.h + (rise * k) / len;
      const far = this.h + (rise * (k + 1)) / len;
      const gradient = (towardsMin ? near - far : far - near) / CELL;
      for (let w = left; w < left + width; w++) {
        this.put({
          ix: this.cx + d.x * k + (dir === 'N' ? w : 0),
          iz: this.cz + d.z * k + (dir === 'N' ? 0 : w),
          h: towardsMin ? far : near,
          sx: dir === 'N' ? 0 : gradient,
          sz: dir === 'N' ? gradient : 0,
          kind,
          section,
          dir,
        });
      }
    }

    const orbs = s.orbs ?? 0;
    for (let i = 0; i < orbs; i++) {
      const k = ((i + 0.5) * len) / orbs;
      const lane = s.orbLane ?? 0;
      this.orbs.push({
        x: (this.cx + 0.5 + d.x * k + (dir === 'N' ? lane : 0)) * CELL,
        y: this.h + (rise * k) / len + ORB_HEIGHT,
        z: (this.cz + 0.5 + d.z * k + (dir === 'N' ? 0 : lane)) * CELL,
      });
    }

    this.cx += d.x * len;
    this.cz += d.z * len;
    this.h += rise;
  }

  // Walled area read from a map, first string is the far end. # wall, . floor,
  // a digit is floor that starts a new respawn section from that row onwards.
  private maze(rows: string[]): void {
    const cols = rows[0].length;
    const centre = Math.floor(cols / 2);
    let section = this.addCheckpoint((this.cx + 0.5) * CELL, this.h, (this.cz + 0.5) * CELL);
    for (let r = 0; r < rows.length; r++) {
      const row = rows[rows.length - 1 - r];
      const iz = this.cz - r;
      const digit = r > 0 ? row.search(/\d/) : -1;
      if (digit >= 0) {
        section = this.addCheckpoint((this.cx + digit - centre + 0.5) * CELL, this.h, (iz + 0.5) * CELL);
      }
      for (let c = 0; c < cols; c++) {
        const wall = row[c] === '#';
        this.put({
          ix: this.cx + c - centre,
          iz,
          h: wall ? this.h + WALL_HEIGHT : this.h,
          sx: 0,
          sz: 0,
          kind: wall ? 'wall' : 'maze',
          section,
        });
      }
    }
    this.cz -= rows.length;
    this.dir = 'N';
    this.width = 3;
  }

  // Floating pads the marble is hit between, each offset sideways from the course centre.
  private rally(offsets: number[], space: number, size: number): void {
    const half = Math.floor(size / 2);
    for (const offset of offsets) {
      const ix = this.cx + offset;
      const point = { x: (ix + 0.5) * CELL, y: this.h, z: (this.cz - half + 0.5) * CELL };
      if (this.lastPad >= 0) this.linkHop(point);
      const section = this.addCheckpoint(point.x, point.y, point.z);
      for (let a = 0; a < size; a++) {
        for (let w = -half; w <= half; w++) {
          this.put({ ix: ix + w, iz: this.cz - a, h: this.h, sx: 0, sz: 0, kind: 'pad', section, dir: 'N' });
        }
      }
      this.lastPad = section;
      this.cz -= size + space;
      this.h -= 1.5;
    }
  }

  private addCheckpoint(x: number, y: number, z: number): number {
    this.checkpoints.push({ x, y, z });
    return this.checkpoints.length - 1;
  }

  private linkHop(to: Point): void {
    this.hops.set(this.lastPad, { from: this.checkpoints[this.lastPad], to });
  }

  private corner(next: Dir, nextWidth: number): void {
    const prev = DIR_VEC[this.dir!];
    const pivotX = this.cx - prev.x;
    const pivotZ = this.cz - prev.z;
    const back = Math.floor(this.width / 2);
    const front = Math.ceil(this.width / 2);
    const side = -Math.floor(nextWidth / 2);
    const section = this.checkpoints.length - 1;

    const n = DIR_VEC[next];
    const place = (along: number, across: number, kind: Kind, h: number): void => {
      // along runs in the next direction; across runs against the previous one.
      const ix = pivotX + n.x * along - prev.x * across;
      const iz = pivotZ + n.z * along - prev.z * across;
      if (!this.cells.has(key(ix, iz))) this.put({ ix, iz, h, sx: 0, sz: 0, kind, section });
    };

    for (let a = -back; a < front; a++) {
      for (let s = side; s < side + nextWidth; s++) place(a, s, 'plain', this.h);
    }
    // Raised lip on the outside of the turn, so corners can be taken fast.
    const lip = this.h + WALL_HEIGHT;
    for (let a = -back - 1; a < front; a++) place(a, side - 1, 'wall', lip);
    for (let s = side - 1; s < side + nextWidth; s++) place(-back - 1, s, 'wall', lip);

    this.cx = pivotX + n.x * front;
    this.cz = pivotZ + n.z * front;
  }

  private put(cell: Cell): void {
    const k = key(cell.ix, cell.iz);
    if (this.cells.has(k)) return;
    this.cells.set(k, cell);
    this.list.push(cell);
  }
}

export const FIRST_COURSE: CourseData = {
  version: 1,
  id: 'first-valley',
  name: 'First Valley',
  ops: [
    { op: 'backstop', width: 12 },
    { op: 'run', dir: 'N', len: 8, width: 12 },
    { op: 'run', dir: 'N', len: 4, width: 12, kind: 'boost' },
    { op: 'run', dir: 'N', len: 44, width: 10, kind: 'fast', rise: -10, orbs: 5, orbLane: -3 },
    { op: 'run', dir: 'N', len: 4, width: 10, kind: 'boost' },
    { op: 'run', dir: 'N', len: 44, width: 8, kind: 'fast', rise: -12, orbs: 5, orbLane: 2 },
    { op: 'run', dir: 'N', len: 16, width: 8, kind: 'maze' },
    { op: 'run', dir: 'E', len: 8, width: 8 },
    { op: 'run', dir: 'N', len: 12, width: 8 },
    { op: 'magnet', along: -6, across: 2, radius: 7, strength: 46 },
    { op: 'run', dir: 'W', len: 14, width: 8 },
    { op: 'laser', along: -5, width: 8, period: 2.6 },
    { op: 'run', dir: 'N', len: 8, width: 6 },
    {
      op: 'maze',
      rows: [
        '######...######',
        '#......4......#',
        '#.............#',
        '#.............#',
        '###########3..#',
        '#.............#',
        '#.............#',
        '#.............#',
        '#.2############',
        '#.............#',
        '#.............#',
        '#.............#',
        '###########1..#',
        '#.............#',
        '#.............#',
        '#.............#',
        '######...######',
      ],
    },
    { op: 'run', dir: 'N', len: 8, width: 6 },
    { op: 'rally', offsets: [0, 8, -8, 8], space: 10 },
    { op: 'run', dir: 'N', len: 4, width: 10, kind: 'boost' },
    { op: 'run', dir: 'N', len: 56, width: 10, kind: 'fast', rise: -18, orbs: 6, orbLane: -3 },
    { op: 'run', dir: 'N', len: 16, width: 6, kind: 'crumble' },
    { op: 'run', dir: 'N', len: 16, width: 8, kind: 'maze' },
    { op: 'run', dir: 'W', len: 8, width: 8 },
    { op: 'run', dir: 'N', len: 24, width: 8, orbs: 3 },
    { op: 'piston', along: -18, across: -2, size: 4, period: 3 },
    { op: 'piston', along: -8, across: 2, size: 4, period: 3, phase: 0.5 },
    { op: 'run', dir: 'N', len: 4, width: 8, kind: 'boost' },
    { op: 'run', dir: 'N', len: 36, width: 8, kind: 'fast' },
    { op: 'run', dir: 'N', len: 3, width: 8, kind: 'finish' },
    { op: 'run', dir: 'N', len: 18, width: 8 },
  ],
};
