import { Course, type CourseData, type CourseOp, type Dir, type Kind } from './course';
import { bigMaze, boost, finish, lasers, loop, magnets, pistons, rally, seeded, start } from './pieces';

export type LevelStyle = 'Speed' | 'Maze' | 'Skill' | 'Mix';

export interface Level extends CourseData {
  style: LevelStyle;
  plan: string[]; // the pieces laid, in order
  starts: number[]; // the section each one starts on
}

// Where the road has got to, for a piece being made to carry on from there.
interface Spot {
  r: () => number;
  dir: Dir;
  w: number;
  x: number;
  n: number;
}
type Make = (s: Spot) => CourseOp[];

const between = (s: Spot, low: number, high: number): number => Math.round(low + s.r() * (high - low));
const towardsMiddle = (s: Spot): 1 | -1 => (s.x > 60 ? -1 : s.x < -60 ? 1 : s.r() < 0.5 ? 1 : -1);
const aside = (s: Spot): Dir => (s.dir === 'N' ? (towardsMiddle(s) > 0 ? 'E' : 'W') : 'N');
const opposite = (dir: Dir): Dir => ({ N: 'S', S: 'N', E: 'W', W: 'E' } as const)[dir];

// A road never swings tighter than a curve of this radius, however it's asked to wind.
const swing = (wavelength: number, amp: number, radius: number): number => Math.min(amp, Math.floor((wavelength / (2 * Math.PI)) ** 2 / radius));

// Quick stretches.
const downhill: Make = (s) => {
  const len = between(s, 26, 56);
  return [{ op: 'run', dir: s.dir, len, width: s.w, kind: 'fast', rise: -len * (0.1 + s.r() * 0.12), orbs: between(s, 1, 3), orbLane: between(s, -2, 2) }];
};
const snake: Make = (s) => {
  const waves = between(s, 1, 2);
  const wavelength = between(s, 50, 90);
  return [{ op: 'wave', len: waves * wavelength, width: s.w, amp: swing(wavelength, between(s, 4, 9), 14), waves, kind: 'fast', rise: -between(s, 2, 8), orbs: 2 }];
};
const slant: Make = (s) => {
  const len = between(s, 30, 54);
  return [{ op: 'wave', len, width: s.w, shift: towardsMiddle(s) * Math.min(between(s, 8, 22), Math.floor(len * 0.4)), kind: s.r() < 0.5 ? 'fast' : undefined }];
};
const roller: Make = (s) => {
  const humps = between(s, 2, 4);
  return [{ op: 'wave', len: humps * between(s, 14, 20), width: s.w, hump: 1.2 + s.r() * 0.8, humps, kind: 'fast', orbs: humps }];
};
const funnel: Make = (s) => {
  const len = between(s, 30, 54);
  return [{ op: 'wave', len, width: s.w, pinch: s.w - between(s, 3, 5), amp: swing(len, between(s, 0, 3), 14), kind: 'fast' }];
};
const booster: Make = (s) => [...boost(s.w, s.dir), { op: 'run', dir: s.dir, len: between(s, 8, 18), width: s.w, kind: 'fast' }];
const kicker: Make = (s) => [
  { op: 'run', dir: s.dir, len: 4, width: s.w, kind: 'boost' },
  { op: 'run', dir: s.dir, len: 6, width: s.w, kind: 'launch', rise: 3.6, sameSection: true },
  { op: 'gap', len: between(s, 9, 18) },
  { op: 'drop', amount: between(s, 5, 9) },
  { op: 'run', dir: s.dir, len: between(s, 40, 56), width: s.w, kind: 'fast', rise: -between(s, 3, 8), orbs: 2 },
];
const cliff: Make = (s) => [
  { op: 'run', dir: s.dir, len: between(s, 6, 12), width: s.w },
  { op: 'drop', amount: between(s, 5, 12) },
  { op: 'run', dir: s.dir, len: between(s, 26, 40), width: s.w + 2, kind: 'fast', rise: -between(s, 1, 4) },
];
const parting: Make = (s) => {
  const narrowSide = s.r() < 0.5;
  return [{ op: 'fork', len: between(s, 28, 44), width: s.w + 6, island: 6, side: (narrowSide ? 1 : -1) * 2, kinds: narrowSide ? ['plain', 'fast'] : ['fast', 'plain'] }];
};
const bobsled: Make = (s) => {
  const wavelength = between(s, 40, 70);
  return [{ op: 'wave', len: wavelength * 2, width: s.w, amp: swing(wavelength, between(s, 3, 7), 10), waves: 2, kind: 'fast', rails: true, rise: -between(s, 4, 10) }];
};
const sweep: Make = (s) => {
  const turn = aside(s);
  const kind: Kind = s.r() < 0.6 ? 'fast' : 'plain';
  const rail = s.r() < 0.7;
  return [
    { op: 'bend', to: turn, radius: between(s, 12, 26), width: s.w, kind, rail },
    { op: 'run', dir: turn, len: between(s, 4, 22), width: s.w, kind },
    { op: 'bend', to: s.dir, radius: between(s, 12, 26), width: s.w, kind, rail },
  ];
};

const traverse: Make = (s) => {
  const turn = aside(s);
  const len = between(s, 40, 80);
  const kind: Kind = s.r() < 0.6 ? 'fast' : 'plain';
  return [
    { op: 'bend', to: turn, radius: between(s, 13, 22), width: s.w, kind, rail: true },
    { op: 'wave', len, width: s.w, amp: swing(len, between(s, 2, 6), 14), kind, orbs: 2 },
    { op: 'bend', to: s.dir, radius: between(s, 13, 22), width: s.w, kind, rail: true },
  ];
};
const meander: Make = (s) => {
  const turn = aside(s);
  const r = Math.max(s.w + 2, between(s, 11, 16));
  const back = between(s, 6, 24);
  return [
    { op: 'bend', to: turn, radius: r, width: s.w, rail: true },
    { op: 'bend', to: 'S', radius: r, width: s.w, rail: true },
    { op: 'run', dir: 'S', len: back, width: s.w, kind: 'fast', orbs: 2 },
    { op: 'bend', to: turn, radius: r, width: s.w, rail: true },
    { op: 'bend', to: 'N', radius: r, width: s.w, rail: true },
    { op: 'run', dir: 'N', len: back + between(s, 8, 16), width: s.w, kind: 'fast' },
  ];
};

// Stretches placed by hand, in shapes the composer's pieces don't make.
const diagonalSteps: Make = (s) => {
  const turn = aside(s);
  const ops: CourseOp[] = [];
  for (let i = 0; i < 3; i++) {
    ops.push({ op: 'bend', to: turn, radius: 11, width: s.w, rail: true }, { op: 'run', dir: turn, len: 5, width: s.w }, { op: 'drop', amount: 2.5 }, { op: 'run', dir: turn, len: 3, width: s.w });
    ops.push({ op: 'bend', to: s.dir, radius: 11, width: s.w, rail: true }, { op: 'run', dir: s.dir, len: 5, width: s.w }, { op: 'drop', amount: 2.5 }, { op: 'run', dir: s.dir, len: 3, width: s.w });
  }
  return ops;
};
const plunge: Make = (s) => [{ op: 'run', dir: s.dir, len: 36, width: s.w, kind: 'fast', rise: -12, orbs: 3 }];
const wideSplit: Make = (s) => [{ op: 'fork', len: 52, width: s.w + 10, island: 10, kinds: ['fast', 'plain'] }];
const fallingHumps: Make = (s) => [{ op: 'wave', len: 72, width: s.w, hump: 1.8, humps: 4, rise: -8, kind: 'fast', orbs: 4 }];

// Getting your breath back.
const rest: Make = (s) => [{ op: 'run', dir: s.dir, len: between(s, 8, 16), width: s.w + 4, orbs: 3, orbLane: between(s, -3, 3) }];
const ascent: Make = (s) => {
  const len = between(s, 30, 50);
  return [{ op: 'wave', len, width: s.w, amp: swing(len, between(s, 0, 5), 12), waves: 1, rise: len * (0.1 + s.r() * 0.06) }];
};
const detour: Make = (s) => {
  const turn = aside(s);
  const r = Math.ceil(s.w / 2) + 5;
  return [
    { op: 'bend', to: turn, radius: r, width: s.w },
    { op: 'wave', len: between(s, 10, 24), width: s.w, hump: 1, humps: 1 },
    { op: 'bend', to: s.dir, radius: r + 2, width: s.w },
    { op: 'run', dir: s.dir, len: between(s, 8, 20), width: s.w },
    { op: 'bend', to: opposite(turn), radius: r, width: s.w },
    { op: 'run', dir: opposite(turn), len: between(s, 10, 24), width: s.w },
    { op: 'bend', to: s.dir, radius: r, width: s.w },
  ];
};

// Ones to take with care.
const beam: Make = (s) => [
  { op: 'run', dir: s.dir, len: 6, width: s.w },
  { op: 'run', dir: s.dir, len: between(s, 18, 36), width: between(s, 3, 4), orbs: 2 },
  { op: 'run', dir: s.dir, len: 6, width: s.w },
];
const thinSnake: Make = (s) => {
  const wavelength = between(s, 30, 44);
  return [{ op: 'wave', len: wavelength * 2, width: between(s, 4, 5), amp: swing(wavelength, between(s, 3, 6), 8), waves: 2 }];
};
const holes: Make = (s) => [{ op: 'field', len: 6 * between(s, 3, 7) + 1, width: s.w + between(s, 0, 4), seed: s.n * 31 + 7, holes: true }];
const posts: Make = (s) => [{ op: 'field', len: 6 * between(s, 3, 7) + 1, width: s.w + between(s, 0, 4), seed: s.n * 37 + 3, posts: true }];
const rubble: Make = (s) => [{ op: 'field', len: 6 * between(s, 3, 6) + 1, width: s.w + 4, seed: s.n * 41 + 5, holes: true, posts: true }];
const crushers: Make = (s) => pistons(between(s, 2, 4), s.w, 2.4 + s.r(), s.dir);
const beams: Make = (s) => lasers(between(s, 2, 4), s.w, 2.2 + s.r() * 0.8, s.dir);
const pulls: Make = (s) => magnets(between(s, 2, 3), s.w, s.dir);
const crumbling: Make = (s) => [{ op: 'run', dir: s.dir, len: between(s, 14, 26), width: s.w - 2, kind: 'crumble' }];
const iceRun: Make = (s) => {
  const len = between(s, 24, 44);
  return [{ op: 'wave', len, width: s.w, amp: swing(len, between(s, 0, 4), 14), kind: 'ice', rise: -between(s, 0, 4) }];
};
const iceCurve: Make = (s) => {
  const turn = aside(s);
  return [
    { op: 'bend', to: turn, radius: between(s, 10, 18), width: s.w, kind: 'ice' },
    { op: 'run', dir: turn, len: between(s, 6, 14), width: s.w },
    { op: 'bend', to: s.dir, radius: between(s, 10, 18), width: s.w, kind: 'ice' },
  ];
};
const tightEss: Make = (s) => {
  const r = Math.ceil(s.w / 2) + 3;
  return [
    { op: 'bend', to: aside(s), radius: r, width: s.w },
    { op: 'bend', to: s.dir, radius: r, width: s.w },
  ];
};
const stairs: Make = (s) => {
  const ops: CourseOp[] = [];
  const count = between(s, 3, 6);
  for (let i = 0; i < count; i++) {
    ops.push({ op: 'run', dir: s.dir, len: between(s, 5, 9), width: s.w });
    ops.push({ op: 'drop', amount: 1 + s.r() });
  }
  ops.push({ op: 'run', dir: s.dir, len: 8, width: s.w });
  return ops;
};
const hops: Make = (s) => {
  const ops: CourseOp[] = [];
  const count = between(s, 2, 4);
  for (let i = 0; i < count; i++) {
    ops.push({ op: 'run', dir: s.dir, len: 4, width: s.w, kind: 'boost' });
    ops.push({ op: 'run', dir: s.dir, len: 4, width: s.w, kind: 'launch', rise: 2, sameSection: true });
    ops.push({ op: 'gap', len: between(s, 4, 8) });
    ops.push({ op: 'drop', amount: 3 });
    ops.push({ op: 'run', dir: s.dir, len: between(s, 22, 30), width: s.w, kind: 'plain' });
  }
  return ops;
};
const pads: Make = (s) => {
  const far = between(s, 6, 9);
  const shapes = [
    [0, far, -far],
    [0, -far, far, -far + 2],
    [0, far, -2, -far],
    [0, -far, 2, far, -far + 3],
  ];
  return rally(shapes[between(s, 0, shapes.length - 1)], between(s, 8, 12));
};

interface Piece {
  name: string;
  make: Make;
  most: number; // how many times a level may use it
  north?: boolean; // only knows how to go north
  size?: number; // its way along, where the ops don't tell
}
const piece = (name: string, make: Make, most = 8, north = false, size?: number): Piece => ({ name, make, most, north, size });

const FAST = [
  piece('downhill', downhill, 6),
  piece('snake', snake, 8),
  piece('slant', slant, 5),
  piece('roller', roller, 6),
  piece('funnel', funnel, 5),
  piece('booster', booster, 5),
  piece('kicker', kicker, 7),
  piece('cliff', cliff, 5),
  piece('parting', parting, 5),
  piece('bobsled', bobsled, 4),
  piece('sweep', sweep, 10),
  piece('traverse', traverse, 6),
  piece('meander', meander, 3, true),
];
const CALM = [piece('rest', rest, 6), piece('ascent', ascent, 5), piece('detour', detour, 6), piece('sweep', sweep, 10), piece('stairs', stairs, 4)];
const FIDDLY = [
  piece('beam', beam, 6),
  piece('thinSnake', thinSnake, 6),
  piece('holes', holes, 5),
  piece('posts', posts, 5),
  piece('rubble', rubble, 4),
  piece('crushers', crushers, 5),
  piece('beams', beams, 5),
  piece('pulls', pulls, 4),
  piece('crumbling', crumbling, 5),
  piece('iceRun', iceRun, 5),
  piece('iceCurve', iceCurve, 5),
  piece('tightEss', tightEss, 8),
  piece('stairs', stairs, 4),
  piece('hops', hops, 4),
  piece('pads', pads, 4, true),
];
const LOOP = piece('loop', () => loop(), 2, true, 40);

const pick = (pool: Piece[], ...names: string[]): Piece[] => pool.filter((p) => names.includes(p.name));

// A level is a list of acts: so much way drawn from a pool of pieces, or one set piece such as a maze.
type Act = { pool: Piece[]; way: number } | { set: Piece };

const mazeAct = (name: string, seed: number, cols: number, rows: number, options: Parameters<typeof bigMaze>[3] = {}): Act => ({
  set: piece(name, () => bigMaze(seed, cols, rows, options), 1, true),
});

const wayOf = (ops: CourseOp[]): number => {
  let way = 0;
  for (const op of ops) {
    if (op.op === 'run' || op.op === 'wave' || op.op === 'field' || op.op === 'fork') way += op.len;
    if (op.op === 'bend') way += op.radius * 1.5;
  }
  return way;
};

const NEARBY = 3; // a piece isn't laid again until this many others have been, or half its pool if that's less
const TRIES = 14;
const CLEAR = 3;

interface Layout {
  ops: CourseOp[];
  plan: string[];
  starts: number[];
}

// Stretches of a level to lay by hand in place of what the composer chose, by their number in its plan.
type ByHand = Record<number, Piece>;

// Lays a level piece by piece on a trial course, so each one can be seen to fit where the road has got to.
// Nothing is repeated close by, and no piece ever follows the same one twice.
function compose(seed: number, width: number, acts: Act[], byHand: ByHand = {}): Layout {
  const r = seeded(seed * 104729 + 11);
  const ops: CourseOp[] = [...start(width)];
  const course = new Course({ version: 1, id: 'layout', name: 'layout', ops: [] });
  course.add(ops);
  const plan: string[] = [];
  const starts: number[] = [];
  const laidOps: CourseOp[][] = [];
  const used = new Map<string, number>();
  const pairs = new Set<string>();
  const runs = new Set<string>();
  let olderThan = 0;
  let lastStart = 0;

  const lay = (name: string, more: CourseOp[]): void => {
    olderThan = lastStart;
    lastStart = course.checkpoints.length;
    starts.push(lastStart);
    course.add(more);
    ops.push(...more);
    laidOps.push(more);
    plan.push(name);
    used.set(name, (used.get(name) ?? 0) + 1);
    if (plan.length > 1) pairs.add(`${plan[plan.length - 2]}>${name}`);
    if (plan.length > 2) runs.add(`${plan[plan.length - 3]}>${plan[plan.length - 2]}>${name}`);
  };
  const spot = (): Spot => {
    const end = course.end;
    return { r, dir: end.dir ?? 'N', w: width, x: end.x, n: plan.length };
  };
  const toNorth = (s: Spot): CourseOp[] => {
    if (s.dir === 'N') return [];
    const radius = Math.ceil(width / 2) + 8;
    if (s.dir === 'S') {
      return [
        { op: 'bend', to: s.x > 0 ? 'W' : 'E', radius, width },
        { op: 'bend', to: 'N', radius, width },
      ];
    }
    return [{ op: 'bend', to: 'N', radius, width }];
  };
  const onwardOps = (more: CourseOp[], north?: boolean): CourseOp[] => (north ? [...toNorth(spot()), ...more] : more);

  for (const act of acts) {
    if ('set' in act) {
      const more = onwardOps(act.set.make(spot()), true);
      for (let i = 0; i < 40 && !course.fits(more, CLEAR, olderThan); i++) lay('clearing', [...toNorth(spot()), { op: 'run', dir: 'N', len: 12, width }]);
      lay(act.set.name, onwardOps(act.set.make(spot()), true));
      continue;
    }
    let way = 0;
    while (way < act.way) {
      let laid = false;
      for (let t = 0; t < TRIES && !laid; t++) {
        const last = plan.slice(-Math.min(NEARBY, Math.floor(act.pool.length / 2)));
        const prior = plan[plan.length - 1];
        const beforeThat = plan[plan.length - 2];
        const notNear = act.pool.filter((p) => !last.includes(p.name) && !runs.has(`${beforeThat}>${prior}>${p.name}`));
        const fresh = notNear.filter((p) => (used.get(p.name) ?? 0) < p.most && !pairs.has(`${prior}>${p.name}`));
        const from = fresh.length ? fresh : notNear.length ? notNear : act.pool.filter((p) => p.name !== prior);
        const choice = from[Math.floor(r() * from.length)];
        if (!choice) continue;
        const more = onwardOps(choice.make(spot()), choice.north);
        if (!course.fits(more, CLEAR, olderThan)) continue;
        lay(choice.name, more);
        way += choice.size ?? wayOf(more);
        laid = true;
      }
      if (!laid) {
        lay('clearing', onwardOps([{ op: 'run', dir: 'N', len: 10, width }], true));
        way += 10;
      }
    }
  }
  if (Object.keys(byHand).length === 0) {
    ops.push(...finish(width, course.end.dir ?? 'N'));
    return { ops, plan, starts };
  }
  // Every op is laid from where the last one ended, so the composer's other choices come out just the same.
  const final: CourseOp[] = [...start(width)];
  const road = new Course({ version: 1, id: 'layout', name: 'layout', ops: [] });
  road.add(final);
  laidOps.forEach((more, i) => {
    const hand = byHand[i + 1];
    const end = road.end;
    const piece = hand ? hand.make({ r: seeded(seed * 7907 + i), dir: end.dir ?? 'N', w: width, x: end.x, n: i }) : more;
    if (hand) plan[i] = hand.name;
    starts[i] = road.checkpoints.length;
    road.add(piece);
    final.push(...piece);
  });
  final.push(...finish(width, road.end.dir ?? 'N'));
  return { ops: final, plan, starts };
}

// Laid out the first time it's needed, as there's no sense composing all twenty to show a menu.
const level = (n: number, name: string, style: LevelStyle, width: number, acts: () => Act[], byHand?: () => ByHand): Level => {
  let laid: Layout | null = null;
  const layout = () => (laid ??= compose(n, width, acts(), byHand?.()));
  return {
    version: 1,
    id: `level-${n}`,
    name,
    style,
    kind: 'course',
    get ops() {
      return layout().ops;
    },
    get plan() {
      return layout().plan;
    },
    get starts() {
      return layout().starts;
    },
  };
};

// The way budgets aim at around five minutes for a regular player, about five times the first course
// driven by test/autopilot.ts. Mazes aim lower, as the driver already knows the way through.
export const LEVELS: Level[] = [
  level(1, 'Long Fall', 'Speed', 10, () => [{ pool: pick(FAST, 'downhill', 'cliff', 'kicker', 'sweep', 'snake', 'funnel', 'traverse', 'meander'), way: 2600 }], () => ({
    8: piece('diagonalSteps', diagonalSteps),
    9: piece('plunge', plunge),
    10: piece('wideSplit', wideSplit),
    11: piece('fallingHumps', fallingHumps),
  })),
  level(2, 'Hedge Walk', 'Maze', 8, () => [
    mazeAct('hedge', 2, 11, 11),
    { pool: pick(CALM, 'rest', 'detour', 'sweep'), way: 120 },
    mazeAct('hedge', 3, 13, 13),
    { pool: pick(CALM, 'rest', 'detour', 'sweep'), way: 120 },
    mazeAct('hedge', 5, 15, 13),
  ]),
  level(3, 'Knife Edge', 'Skill', 7, () => [{ pool: [...pick(FIDDLY, 'beam', 'thinSnake', 'tightEss', 'crumbling', 'beams', 'stairs'), ...pick(CALM, 'rest', 'sweep')], way: 1500 }]),
  level(4, 'Grand Tour', 'Mix', 10, () => [
    { pool: pick(FAST, 'downhill', 'kicker', 'sweep', 'roller', 'traverse', 'cliff'), way: 500 },
    mazeAct('tour maze', 11, 11, 11),
    { pool: pick(FIDDLY, 'crushers', 'beams', 'holes', 'tightEss', 'pads', 'posts'), way: 300 },
    { set: LOOP },
    { pool: pick(FAST, 'snake', 'parting', 'funnel', 'bobsled', 'meander', 'slant'), way: 550 },
    mazeAct('tour maze', 12, 13, 11, { lasers: 3 }),
    { pool: pick(FAST, 'sweep', 'cliff', 'booster', 'kicker', 'downhill', 'traverse'), way: 400 },
  ]),
  level(5, 'Slipstream', 'Speed', 8, () => [{ pool: [...pick(FAST, 'snake', 'slant', 'funnel', 'booster', 'sweep', 'roller', 'traverse'), ...pick(FIDDLY, 'iceRun', 'iceCurve')], way: 2300 }]),
  level(6, 'Old Cellars', 'Maze', 8, () => [
    mazeAct('cellar', 40, 11, 11, { lasers: 3 }),
    { pool: pick(FIDDLY, 'stairs', 'tightEss', 'crumbling'), way: 90 },
    mazeAct('cellar', 41, 13, 13, { pistons: 5 }),
    { pool: pick(FIDDLY, 'stairs', 'tightEss', 'crumbling'), way: 90 },
    mazeAct('cellar', 42, 15, 13, { lasers: 4, pistons: 4 }),
  ]),
  level(7, 'Piston Works', 'Skill', 8, () => [{ pool: [...pick(FIDDLY, 'crushers', 'posts', 'tightEss', 'crumbling', 'rubble', 'pulls'), ...pick(CALM, 'rest', 'detour')], way: 1300 }]),
  level(8, 'Stadium Flow', 'Mix', 10, () => [
    { pool: pick(FAST, 'booster', 'roller', 'sweep', 'kicker', 'traverse', 'slant'), way: 450 },
    { set: LOOP },
    { pool: [...pick(FIDDLY, 'beams', 'tightEss', 'posts', 'crumbling', 'thinSnake'), ...pick(CALM, 'ascent', 'rest')], way: 450 },
    { pool: pick(FAST, 'parting', 'cliff', 'snake', 'bobsled', 'meander', 'funnel'), way: 600 },
    { set: LOOP },
    { pool: [...pick(FAST, 'sweep', 'downhill', 'slant', 'kicker', 'traverse'), ...pick(FIDDLY, 'hops')], way: 550 },
  ]),
  level(9, 'Thunder Run', 'Speed', 12, () => [{ pool: pick(FAST, 'kicker', 'roller', 'parting', 'downhill', 'sweep', 'cliff', 'bobsled', 'traverse', 'meander'), way: 3200 }]),
  level(10, 'The Labyrinth', 'Maze', 8, () => [mazeAct('labyrinth', 60, 19, 17), { pool: pick(CALM, 'rest', 'detour'), way: 70 }, mazeAct('labyrinth', 61, 25, 25)]),
  level(11, 'Pad Hopper', 'Skill', 7, () => [{ pool: [...pick(FIDDLY, 'pads', 'hops', 'stairs', 'tightEss', 'beam', 'pulls'), ...pick(CALM, 'rest', 'sweep')], way: 2000 }]),
  level(12, 'Tower Drop', 'Mix', 10, () => [
    { pool: pick(CALM, 'ascent', 'detour', 'rest', 'sweep'), way: 280 },
    { pool: pick(FAST, 'cliff', 'downhill', 'kicker', 'funnel', 'snake', 'traverse'), way: 500 },
    mazeAct('tower maze', 70, 11, 13, { pistons: 3 }),
    { pool: [...pick(CALM, 'ascent', 'sweep'), ...pick(FIDDLY, 'crumbling', 'beam', 'tightEss', 'stairs')], way: 300 },
    { pool: pick(FAST, 'cliff', 'bobsled', 'parting', 'kicker', 'meander', 'roller'), way: 650 },
    { pool: pick(FIDDLY, 'holes', 'rubble', 'tightEss', 'stairs', 'posts', 'beam'), way: 250 },
  ]),
  level(13, 'Golden Mile', 'Speed', 10, () => [{ pool: pick(FAST, 'parting', 'slant', 'snake', 'sweep', 'booster', 'roller', 'downhill', 'kicker', 'traverse', 'meander'), way: 3100 }]),
  level(14, 'Copper Mines', 'Maze', 8, () => [
    mazeAct('open maze', 80, 9, 9, { open: true, wall: 2 }),
    { pool: pick(FIDDLY, 'crumbling', 'tightEss', 'crushers'), way: 80 },
    mazeAct('mine', 81, 13, 13, { pistons: 5 }),
    { pool: pick(FIDDLY, 'crumbling', 'tightEss', 'stairs'), way: 80 },
    mazeAct('open maze', 82, 11, 11, { open: true, wall: 2 }),
    { pool: pick(FIDDLY, 'beams', 'tightEss'), way: 60 },
    mazeAct('mine', 83, 15, 13, { lasers: 4 }),
  ]),
  level(15, 'Glass Road', 'Skill', 8, () => [{ pool: [...pick(FIDDLY, 'iceRun', 'iceCurve', 'holes', 'thinSnake', 'beams', 'tightEss'), ...pick(CALM, 'rest', 'sweep')], way: 1200 }]),
  level(16, 'Night Circuit', 'Mix', 8, () => [
    { pool: pick(FAST, 'snake', 'funnel', 'sweep', 'parting', 'traverse', 'slant'), way: 450 },
    { pool: pick(FIDDLY, 'beams', 'pads', 'tightEss', 'rubble', 'posts', 'crumbling'), way: 350 },
    { set: LOOP },
    mazeAct('night maze', 100, 13, 11, { lasers: 4 }),
    { pool: [...pick(FAST, 'booster', 'kicker', 'sweep', 'roller'), ...pick(FIDDLY, 'iceCurve', 'iceRun')], way: 400 },
    { pool: pick(FAST, 'bobsled', 'downhill', 'meander', 'cliff', 'snake', 'parting'), way: 400 },
  ]),
  level(17, 'Afterburner', 'Speed', 8, () => [
    { pool: pick(FAST, 'booster', 'bobsled', 'kicker', 'sweep', 'funnel', 'slant', 'downhill', 'traverse'), way: 1400 },
    { set: LOOP },
    { pool: pick(FAST, 'snake', 'roller', 'booster', 'cliff', 'sweep', 'parting', 'meander'), way: 1300 },
  ]),
  level(18, 'Mirror Hall', 'Maze', 8, () => [
    mazeAct('ice maze', 120, 11, 11, { floor: 'ice' }),
    { pool: pick(FIDDLY, 'iceCurve', 'tightEss'), way: 70 },
    mazeAct('ice maze', 121, 13, 13, { floor: 'ice', lasers: 3 }),
    { pool: pick(FIDDLY, 'iceRun', 'tightEss'), way: 70 },
    mazeAct('ice maze', 122, 15, 13, { floor: 'ice' }),
  ]),
  level(19, 'Laser Yard', 'Skill', 8, () => [{ pool: [...pick(FIDDLY, 'beams', 'pulls', 'crushers', 'posts', 'tightEss', 'thinSnake'), ...pick(CALM, 'rest', 'detour')], way: 1500 }]),
  level(20, 'The Long Way', 'Mix', 10, () => [
    { pool: pick(CALM, 'detour', 'sweep', 'ascent', 'rest'), way: 300 },
    { pool: pick(FAST, 'kicker', 'snake', 'roller', 'traverse', 'funnel'), way: 350 },
    mazeAct('long maze', 140, 13, 13),
    { pool: pick(FIDDLY, 'iceCurve', 'crushers', 'beams', 'pads', 'holes', 'tightEss'), way: 300 },
    { set: LOOP },
    { pool: pick(FAST, 'parting', 'bobsled', 'cliff', 'meander', 'slant', 'sweep'), way: 500 },
    { pool: pick(FIDDLY, 'crumbling', 'rubble', 'tightEss', 'hops', 'beam', 'stairs'), way: 250 },
    { pool: pick(FAST, 'traverse', 'slant', 'downhill', 'booster', 'kicker', 'roller'), way: 300 },
  ]),
];
