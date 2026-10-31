import type { CourseData, CourseOp } from './course';
import { boost, climb, crumble, finish, flat, ice, jump, lasers, loop, magnets, maze, pistons, rally, rough, speed, start, times, zigzag } from './pieces';

export type LevelStyle = 'Speed' | 'Maze' | 'Skill' | 'Mix';

export interface Level extends CourseData {
  style: LevelStyle;
}

const level = (n: number, name: string, style: LevelStyle, width: number, ops: CourseOp[]): Level => ({
  version: 1,
  id: `level-${n}`,
  name,
  style,
  kind: 'course',
  ops: [...start(width), ...ops, ...finish(width)],
});

// Each is meant to take a regular player around five minutes, about five times the first course when
// driven by test/autopilot.ts. Mazes take three, as the driver already knows the way through.
export const LEVELS: Level[] = [
  level(1, 'Long Fall', 'Speed', 10, [
    ...boost(10),
    ...times(13, (i) => [
      ...speed(70, 10, 12 + (i % 9)),
      ...jump(10),
      ...zigzag(16, 10, 14, i % 2 ? 'E' : 'W'),
      ...boost(10),
    ]),
  ]),
  level(2, 'Hedge Walk', 'Maze', 8, [
    ...times(10, (i) => [...maze(i + 1, 5, 6 + (i % 5)), ...flat(10, 8, 'N', 2), ...boost(8), ...speed(30, 8)]),
  ]),
  level(3, 'Knife Edge', 'Skill', 6, [
    ...times(12, (i) => [
      ...flat(24, 4 + (i % 2) * 2),
      ...zigzag(14, 6, 10, i % 2 ? 'W' : 'E'),
      ...lasers(2, 6),
      ...speed(20, 4, 3),
      ...flat(8, 6),
    ]),
  ]),
  level(4, 'Grand Tour', 'Mix', 10, [
    ...times(7, (i) => [
      ...speed(50, 10),
      ...jump(10),
      ...maze(20 + i, 5, 5),
      ...flat(8, 8),
      ...pistons(3, 8),
      ...rally([0, 8, -8], 10),
      ...loop(),
      ...zigzag(16, 8, 12),
    ]),
  ]),
  level(5, 'Slipstream', 'Speed', 8, [
    ...times(12, (i) => [
      ...boost(8),
      ...speed(60, 8, 10),
      ...ice(30, 10, 4),
      ...flat(14, 10),
      ...zigzag(14, 8, 12, i % 2 ? 'W' : 'E'),
      ...speed(30, 6, 6),
      ...jump(8, 12),
    ]),
  ]),
  level(6, 'Old Cellars', 'Maze', 8, [
    ...times(6, (i) => [...maze(40 + i, 7, 6 + (i % 4)), ...rough(16, 8), ...lasers(1, 8), ...flat(6, 8)]),
  ]),
  level(7, 'Piston Works', 'Skill', 8, [
    ...times(13, (i) => [
      ...pistons(5, 8, 2.6 + (i % 3) * 0.4),
      ...flat(10, 8, 'N', 2),
      ...zigzag(12, 8, 10, i % 2 ? 'E' : 'W'),
      ...crumble(12, 8),
      ...flat(8, 8),
    ]),
  ]),
  level(8, 'Stadium Flow', 'Mix', 10, [
    ...times(9, (i) => [
      ...boost(10),
      ...speed(40, 10),
      ...loop(),
      ...jump(10, 16),
      ...zigzag(18, 10, 14, i % 2 ? 'W' : 'E'),
      ...lasers(2, 10),
      ...climb(30, 10, 7),
      ...speed(30, 10, 10),
    ]),
  ]),
  level(9, 'Thunder Run', 'Speed', 12, [
    ...times(8, (i) => [
      ...boost(12),
      ...speed(90, 12, 18),
      ...jump(12, 18),
      ...boost(12),
      ...speed(50, 8, 8),
      ...zigzag(16, 8, 12, i % 2 ? 'E' : 'W'),
      ...climb(20, 12, 6),
      ...jump(12, 14),
    ]),
  ]),
  level(10, 'The Labyrinth', 'Maze', 8, [
    ...maze(60, 9, 12),
    ...flat(10, 8),
    ...maze(61, 9, 14),
    ...flat(10, 8),
    ...maze(62, 11, 14),
    ...flat(10, 8),
    ...flat(10, 8),
    ...maze(63, 11, 16),
    ...flat(10, 8),
    ...maze(64, 9, 14),
    ...flat(10, 8),
    ...maze(65, 11, 14),
  ]),
  level(11, 'Pad Hopper', 'Skill', 6, [
    ...times(16, (i) => [
      ...rally(i % 2 ? [0, 8, -8, 8, -4] : [0, -8, 8, -8, 4], 10),
      ...boost(6),
      ...speed(30, 6, 5),
      ...magnets(2, 8),
      ...flat(6, 6),
      ...lasers(1, 6),
    ]),
  ]),
  level(12, 'Tower Drop', 'Mix', 10, [
    ...times(8, (i) => [
      // A long haul up, then everything it earned back at once.
      ...climb(40, 10, 10),
      ...flat(10, 10),
      ...zigzag(14, 8, 10, i % 2 ? 'W' : 'E'),
      ...climb(40, 8, 10),
      ...crumble(10, 8),
      ...boost(10),
      ...speed(80, 10, 24),
      ...jump(10),
      ...maze(70 + i, 5, 4),
    ]),
  ]),
  level(13, 'Golden Mile', 'Speed', 10, [
    ...times(14, (i) => [
      ...speed(100, 10, 14),
      ...boost(10),
      ...jump(10, 10 + (i % 3) * 4),
      ...flat(4, 10),
      ...zigzag(20, 10, 14, i % 2 ? 'W' : 'E'),
    ]),
  ]),
  level(14, 'Copper Mines', 'Maze', 8, [
    ...times(11, (i) => [...maze(80 + i, 7, 5 + (i % 3)), ...pistons(2, 8), ...crumble(10, 8), ...flat(6, 8), ...magnets(1, 8)]),
  ]),
  level(15, 'Glass Road', 'Skill', 8, [
    ...times(9, (i) => [
      ...ice(30, 8),
      ...flat(12, 8),
      ...zigzag(14, 8, 10, i % 2 ? 'E' : 'W'),
      ...ice(24, 6, 3),
      ...flat(6, 8),
      ...lasers(1, 8),
      ...ice(16, 4),
      ...flat(8, 8),
    ]),
  ]),
  level(16, 'Night Circuit', 'Mix', 8, [
    ...times(7, (i) => [
      ...speed(36, 8),
      ...lasers(2, 8, 2.2),
      ...rally([0, 8, -8], 10),
      ...boost(6),
      ...loop(),
      ...maze(100 + i, 5, 3),
      ...flat(6, 8),
      ...zigzag(12, 8, 10),
    ]),
  ]),
  level(17, 'Afterburner', 'Speed', 8, [
    ...times(11, (i) => [
      ...boost(8),
      ...speed(70, 8, 12),
      ...boost(8),
      ...loop(),
      ...jump(10, 16),
      ...boost(8),
      ...speed(60, 6, 12),
      ...zigzag(14, 8, 12, i % 2 ? 'E' : 'W'),
    ]),
  ]),
  level(18, 'Mirror Hall', 'Maze', 8, [
    ...times(7, (i) => [...maze(120 + i, 9, 7), ...ice(16, 8), ...flat(6, 8), ...lasers(1, 8)]),
  ]),
  level(19, 'Laser Yard', 'Skill', 8, [
    ...times(7, (i) => [
      ...lasers(5, 8, 2.2 + (i % 3) * 0.3),
      ...zigzag(12, 8, 10, i % 2 ? 'W' : 'E'),
      ...magnets(2, 8),
      ...pistons(2, 8),
      ...flat(8, 8, 'N', 2),
    ]),
  ]),
  level(20, 'The Long Way', 'Mix', 10, [
    ...times(6, (i) => [
      ...boost(10),
      ...speed(50, 10),
      ...jump(10),
      ...maze(140 + i, 7, 5),
      ...flat(8, 8),
      ...ice(20, 8),
      ...flat(6, 8),
      ...pistons(3, 8),
      ...lasers(2, 8),
      ...rally([0, -8, 8], 10),
      ...loop(),
      ...zigzag(16, 10, 14, i % 2 ? 'E' : 'W'),
      ...crumble(10, 6),
      ...flat(6, 8),
    ]),
  ]),
];
