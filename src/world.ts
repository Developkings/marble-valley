import type { Cell, Course, Laser, Piston } from './course';

const CRUMBLE_DELAY = 0.7;
const CRUMBLE_FALL = 0.5;

const PISTON_HEIGHT = 16;
const PISTON_DROP_AT = 0.55;
const PISTON_DOWN_AT = 0.68;
const PISTON_RISE_AT = 0.84;
const PISTON_DANGER_HEIGHT = 2.2;

const LASER_WARN_AT = 0.45;
const LASER_ON_AT = 0.6;
const LASER_REACH = 1.1;
const LASER_HEIGHT = 2.2;

// What changes while a course is played. The course itself stays untouched, shareable data.
export class World {
  clock = 0;
  private crumbling = new Map<Cell, number>();

  constructor(readonly course: Course) {}

  reset(): void {
    this.clock = 0;
    this.crumbling.clear();
  }

  restoreCrumble(): void {
    this.crumbling.clear();
  }

  cellAt(x: number, z: number): Cell | undefined {
    const c = this.course.cellAt(x, z);
    if (!c) return undefined;
    const goneAt = this.crumbling.get(c);
    return goneAt !== undefined && this.clock >= goneAt ? undefined : c;
  }

  // Top surface height, or -Infinity over the void.
  surface(x: number, z: number): number {
    const c = this.cellAt(x, z);
    return c ? this.course.heightOn(c, x, z) : -Infinity;
  }

  // True the first time a crumbling block is stepped on.
  touch(cell: Cell): boolean {
    if (cell.kind !== 'crumble' || this.crumbling.has(cell)) return false;
    this.crumbling.set(cell, this.clock + CRUMBLE_DELAY);
    return true;
  }

  // 0 solid, up to 1 about to go, above 1 falling (1 to 2).
  crumbleState(cell: Cell): number {
    const goneAt = this.crumbling.get(cell);
    if (goneAt === undefined) return 0;
    const t = this.clock - goneAt;
    return t < 0 ? 1 + t / CRUMBLE_DELAY : 1 + Math.min(1, t / CRUMBLE_FALL);
  }

  // Height of a piston's underside above the track.
  pistonHeight(p: Piston): number {
    const f = (this.clock / p.period + p.phase) % 1;
    if (f < PISTON_DROP_AT) return PISTON_HEIGHT;
    if (f < PISTON_DOWN_AT) {
      const k = (f - PISTON_DROP_AT) / (PISTON_DOWN_AT - PISTON_DROP_AT);
      return PISTON_HEIGHT * (1 - k * k);
    }
    if (f < PISTON_RISE_AT) return 0;
    return (PISTON_HEIGHT * (f - PISTON_RISE_AT)) / (1 - PISTON_RISE_AT);
  }

  // 0 off, 1 warning, 2 lethal.
  laserState(l: Laser): 0 | 1 | 2 {
    const f = (this.clock / l.period + l.phase) % 1;
    return f < LASER_WARN_AT ? 0 : f < LASER_ON_AT ? 1 : 2;
  }

  isLethal(x: number, y: number, z: number): boolean {
    for (const h of this.course.hazards) {
      if (h.type === 'piston') {
        const half = h.size / 2;
        if (Math.abs(x - h.x) < half && Math.abs(z - h.z) < half && h.y + this.pistonHeight(h) - y < PISTON_DANGER_HEIGHT) {
          return true;
        }
      } else if (h.type === 'laser' && this.laserState(h) === 2) {
        const across = h.axis === 'x' ? Math.abs(z - h.z) : Math.abs(x - h.x);
        const along = h.axis === 'x' ? Math.abs(x - h.x) : Math.abs(z - h.z);
        if (across < LASER_REACH && along < h.span / 2 && y - h.y < LASER_HEIGHT) return true;
      }
    }
    return false;
  }

  // Magnets pull inwards, staying strong until near the edge of the field.
  // Strength must stay below the marble's thrust, or the centre becomes a trap with no way out.
  addFieldForce(x: number, z: number, out: { x: number; z: number }): void {
    for (const h of this.course.hazards) {
      if (h.type !== 'magnet') continue;
      const dx = h.x - x;
      const dz = h.z - z;
      const d = Math.hypot(dx, dz);
      if (d > h.radius || d < 0.01) continue;
      const edge = d / h.radius;
      const pull = h.strength * (1 - edge * edge);
      out.x += (dx / d) * pull;
      out.z += (dz / d) * pull;
    }
  }
}
