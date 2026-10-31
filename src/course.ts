export const CELL = 2;

export type Kind = 'plain' | 'ramp' | 'boost' | 'fast' | 'maze' | 'pad' | 'wall' | 'finish' | 'crumble' | 'launch' | 'ice';
export type Dir = 'N' | 'W' | 'E' | 'S';

// The camera faces -z, so N is straight up the screen, W is left, E is right and S is down it.
export const DIR_VEC: Record<Dir, { x: number; z: number }> = {
  N: { x: 0, z: -1 },
  W: { x: -1, z: 0 },
  E: { x: 1, z: 0 },
  S: { x: 0, z: 1 },
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

// A vertical loop. The marble enters at the bottom and comes back to the bottom shifted sideways,
// so the lane out runs beside the lane in rather than through it.
export interface Loop extends Point {
  radius: number; // world units
  width: number; // world units across the lane in
  dir: Dir;
  shift: number; // world units to the right of travel, covered on the way down
  section: number;
}

// Where on a loop angle a is: 0 at the bottom going in, PI at the top, 2 PI at the bottom coming out.
export function loopPoint(l: Loop, a: number, out: Point, radius = l.radius): void {
  const d = DIR_VEC[l.dir];
  const along = radius * Math.sin(a);
  const k = Math.max(0, Math.min(1, (a - Math.PI) / Math.PI));
  const across = l.shift * k * k * (3 - 2 * k);
  out.x = l.x + d.x * along - d.z * across;
  out.y = l.y + radius * (1 - Math.cos(a));
  out.z = l.z + d.z * along + d.x * across;
}

// A course is plain JSON: a list of building steps, so it can be saved, edited and sent to another player.
// Hazards are placed relative to the end of the last piece: along is back (negative) or ahead
// in the travel direction, across is to the right of it, both in cells.
export type CourseOp =
  | { op: 'backstop'; width: number }
  // sameSection keeps the previous respawn point, for pieces that are no use from a standing start.
  | { op: 'run'; dir: Dir; len: number; width: number; rise?: number; kind?: Kind; orbs?: number; orbLane?: number; sameSection?: boolean }
  | { op: 'drop'; amount: number }
  | { op: 'gap'; len: number }
  | { op: 'loop'; radius: number; shift: number; orb?: boolean }
  // Turns a quarter circle towards to, on a curve this many blocks from its centre to the middle of the road.
  | { op: 'bend'; to: Dir; radius: number; width: number; rise?: number; kind?: Kind; rail?: boolean; orbs?: number }
  // A road carrying on the same way, shaped as it goes: snaking from side to side by amp, moving over by shift,
  // narrowing by pinch in the middle, and rising and falling by hump.
  | { op: 'wave'; len: number; width: number; amp?: number; waves?: number; shift?: number; pinch?: number; hump?: number; humps?: number; rise?: number; kind?: Kind; rails?: boolean; orbs?: number }
  // Bands of holes in the road, or posts standing on it, with a way through each and clear road between them.
  | { op: 'field'; len: number; width: number; seed: number; holes?: boolean; posts?: boolean; kind?: Kind }
  // The road parts around a hole and joins up again. side moves the hole over, so one way is narrower than the other.
  | { op: 'fork'; len: number; width: number; island: number; side?: number; kinds?: [Kind, Kind] }
  // Regions: a digit is floor belonging to that part of the way through, whose respawn point is at the letter
  // (A for 1, B for 2...), and a space is nothing at all.
  | { op: 'maze'; rows: string[]; floor?: Kind; regions?: boolean }
  | { op: 'rally'; offsets: number[]; space: number; size?: number }
  | { op: 'piston'; along: number; across: number; size: number; period: number; phase?: number }
  | { op: 'laser'; along: number; across?: number; width: number; period: number; phase?: number }
  | { op: 'magnet'; along: number; across: number; radius: number; strength: number }
  // Weapon boxes in a row across the track, for racing.
  | { op: 'items'; along: number; across: number[] }
  // Arenas are drawn as rectangles at fixed places, in cells. Where they overlap, the earlier one stays,
  // so the highest platforms come first. rx and rz are how much it rises across its width and depth.
  | { op: 'plate'; x: number; z: number; w: number; d: number; h: number; rx?: number; rz?: number; kind?: Kind; dir?: Dir }
  | { op: 'spawn'; x: number; z: number }
  | { op: 'box'; x: number; z: number };

export interface CourseData {
  version: 1;
  id: string;
  name: string;
  // A course runs from a start to a finish, a circuit joins up with itself, an arena is fought in.
  kind?: 'course' | 'circuit' | 'arena';
  ops: CourseOp[];
}

const WALL_HEIGHT = 2.5;
const LANDING_ROWS = 3;
const ORB_HEIGHT = 1.4;

const key = (ix: number, iz: number): number => (ix + 20000) * 40000 + (iz + 20000);

export class Course {
  readonly cells = new Map<number, Cell>();
  readonly list: Cell[] = [];
  readonly checkpoints: Point[] = [];
  readonly hops = new Map<number, Hop>();
  readonly orbs: Point[] = [];
  readonly hazards: Hazard[] = [];
  readonly loops: Loop[] = [];
  readonly itemBoxes: Point[] = [];
  overlaps = 0; // cells of a straight piece that landed on track already there, which the course shouldn't do

  private cx = 0;
  private cz = 0;
  private h = 0;
  private dir: Dir | null = null;
  private width = 0;
  private lastPad = -1;
  private trial = false; // only looking to see where a piece would go
  private trialMargin = 0;
  private trialOlderThan = 0;
  private trialClash = false;

  constructor(readonly data: CourseData) {
    for (const step of data.ops) this.apply(step);
  }

  // For laying a course out a piece at a time.
  add(ops: CourseOp[]): void {
    for (const step of ops) this.apply(step);
  }

  // Whether these pieces would keep this many blocks clear of track older than the given section.
  fits(ops: CourseOp[], margin: number, olderThan: number): boolean {
    const state = { cx: this.cx, cz: this.cz, h: this.h, dir: this.dir, width: this.width, lastPad: this.lastPad, overlaps: this.overlaps };
    const lengths = [this.checkpoints.length, this.orbs.length, this.hazards.length, this.loops.length, this.itemBoxes.length];
    const hops = new Map(this.hops);
    this.trial = true;
    this.trialMargin = margin;
    this.trialOlderThan = olderThan;
    this.trialClash = false;
    for (const step of ops) this.apply(step);
    this.trial = false;
    const fits = !this.trialClash;
    Object.assign(this, state);
    this.checkpoints.length = lengths[0];
    this.orbs.length = lengths[1];
    this.hazards.length = lengths[2];
    this.loops.length = lengths[3];
    this.itemBoxes.length = lengths[4];
    this.hops.clear();
    for (const [k, v] of hops) this.hops.set(k, v);
    return fits;
  }

  // Where the next piece would start, and which way it would be heading.
  get end(): { x: number; z: number; h: number; dir: Dir | null } {
    return { x: this.cx, z: this.cz, h: this.h, dir: this.dir };
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
      case 'gap': {
        const d = DIR_VEC[this.dir ?? 'N'];
        this.cx += d.x * step.len;
        this.cz += d.z * step.len;
        return;
      }
      case 'bend':
        return this.bend(step);
      case 'wave':
        return this.wave(step);
      case 'field':
        return this.field(step);
      case 'fork':
        return this.fork(step);
      case 'loop':
        return this.loop(step.radius, step.shift, step.orb ?? false);
      case 'maze':
        return step.regions ? this.regionMaze(step.rows, step.floor) : this.maze(step.rows);
      case 'rally':
        return this.rally(step.offsets, step.space, step.size ?? 5);
      case 'piston': {
        const p = this.placed(step.along, step.across);
        this.hazards.push({ type: 'piston', ...p, size: step.size * CELL, period: step.period, phase: step.phase ?? 0 });
        return;
      }
      case 'laser': {
        const p = this.placed(step.along, step.across ?? 0);
        const axis = this.dir === 'N' || this.dir === 'S' ? 'x' : 'z';
        this.hazards.push({ type: 'laser', ...p, span: step.width * CELL, axis, period: step.period, phase: step.phase ?? 0 });
        return;
      }
      case 'magnet': {
        const p = this.placed(step.along, step.across);
        this.hazards.push({ type: 'magnet', ...p, radius: step.radius * CELL, strength: step.strength });
        return;
      }
      case 'plate':
        return this.plate(step);
      case 'spawn':
        this.addCheckpoint((step.x + 0.5) * CELL, this.cellHeight(step.x, step.z), (step.z + 0.5) * CELL);
        return;
      case 'box':
        this.itemBoxes.push({ x: (step.x + 0.5) * CELL, y: this.cellHeight(step.x, step.z) + ORB_HEIGHT, z: (step.z + 0.5) * CELL });
        return;
      case 'items':
        for (const across of step.across) {
          const p = this.placed(step.along, across);
          this.itemBoxes.push({ ...p, y: p.y + ORB_HEIGHT });
        }
        return;
    }
  }

  private cellHeight(ix: number, iz: number): number {
    const c = this.cells.get(key(ix, iz));
    return c ? this.heightOn(c, (ix + 0.5) * CELL, (iz + 0.5) * CELL) : 0;
  }

  private plate(s: Extract<CourseOp, { op: 'plate' }>): void {
    const sx = (s.rx ?? 0) / (s.w * CELL);
    const sz = (s.rz ?? 0) / (s.d * CELL);
    const kind = s.kind ?? (sx !== 0 || sz !== 0 ? 'ramp' : 'plain');
    for (let a = 0; a < s.w; a++) {
      for (let b = 0; b < s.d; b++) {
        this.put({ ix: s.x + a, iz: s.z + b, h: s.h + (sx * a + sz * b) * CELL, sx, sz, kind, section: 0, dir: s.dir });
      }
    }
  }

  private placed(along: number, across: number): Point {
    const d = DIR_VEC[this.dir ?? 'N'];
    // Right of travel: N gives +x, W gives -z, E gives +z, S gives -x.
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
    const section = s.sameSection
      ? this.checkpoints.length - 1
      : this.addCheckpoint((this.cx + 0.5) * CELL, this.h, (this.cz + 0.5) * CELL);
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
    const towardsMin = dir === 'N' || dir === 'W';
    const alongZ = dir === 'N' || dir === 'S';

    for (let k = 0; k < len; k++) {
      const near = this.h + (rise * k) / len;
      const far = this.h + (rise * (k + 1)) / len;
      const gradient = (towardsMin ? near - far : far - near) / CELL;
      for (let w = left; w < left + width; w++) {
        if (this.cells.has(key(this.cx + d.x * k + (alongZ ? w : 0), this.cz + d.z * k + (alongZ ? 0 : w)))) this.overlaps++;
        this.put({
          ix: this.cx + d.x * k + (alongZ ? w : 0),
          iz: this.cz + d.z * k + (alongZ ? 0 : w),
          h: towardsMin ? far : near,
          sx: alongZ ? 0 : gradient,
          sz: alongZ ? gradient : 0,
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
        x: (this.cx + 0.5 + d.x * k + (alongZ ? lane : 0)) * CELL,
        y: this.h + (rise * k) / len + ORB_HEIGHT,
        z: (this.cz + 0.5 + d.z * k + (alongZ ? 0 : lane)) * CELL,
      });
    }

    this.cx += d.x * len;
    this.cz += d.z * len;
    this.h += rise;
  }

  private newSection(x: number, z: number): number {
    const section = this.addCheckpoint(x * CELL, this.h, z * CELL);
    if (this.lastPad >= 0) {
      this.linkHop(this.checkpoints[section]);
      this.lastPad = -1;
    }
    return section;
  }

  private laid(cell: Cell): void {
    if (cell.kind !== 'wall' && this.cells.has(key(cell.ix, cell.iz))) this.overlaps++;
    this.put(cell);
  }

  private bend(s: Extract<CourseOp, { op: 'bend' }>): void {
    const from = this.dir ?? 'N';
    const d = DIR_VEC[from];
    const n = DIR_VEC[s.to];
    if (d.x * n.x + d.z * n.z !== 0) return;
    const half = s.width / 2;
    const odd = s.width % 2 ? 0.5 : 0;
    // The middle of the road where the last piece ended, in blocks, and the centre of the circle.
    const sx = from === 'E' ? this.cx : from === 'W' ? this.cx + 1 : this.cx + odd;
    const sz = from === 'S' ? this.cz : from === 'N' ? this.cz + 1 : this.cz + odd;
    const cx = sx + n.x * s.radius;
    const cz = sz + n.z * s.radius;
    const section = this.newSection(sx, sz);
    const rise = s.rise ?? 0;
    const kind = s.kind ?? (rise !== 0 ? 'ramp' : 'plain');
    const reach = Math.ceil(s.radius + half + 2);
    const gradient = rise / (s.radius * CELL * (Math.PI / 2));
    for (let ix = Math.floor(cx) - reach; ix <= Math.ceil(cx) + reach; ix++) {
      for (let iz = Math.floor(cz) - reach; iz <= Math.ceil(cz) + reach; iz++) {
        const vx = ix + 0.5 - cx;
        const vz = iz + 0.5 - cz;
        const out = vx * d.x + vz * d.z;
        const back = -(vx * n.x + vz * n.z);
        if (out < 0 || back < 0) continue;
        const r = Math.hypot(vx, vz);
        const t = Math.atan2(out, back);
        const height = this.h + (rise * t) / (Math.PI / 2);
        if (Math.abs(r - s.radius) <= half) {
          const gx = gradient * (n.x * Math.sin(t) + d.x * Math.cos(t));
          const gz = gradient * (n.z * Math.sin(t) + d.z * Math.cos(t));
          this.laid({ ix, iz, h: height - ((gx + gz) * CELL) / 2, sx: gx, sz: gz, kind, section, dir: t < Math.PI / 4 ? from : s.to });
        } else if (s.rail && r > s.radius && r - s.radius <= half + 1.5) {
          this.put({ ix, iz, h: height + WALL_HEIGHT, sx: 0, sz: 0, kind: 'wall', section });
        }
      }
    }
    for (let i = 0; i < (s.orbs ?? 0); i++) {
      const t = (((i + 0.5) / (s.orbs ?? 1)) * Math.PI) / 2;
      this.orbs.push({
        x: (cx + s.radius * (d.x * Math.sin(t) - n.x * Math.cos(t))) * CELL,
        y: this.h + (rise * t) / (Math.PI / 2) + ORB_HEIGHT,
        z: (cz + s.radius * (d.z * Math.sin(t) - n.z * Math.cos(t))) * CELL,
      });
    }
    const ex = cx + d.x * s.radius;
    const ez = cz + d.z * s.radius;
    this.cx = s.to === 'W' ? Math.floor(ex) - 1 : s.to === 'E' ? Math.ceil(ex) : Math.floor(ex + 0.001 - odd);
    this.cz = s.to === 'N' ? Math.floor(ez) - 1 : s.to === 'S' ? Math.ceil(ez) : Math.floor(ez + 0.001 - odd);
    this.h += rise;
    this.dir = s.to;
    this.width = s.width;
  }

  // Across is the distance to the right of travel, measured the way run lays out its blocks.
  private wave(s: Extract<CourseOp, { op: 'wave' }>): void {
    const dir = this.dir ?? 'N';
    this.dir = dir;
    this.width = s.width;
    const d = DIR_VEC[dir];
    const alongZ = dir === 'N' || dir === 'S';
    const towardsMin = dir === 'N' || dir === 'W';
    const middle = s.width % 2 ? 0.5 : 0;
    const section = this.newSection(this.cx + (alongZ ? middle : 0.5), this.cz + (alongZ ? 0.5 : middle));
    const rise = s.rise ?? 0;
    const hump = s.hump ?? 0;
    const humps = s.humps ?? 1;
    const kind = s.kind ?? (rise !== 0 || hump !== 0 ? 'ramp' : 'plain');
    const smooth = (f: number): number => f * f * (3 - 2 * f);
    const heightAt = (f: number): number => this.h + rise * f + hump * Math.sin(Math.PI * humps * f) ** 2;
    const offsetAt = (f: number): number => (s.amp ?? 0) * Math.sin(2 * Math.PI * (s.waves ?? 1) * f) + (s.shift ?? 0) * smooth(f);
    const orbEvery = s.orbs ? s.len / s.orbs : 0;
    for (let k = 0; k < s.len; k++) {
      const f = (k + 0.5) / s.len;
      const near = heightAt(k / s.len);
      const far = heightAt((k + 1) / s.len);
      const gradient = (towardsMin ? near - far : far - near) / CELL;
      const off = offsetAt(f);
      const half = Math.max(1, s.width - (s.pinch ?? 0) * Math.sin(Math.PI * f) ** 2) / 2;
      const along = alongZ ? this.cz + d.z * k : this.cx + d.x * k;
      const across = (alongZ ? this.cx : this.cz) + middle + off;
      const put = (a: number, cell: Pick<Cell, 'h' | 'sx' | 'sz' | 'kind'>): void => {
        this.laid({ ix: alongZ ? a : along, iz: alongZ ? along : a, section, dir, ...cell });
      };
      for (let a = Math.floor(across - half - 1); a <= Math.ceil(across + half + 1); a++) {
        const from = Math.abs(a + 0.5 - across);
        if (from <= half) put(a, { h: towardsMin ? far : near, sx: alongZ ? 0 : gradient, sz: alongZ ? gradient : 0, kind });
        else if (s.rails && from <= half + 1) put(a, { h: Math.max(near, far) + WALL_HEIGHT, sx: 0, sz: 0, kind: 'wall' });
      }
      if (orbEvery > 0 && (k + orbEvery / 2) % orbEvery < 1) {
        const x = alongZ ? across : along + 0.5;
        const z = alongZ ? along + 0.5 : across;
        this.orbs.push({ x: x * CELL, y: (near + far) / 2 + ORB_HEIGHT, z: z * CELL });
      }
    }
    const moved = Math.round(s.shift ?? 0);
    this.cx += alongZ ? moved : d.x * s.len;
    this.cz += alongZ ? d.z * s.len : moved;
    this.h += rise;
  }

  private field(s: Extract<CourseOp, { op: 'field' }>): void {
    const dir = this.dir ?? 'N';
    this.dir = dir;
    this.width = s.width;
    const d = DIR_VEC[dir];
    const alongZ = dir === 'N' || dir === 'S';
    const left = -Math.floor(s.width / 2);
    const section = this.newSection(this.cx + (alongZ ? (s.width % 2 ? 0.5 : 0) : 0.5), this.cz + (alongZ ? 0.5 : s.width % 2 ? 0.5 : 0));
    const kind = s.kind ?? 'plain';
    let seed = Math.abs(Math.floor(s.seed)) * 7919 + 17;
    const rand = (): number => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    const slots = Math.max(2, Math.floor(s.width / 3));
    let band: ('' | 'hole' | 'post')[] = [];
    for (let k = 0; k < s.len; k++) {
      // Three rows with things in them, then three clear, so that every way through a band joins every other.
      const inBand = k % 6 >= 1 && k % 6 <= 3 && k < s.len - 1;
      if (k % 6 === 1) {
        const free = Math.floor(rand() * slots);
        band = [];
        for (let i = 0; i < slots; i++) {
          const used = i !== free && rand() < 0.75;
          const type = s.holes && s.posts ? (rand() < 0.5 ? 'hole' : 'post') : s.holes ? 'hole' : 'post';
          band.push(used ? type : '');
        }
      }
      for (let w = 0; w < s.width; w++) {
        const type = inBand ? band[Math.min(slots - 1, Math.floor((w * slots) / s.width))] : '';
        if (type === 'hole') continue;
        const ix = this.cx + d.x * k + (alongZ ? left + w : 0);
        const iz = this.cz + d.z * k + (alongZ ? 0 : left + w);
        if (type === 'post') this.put({ ix, iz, h: this.h + WALL_HEIGHT, sx: 0, sz: 0, kind: 'wall', section });
        else this.laid({ ix, iz, h: this.h, sx: 0, sz: 0, kind, section, dir });
      }
    }
    this.cx += d.x * s.len;
    this.cz += d.z * s.len;
  }

  private fork(s: Extract<CourseOp, { op: 'fork' }>): void {
    const dir = this.dir ?? 'N';
    this.dir = dir;
    this.width = s.width;
    const d = DIR_VEC[dir];
    const alongZ = dir === 'N' || dir === 'S';
    const left = -Math.floor(s.width / 2);
    const section = this.newSection(this.cx + (alongZ ? (s.width % 2 ? 0.5 : 0) : 0.5), this.cz + (alongZ ? 0.5 : s.width % 2 ? 0.5 : 0));
    const taper = Math.min(s.len / 3, s.island);
    const middle = s.side ?? 0;
    const [one, other] = s.kinds ?? ['plain', 'plain'];
    for (let k = 0; k < s.len; k++) {
      const size = (s.island * Math.min(1, Math.min(k, s.len - 1 - k) / taper)) / 2;
      for (let w = 0; w < s.width; w++) {
        const across = left + w + 0.5 - middle;
        if (Math.abs(across) < size) continue;
        this.laid({
          ix: this.cx + d.x * k + (alongZ ? left + w : 0),
          iz: this.cz + d.z * k + (alongZ ? 0 : left + w),
          h: this.h,
          sx: 0,
          sz: 0,
          kind: size > 0 ? (across < 0 ? one : other) : 'plain',
          section,
          dir,
        });
      }
    }
    this.cx += d.x * s.len;
    this.cz += d.z * s.len;
  }

  // Starts where the lane in stops, and leaves the next piece starting beside it.
  private loop(radiusCells: number, shiftCells: number, orb: boolean): void {
    const dir = this.dir ?? 'N';
    const d = DIR_VEC[dir];
    const end = this.placed(-0.5, 0);
    // An even-width lane is centred on a block edge, not on the middle of a block.
    const centre = (this.width / 2 - Math.floor(this.width / 2)) * CELL;
    const loop: Loop = {
      x: d.x !== 0 ? end.x : this.cx * CELL + centre,
      y: this.h,
      z: d.z !== 0 ? end.z : this.cz * CELL + centre,
      radius: radiusCells * CELL,
      width: this.width * CELL,
      dir,
      shift: shiftCells * CELL,
      section: this.checkpoints.length - 1,
    };
    this.loops.push(loop);
    if (orb) {
      const top = { x: 0, y: 0, z: 0 };
      loopPoint(loop, Math.PI, top);
      this.orbs.push(top);
    }
    this.cx -= d.z * shiftCells;
    this.cz += d.x * shiftCells;
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

  private regionMaze(rows: string[], floor: Kind = 'maze'): void {
    const cols = rows[0].length;
    const centre = Math.floor(cols / 2);
    const base = this.addCheckpoint((this.cx + 0.5) * CELL, this.h, (this.cz + 0.5) * CELL);
    // Respawn points in order, wherever each happens to be.
    const found: [number, number, number][] = [];
    rows.forEach((row, i) => {
      for (let c = 0; c < cols; c++) {
        const code = row.charCodeAt(c) - 65;
        if (code >= 0 && code < 26) found.push([code, c, rows.length - 1 - i]);
      }
    });
    found.sort((a, b) => a[0] - b[0]);
    const sections = new Map<number, number>();
    for (const [code, c, r] of found) {
      sections.set(code + 1, this.addCheckpoint((this.cx + c - centre + 0.5) * CELL, this.h, (this.cz - r + 0.5) * CELL));
    }
    for (let r = 0; r < rows.length; r++) {
      const row = rows[rows.length - 1 - r];
      for (let c = 0; c < cols; c++) {
        const ch = row[c];
        if (ch === ' ') continue;
        const wall = ch === '#';
        const code = ch >= 'A' && ch <= 'Z' ? ch.charCodeAt(0) - 64 : ch >= '1' && ch <= '9' ? Number(ch) : 0;
        this.put({
          ix: this.cx + c - centre,
          iz: this.cz - r,
          h: wall ? this.h + WALL_HEIGHT : this.h,
          sx: 0,
          sz: 0,
          kind: wall ? 'wall' : floor,
          section: sections.get(code) ?? base,
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

  // A flat square that starts right after the lane in and ends right at the side of the lane out,
  // which is its own width across and centred where the next piece will be.
  private corner(next: Dir, nextWidth: number): void {
    const prev = DIR_VEC[this.dir!];
    const n = DIR_VEC[next];
    const alongX = prev.x !== 0;
    const forward = prev.x + prev.z > 0;
    const sideways = n.x + n.z > 0;
    const p = alongX ? this.cx : this.cz;
    const q = alongX ? this.cz : this.cx;
    const pCentre = forward ? p + Math.floor(nextWidth / 2) : p - Math.ceil(nextWidth / 2) + 1;
    const pMin = pCentre - Math.floor(nextWidth / 2);
    const pMax = pCentre + Math.ceil(nextWidth / 2) - 1;
    const qMin = q - Math.floor(this.width / 2);
    const qMax = q + Math.ceil(this.width / 2) - 1;
    const section = this.checkpoints.length - 1;

    const place = (a: number, b: number, kind: Kind, h: number): void => {
      const ix = alongX ? a : b;
      const iz = alongX ? b : a;
      if (!this.cells.has(key(ix, iz))) this.put({ ix, iz, h, sx: 0, sz: 0, kind, section });
    };
    for (let a = pMin; a <= pMax; a++) for (let b = qMin; b <= qMax; b++) place(a, b, 'plain', this.h);
    // Raised lip on the outside of the turn, so corners can be taken fast.
    const lip = this.h + WALL_HEIGHT;
    const far = forward ? pMax + 1 : pMin - 1;
    const behind = sideways ? qMin - 1 : qMax + 1;
    for (let b = qMin - 1; b <= qMax + 1; b++) place(far, b, 'wall', lip);
    for (let a = pMin; a <= pMax; a++) place(a, behind, 'wall', lip);

    const onward = sideways ? qMax + 1 : qMin - 1;
    this.cx = alongX ? pCentre : onward;
    this.cz = alongX ? onward : pCentre;
  }

  private put(cell: Cell): void {
    const k = key(cell.ix, cell.iz);
    if (this.trial) {
      if (cell.kind !== 'wall' && this.cells.has(k)) this.trialClash = true;
      const m = this.trialMargin;
      for (let a = -m; a <= m && !this.trialClash; a += m || 1) {
        for (let b = -m; b <= m; b += m || 1) {
          const near = this.cells.get(key(cell.ix + a, cell.iz + b));
          if (near && near.section < this.trialOlderThan) this.trialClash = true;
        }
      }
      return;
    }
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
    { op: 'run', dir: 'N', len: 6, width: 10, kind: 'launch', rise: 3.6, sameSection: true },
    { op: 'gap', len: 14 },
    { op: 'drop', amount: 6 },
    { op: 'run', dir: 'N', len: 60, width: 10, kind: 'fast', rise: -12, orbs: 5, orbLane: 2 },
    { op: 'run', dir: 'N', len: 16, width: 8, kind: 'maze' },
    { op: 'wave', len: 34, width: 8, amp: 6, waves: 1 },
    { op: 'run', dir: 'N', len: 12, width: 8 },
    { op: 'magnet', along: -6, across: 2, radius: 7, strength: 46 },
    { op: 'wave', len: 20, width: 8, shift: -8 },
    { op: 'run', dir: 'N', len: 12, width: 8 },
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
    { op: 'run', dir: 'N', len: 12, width: 6, kind: 'fast' },
    { op: 'run', dir: 'N', len: 4, width: 6, kind: 'boost' },
    { op: 'loop', radius: 6, shift: 6, orb: true },
    { op: 'run', dir: 'N', len: 4, width: 10, kind: 'boost' },
    { op: 'run', dir: 'N', len: 56, width: 10, kind: 'fast', rise: -18, orbs: 6, orbLane: -3 },
    { op: 'run', dir: 'N', len: 16, width: 6, kind: 'crumble' },
    { op: 'run', dir: 'N', len: 16, width: 8, kind: 'maze' },
    { op: 'wave', len: 24, width: 8, shift: 8, orbs: 2 },
    { op: 'run', dir: 'N', len: 24, width: 8, orbs: 3 },
    { op: 'piston', along: -18, across: -2, size: 4, period: 3 },
    { op: 'piston', along: -8, across: 2, size: 4, period: 3, phase: 0.5 },
    { op: 'run', dir: 'N', len: 4, width: 8, kind: 'boost' },
    { op: 'run', dir: 'N', len: 6, width: 8, kind: 'launch', rise: 3.6, sameSection: true },
    { op: 'gap', len: 14 },
    { op: 'drop', amount: 6 },
    { op: 'run', dir: 'N', len: 56, width: 8, kind: 'fast' },
    { op: 'run', dir: 'N', len: 3, width: 8, kind: 'finish' },
    { op: 'run', dir: 'N', len: 18, width: 8 },
  ],
};
