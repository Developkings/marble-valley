import { Course, type CourseData, type CourseOp } from './course';

// Tracks the player has made, kept with the pieces they were built from so they can be edited again.
export interface MyTrack extends CourseData {
  pieces: CourseOp[][];
}

const KEY = 'marble-tracks';
export const MAX_TRACK_OPS = 120;
export const MAX_TRACK_BYTES = 50000; // what a room can pass around in one message
const MAX_CELLS = 60000;
const MAX_NUMBER = 3000;

export function loadMyTracks(): MyTrack[] {
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) ?? '[]') as unknown;
    return Array.isArray(stored) ? stored.filter((t) => isCourseData(t) && Array.isArray((t as MyTrack).pieces)) : [];
  } catch {
    return [];
  }
}

function store(tracks: MyTrack[]): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(tracks));
    return true;
  } catch {
    return false;
  }
}

export function saveMyTrack(track: MyTrack): boolean {
  const others = loadMyTracks().filter((t) => t.id !== track.id);
  return store([...others, track]);
}

export function deleteMyTrack(id: string): void {
  store(loadMyTracks().filter((t) => t.id !== id));
}

// Just what the course needs, for sending to others.
export function plainCourse(track: CourseData): CourseData {
  return { version: 1, id: track.id, name: track.name, kind: track.kind, ops: track.ops };
}

const OPS = new Set(['backstop', 'run', 'bend', 'wave', 'field', 'fork', 'drop', 'gap', 'loop', 'maze', 'rally', 'piston', 'laser', 'magnet', 'items', 'plate', 'spawn', 'box']);
const DIRS = new Set(['N', 'E', 'S', 'W']);
const KINDS = new Set(['plain', 'fast', 'boost', 'ramp', 'launch', 'land', 'maze', 'finish', 'crumble', 'ice', 'pad', 'wall']);

function fairOp(op: unknown): boolean {
  if (!op || typeof op !== 'object') return false;
  for (const [name, value] of Object.entries(op)) {
    if (typeof value === 'number') {
      if (!Number.isFinite(value) || Math.abs(value) > MAX_NUMBER) return false;
    } else if (typeof value === 'string') {
      if (name === 'op' && !OPS.has(value)) return false;
      if ((name === 'dir' || name === 'to') && !DIRS.has(value)) return false;
      if ((name === 'kind' || name === 'floor') && !KINDS.has(value)) return false;
    } else if (Array.isArray(value)) {
      if (value.length > 300) return false;
      for (const item of value) {
        if (typeof item === 'number' ? !Number.isFinite(item) : typeof item !== 'string' || item.length > 300 || !/^[#. 0-9A-Z]*$/.test(item)) return false;
      }
    } else if (typeof value !== 'boolean' && value !== undefined) {
      return false;
    }
  }
  return OPS.has((op as { op: string }).op);
}

// A track from someone else on the network, or from storage: it has to be one the game can build, at a size it can bear.
export function isCourseData(data: unknown): data is CourseData {
  const d = data as CourseData | null;
  if (!d || typeof d !== 'object' || d.version !== 1) return false;
  if (typeof d.id !== 'string' || d.id.length > 64 || typeof d.name !== 'string' || d.name.length > 32) return false;
  if (!Array.isArray(d.ops) || d.ops.length > 1000 || !d.ops.every(fairOp)) return false;
  let cost = 0;
  for (const op of d.ops) {
    if (op.op === 'run') cost += Math.abs(op.len) * Math.abs(op.width);
    if (op.op === 'plate') cost += Math.abs(op.w) * Math.abs(op.d);
    if (op.op === 'wave' || op.op === 'field' || op.op === 'fork') cost += Math.abs(op.len) * Math.abs(op.width);
    if (op.op === 'bend') cost += Math.abs(op.radius) * 2 * Math.abs(op.width);
  }
  if (cost > MAX_CELLS) return false;
  try {
    const course = new Course(d);
    return course.checkpoints.length > 0 && course.list.length <= MAX_CELLS;
  } catch {
    return false;
  }
}
