import { describe, expect, it } from 'vitest';
import { ARENAS } from '../src/arenas';
import { CELL, Course } from '../src/course';
import { Game } from '../src/game';
import { Marble } from '../src/marble';
import { isCourseData, plainCourse } from '../src/myTracks';
import { Race, START_HEARTS, type RaceMessage } from '../src/race';
import type { Sensors } from '../src/sensors';
import { RACE_TRACKS } from '../src/tracks';
import { wayTo } from './autopilot';

const stillSensors = { steer: 0, pitch: 0, calibrate() {}, trackNeutral() {} } as unknown as Sensors;

// Rolls from one point to another with the physics of the game, keeping to the way over the floor.
function rollTo(game: Game, targetX: number, targetZ: number, seconds: number): boolean {
  const course = game.course;
  const target = course.cellAt(targetX, targetZ)!;
  const dt = 1 / 60;
  for (let t = 0; t < seconds; t += dt) {
    let x = 0;
    let y = 0;
    if (game.state === 'run') {
      const b = game.ball;
      const here = course.cellAt(b.x, b.z);
      if (here === target && b.grounded) return true;
      const path = here ? wayTo(course, here, target) : null;
      const ahead = path && path.length > 1 ? path[Math.min(path.length - 1, 1)] : target;
      const dx = (ahead.ix + 0.5) * CELL - b.x;
      const dz = (ahead.iz + 0.5) * CELL - b.z;
      const d = Math.hypot(dx, dz) || 1;
      x = Math.max(-1, Math.min(1, ((dx / d) * 12 - b.vx) / 10)) || 0.001;
      y = Math.max(-1, Math.min(1, -((dz / d) * 12 - b.vz) / 10)) || 0.001;
    }
    game.update(dt, x, y);
  }
  return false;
}

describe('arenas', () => {
  it('there are four, with room for everyone to start and things to pick up', () => {
    expect(ARENAS).toHaveLength(4);
    for (const arena of ARENAS) {
      const course = new Course(arena);
      expect(arena.kind).toBe('arena');
      expect(course.checkpoints.length).toBeGreaterThanOrEqual(4);
      expect(course.itemBoxes.length).toBeGreaterThanOrEqual(10);
      expect(new Set(course.list.map((c) => Math.round(c.h))).size).toBeGreaterThan(2);
    }
  });

  for (const arena of ARENAS) {
    it(`${arena.name}: every box can be rolled to from the first start`, () => {
      const game = new Game(stillSensors);
      game.loadCourse(arena);
      const course = game.course;
      for (const box of course.itemBoxes) {
        game.begin();
        const reached = rollTo(game, box.x, box.z, 60);
        if (!reached) console.log('NOT REACHED', arena.name, box.x, box.z, game.ball.x, game.ball.y, game.ball.z);
        expect(reached).toBe(true);
      }
    }, 120000);
  }
});

describe('battle rules', () => {
  const players = [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }];
  const make = () => {
    const sent: RaceMessage[] = [];
    const race = new Race(new Course(ARENAS[0]), players, 'a', 1, new Marble(), (m) => sent.push(m), () => true);
    return { race, sent };
  };

  it('a fall costs a heart, and the third is the end', () => {
    const { race } = make();
    expect(race.battle).toBe(true);
    for (let i = 0; i < START_HEARTS; i++) {
      expect(race.hearts).toBe(START_HEARTS - i);
      expect(race.over).toBe(false);
      race.fell(0);
      race.step(2); // past the moment of safety after losing one
    }
    expect(race.hearts).toBe(0);
    expect(race.over).toBe(true);
  });

  it('two hits at once only cost one heart', () => {
    const { race } = make();
    race.fell(0);
    race.fell(0);
    expect(race.hearts).toBe(START_HEARTS - 1);
  });

  it('the last one left wins, and hears about it from the rival going out', () => {
    const { race } = make();
    race.receive({ t: 's', id: 'b', x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, lap: 1, sec: 0, score: 0, fin: 30, sh: false, h: 0 });
    expect(race.over).toBe(true);
    race.finish = 31;
    expect(race.standings()[0].id).toBe('a');
  });

  it('someone who goes silent is out', () => {
    const { race } = make();
    race.tick(3);
    expect(race.over).toBe(false);
    race.tick(7);
    expect(race.over).toBe(true);
  });

  it('tells the others how many hearts are left', () => {
    const { race, sent } = make();
    race.fell(0);
    race.tick(1);
    expect(sent.some((m) => m.t === 's' && m.h === START_HEARTS - 1)).toBe(true);
  });
});

describe('tracks passed around a room', () => {
  it('accepts the game\'s own', () => {
    for (const t of [...RACE_TRACKS, ...ARENAS]) expect(isCourseData(plainCourse(t))).toBe(true);
  });

  it('turns away what no phone should try to build', () => {
    const good = plainCourse(RACE_TRACKS[0]);
    expect(isCourseData(null)).toBe(false);
    expect(isCourseData({ ...good, version: 2 })).toBe(false);
    expect(isCourseData({ ...good, name: 'x'.repeat(100) })).toBe(false);
    expect(isCourseData({ ...good, ops: 'nope' })).toBe(false);
    expect(isCourseData({ ...good, ops: [{ op: 'hack' }] })).toBe(false);
    expect(isCourseData({ ...good, ops: [{ op: 'run', dir: 'N', len: 2000, width: 2000 }] })).toBe(false);
    expect(isCourseData({ ...good, ops: [{ op: 'run', dir: 'N', len: Infinity, width: 4 }] })).toBe(false);
    expect(isCourseData({ ...good, ops: [{ op: 'maze', rows: ['<script>'] }] })).toBe(false);
  });
});

describe('a race on a track with a start and finish', () => {
  it('ends at the finish, with no laps', () => {
    const data = { version: 1 as const, id: 'p', name: 'P', kind: 'course' as const, ops: [{ op: 'backstop' as const, width: 8 }, { op: 'run' as const, dir: 'N' as const, len: 20, width: 8 }, { op: 'run' as const, dir: 'N' as const, len: 3, width: 8, kind: 'finish' as const }] };
    const course = new Course(data);
    const race = new Race(course, [{ id: 'a', name: 'A' }], 'a', 3, new Marble(), () => {}, () => true);
    expect(race.open).toBe(true);
    expect(race.passCell(course.list.find((c) => c.kind === 'plain')!)).toBe(false);
    expect(race.passCell(course.list.find((c) => c.kind === 'finish')!)).toBe(true);
  });
});
