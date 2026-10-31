import { CELL, type Cell, type Course, type CourseData } from '../src/course';
import { Game } from '../src/game';
import type { Sensors } from '../src/sensors';

export interface Drive {
  finished: boolean;
  time: number;
  falls: number;
  fallSections: number[];
  section: number;
  steps: number;
}

const stillSensors = { steer: 0, pitch: 0, calibrate() {}, trackNeutral() {} } as unknown as Sensors;

const key = (ix: number, iz: number): string => `${ix},${iz}`;

const floors = new WeakMap<Course, Map<string, Cell>>();

// Shortest way over the floor, in blocks, or null when a gap or wall is in the way.
export function wayTo(course: Course, from: Cell, target: Cell, midOnly = true): Cell[] | null {
  let byKey = floors.get(course);
  if (!byKey) {
    byKey = new Map<string, Cell>();
    for (const c of course.list) byKey.set(key(c.ix, c.iz), c);
    floors.set(course, byKey);
  }
  const cells = byKey;
  const before = new Map<Cell, Cell | null>([[from, null]]);
  const queue = [from];
  for (let i = 0; i < queue.length; i++) {
    const c = queue[i];
    if (c === target) {
      const path: Cell[] = [];
      for (let at: Cell | null = c; at; at = before.get(at) ?? null) path.push(at);
      return path.reverse();
    }
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const n = byKey.get(key(c.ix + dx, c.iz + dz));
      if (!n || n.kind === 'wall' || before.has(n)) continue;
      // Keeps a block's width from walls and edges, as a player would, where the way allows it.
      const open = (ox: number, oz: number): boolean => {
        const o = cells.get(key(n.ix + ox, n.iz + oz));
        return !!o && o.kind !== 'wall';
      };
      if (midOnly && n !== target && !(open(1, 0) && open(-1, 0) && open(0, 1) && open(0, -1))) continue;
      if (Math.abs(course.heightOn(n, (n.ix + 0.5) * CELL, (n.iz + 0.5) * CELL) - course.heightOn(c, (c.ix + 0.5) * CELL, (c.iz + 0.5) * CELL)) > 0.68) continue;
      before.set(n, c);
      queue.push(n);
    }
  }
  return midOnly ? wayTo(course, from, target, false) : null;
}

// The block a section starts on: its point often lies on the line between it and the last one.
function entrance(course: Course, point: { x: number; z: number }, section: number): Cell | undefined {
  const at = course.cellAt(point.x, point.z);
  if (at?.section === section) return at;
  for (let ring = 1; ring <= 3; ring++) {
    for (let ox = -ring; ox <= ring; ox++) {
      for (let oz = -ring; oz <= ring; oz++) {
        const c = course.cellAt(point.x + ox * CELL, point.z + oz * CELL);
        if (c?.section === section && c.kind !== 'wall') return c;
      }
    }
  }
  return at;
}

// Plays a course from start to finish the way a good, patient player would, with keys rather than tilt.
export function drive(data: CourseData, limitSeconds = 1500): Drive {
  const game = new Game(stillSensors);
  game.loadCourse(data);
  const course = game.course;
  const finishCell = course.list.find((c) => c.kind === 'finish')!;
  const result: Drive = { finished: false, time: 0, falls: 0, fallSections: [], section: 0, steps: 0 };
  game.onFinish = (t) => {
    result.finished = true;
    result.time = t;
  };
  game.onCue = (cue) => {
    if (cue !== 'fall') return;
    result.falls++;
    result.fallSections.push(Number((game as unknown as { section: number }).section));
  };
  game.begin();
  let path: Cell[] | null = null;
  let further: Cell[] = [];
  let pathFrom: Cell | undefined;
  let pathTo: Cell | undefined;
  const dt = 1 / 60;
  while (!result.finished && game.time < limitSeconds) {
    let x = 0;
    let y = 0;
    const cue = game.jumpCue;
    if (cue) {
      if (cue.landing) {
        x = Math.sin(cue.angle);
        y = Math.cos(cue.angle);
      } else if (cue.timeLeft < 0.8) {
        x = Math.sin(cue.angle);
        y = Math.cos(cue.angle);
      }
    } else if (game.state === 'run' && course.cellAt(game.ball.x, game.ball.z)?.kind !== 'pad') {
      // A jump off a pad needs the tilt to change, so it arrives on one with the phone level.
      const b = game.ball;
      const section = (game as unknown as { section: number }).section;
      const point = course.checkpoints[section + 1];
      const here = course.cellAt(b.x, b.z);
      const toCell = point ? entrance(course, point, section + 1) : finishCell;
      let aimX = point ? point.x : (finishCell.ix + 0.5) * CELL;
      let aimZ = point ? point.z : (finishCell.iz + 0.5) * CELL;
      let slowFor = 90;
      if (here && toCell) {
        if (here !== pathFrom || toCell !== pathTo) {
          path = wayTo(course, here, toCell);
          // Looks on past the next point, so as to have slowed down for what comes after it.
          const nextPoint = course.checkpoints[section + 2];
          const after = nextPoint && entrance(course, nextPoint, section + 2);
          further = path ?? [];
          if (path && after && path.length < 60) further = [...path, ...(wayTo(course, toCell, after)?.slice(1) ?? [])];
          pathFrom = here;
          pathTo = toCell;
        }
        if (path && path.length > 1) {
          const ahead = path[Math.min(path.length - 1, here.kind === 'maze' ? 2 : 4)];
          aimX = (ahead.ix + 0.5) * CELL;
          aimZ = (ahead.iz + 0.5) * CELL;
          // Slowing ahead of a turn in the route.
          const reach = Math.min(further.length - 1, 8 + Math.floor(b.speed * 0.4));
          const far = further[reach];
          const chord = Math.hypot(far.ix - here.ix, far.iz - here.iz) || 1;
          let stray = 0;
          for (let i = 1; i < reach; i++) {
            const c = further[i];
            stray = Math.max(stray, Math.abs((c.ix - here.ix) * (far.iz - here.iz) - (c.iz - here.iz) * (far.ix - here.ix)) / chord);
          }
          // As fast as the grip will take a curve of this size.
          if (stray > 2) slowFor = Math.max(12, Math.sqrt(20 * CELL * ((chord * chord) / (8 * stray))));
          if (here.kind === 'maze') slowFor = Math.min(slowFor, 22);
          // Taking care wherever the floor is narrow.
          for (let ox = -2; ox <= 2; ox++) {
            for (let oz = -2; oz <= 2; oz++) {
              if (!course.cellAt((here.ix + ox + 0.5) * CELL, (here.iz + oz + 0.5) * CELL)) slowFor = Math.min(slowFor, 24);
            }
          }
        }
        if (here.kind === 'ice') slowFor = Math.min(slowFor, 30) * 0.7;
      }
      const dx = aimX - b.x;
      const dz = aimZ - b.z;
      const d = Math.hypot(dx, dz) || 1;
      // Waits for a laser ahead to go off, as anyone would.
      for (const h of course.hazards) {
        if (h.type !== 'laser') continue;
        const gap = h.axis === 'x' ? h.z - b.z : h.x - b.x;
        const side = h.axis === 'x' ? b.x - h.x : b.z - h.z;
        const towards = h.axis === 'x' ? dz : dx;
        if (Math.abs(side) > h.span / 2 + 1 || Math.abs(gap) < 1.6 || Math.abs(gap) > 14 || gap * towards < 0) continue;
        if (Math.abs(gap) < 7 && game.world.laserState(h) !== 0) slowFor = 0;
        else slowFor = Math.min(slowFor, 14);
      }
      const ax = (dx / d) * slowFor - b.vx;
      const az = (dz / d) * slowFor - b.vz;
      x = Math.max(-1, Math.min(1, ax / 12)) || 0.001;
      y = Math.max(-1, Math.min(1, -az / 12)) || 0.001;
    }
    game.update(dt, x, y);
    result.steps++;
  }
  result.section = (game as unknown as { section: number }).section;
  return result;
}
