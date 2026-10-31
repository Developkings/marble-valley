import { describe, expect, it } from 'vitest';
import { Course, FIRST_COURSE } from '../src/course';
import { LEVELS } from '../src/levels';
import { mazeRows } from '../src/pieces';
import { RACE_TRACKS } from '../src/tracks';
import { drive } from './autopilot';

describe('levels', () => {
  it('has 20 of them, with every style', () => {
    expect(LEVELS).toHaveLength(20);
    expect(new Set(LEVELS.map((l) => l.id)).size).toBe(20);
    for (const style of ['Speed', 'Maze', 'Skill', 'Mix']) expect(LEVELS.filter((l) => l.style === style)).toHaveLength(5);
  });

  it('generates mazes with a door at each end', () => {
    const rows = mazeRows(3, 5, 4);
    const middle = (rows[0].length - 1) / 2;
    expect(rows[0][middle]).not.toBe('#');
    expect(rows[rows.length - 1][middle]).not.toBe('#');
  });

  const reference = drive(FIRST_COURSE);

  it('can finish the first course', () => {
    expect(reference.finished).toBe(true);
  });

  for (const level of LEVELS) {
    it(`${level.name} never runs over itself and can be finished`, () => {
      const course = new Course(level);
      const run = drive(level);
      console.log(`${level.id.padEnd(9)} ${level.name.padEnd(15)} ${level.style.padEnd(6)} cells ${String(course.list.length).padStart(6)}  time ${run.time.toFixed(0).padStart(5)}  x${(run.time / reference.time).toFixed(1)}  falls ${run.falls} ${run.finished ? '' : `STUCK section ${run.section}/${course.checkpoints.length}`}`);
      expect(course.overlaps).toBe(0);
      expect(run.finished).toBe(true);
    }, 120000);
  }

  for (const level of LEVELS) {
    it(`${level.name} doesn't keep repeating itself`, () => {
      const plan = level.plan.filter((name) => name !== 'clearing');
      const runs = plan.slice(2).map((name, i) => `${plan[i]}>${plan[i + 1]}>${name}`);
      expect(new Set(runs).size).toBe(runs.length);
      const counts = new Map<string, number>();
      for (const name of plan) counts.set(name, (counts.get(name) ?? 0) + 1);
      if (plan.length > 12) expect(Math.max(...counts.values()) / plan.length).toBeLessThan(0.25);
      if (level.style !== 'Maze') expect(counts.size).toBeGreaterThanOrEqual(6);
    });

    it(`${level.name} goes round its corners rather than turning square`, () => {
      let dir = 'N';
      for (const op of level.ops) {
        if (op.op === 'bend') dir = op.to;
        else if (op.op === 'run') expect(op.dir).toBe(dir);
      }
    });
  }

  it('keeps the stretches of Long Fall picked out by hand apart from its opening', () => {
    const plan = LEVELS[0].plan;
    expect(plan.slice(7, 11)).toEqual(['diagonalSteps', 'plunge', 'wideSplit', 'fallingHumps']);
    expect(plan.slice(0, 4).filter((name) => plan.slice(7, 11).includes(name))).toEqual([]);
  });

  it('has mazes much too big to see across', () => {
    for (const level of LEVELS.filter((l) => l.style === 'Maze')) {
      const mazes = level.ops.filter((op) => op.op === 'maze');
      expect(mazes.length).toBeGreaterThanOrEqual(2);
      const biggest = Math.max(...mazes.map((op) => (op.op === 'maze' ? op.rows.length * op.rows[0].length : 0)));
      expect(biggest).toBeGreaterThanOrEqual(45 * 45);
    }
  });

  for (const track of RACE_TRACKS) {
    it(`circuit ${track.name} joins up with itself`, () => {
      const course = new Course(track);
      expect(course.end.x).toBe(0);
      expect(course.end.z).toBe(0);
      expect(Math.abs(course.end.h)).toBeLessThan(0.001);
      expect(course.overlaps).toBe(0);
    });
  }
});
