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

// Shortest way over the floor, in blocks, or null when a gap or wall is in the way.
export function wayTo(course: Course, from: Cell, target: Cell, midOnly = true): Cell[] | null {
  const byKey = new Map<string, Cell>();
  for (const c of course.list) if (Math.abs(c.ix - from.ix) < 120 && Math.abs(c.iz - from.iz) < 120) byKey.set(key(c.ix, c.iz), c);
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
        const o = byKey.get(key(n.ix + ox, n.iz + oz));
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
      const toCell = point ? course.cellAt(point.x, point.z) : finishCell;
      let aimX = point ? point.x : (finishCell.ix + 0.5) * CELL;
      let aimZ = point ? point.z : (finishCell.iz + 0.5) * CELL;
      let slowFor = 90;
      if (here && toCell) {
        if (here !== pathFrom || toCell !== pathTo) {
          path = wayTo(course, here, toCell);
          pathFrom = here;
          pathTo = toCell;
        }
        if (path && path.length > 1) {
          const ahead = path[Math.min(path.length - 1, here.kind === 'maze' ? 2 : 4)];
          aimX = (ahead.ix + 0.5) * CELL;
          aimZ = (ahead.iz + 0.5) * CELL;
          // Slowing ahead of a turn in the route.
          const far = path[Math.min(path.length - 1, 8 + Math.floor(b.speed * 0.4))];
          const straight = Math.abs(far.ix - here.ix) < 4 || Math.abs(far.iz - here.iz) < 4;
          if (here.kind === 'maze') slowFor = 22;
          else if (!straight) slowFor = 30;
        }
        if (here.kind === 'ice') slowFor = Math.min(slowFor, 30);
      }
      const dx = aimX - b.x;
      const dz = aimZ - b.z;
      const d = Math.hypot(dx, dz) || 1;
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
