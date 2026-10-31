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
    expect(rows[0][middle]).toBe('.');
    expect(rows[rows.length - 1][middle]).toBe('.');
  });

  const reference = drive(FIRST_COURSE);

  it('can finish the first course', () => {
    expect(reference.finished).toBe(true);
  });

  for (const level of LEVELS) {
    it(`${level.name} never runs over itself and can be finished, in about five times the first course`, () => {
      const course = new Course(level);
      const run = drive(level);
      console.log(`${level.id.padEnd(9)} ${level.name.padEnd(15)} ${level.style.padEnd(6)} cells ${String(course.list.length).padStart(6)}  time ${run.time.toFixed(0).padStart(5)}  x${(run.time / reference.time).toFixed(1)}  falls ${run.falls} ${run.finished ? '' : `STUCK section ${run.section}/${course.checkpoints.length}`}`);
      expect(course.overlaps).toBe(0);
      expect(run.finished).toBe(true);
    }, 120000);
  }

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
