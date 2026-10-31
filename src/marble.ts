import { DIR_VEC } from './course';
import type { World } from './world';

const GRAVITY_ACCEL = 34;
const THRUST = 52;
const AIR_CONTROL = 14;
const DRAG = 0.72;
const MAX_SPEED = 115;
const BURST_MAX_SPEED = 140;
const STEP_UP = 0.7;
const STICK_DOWN = 0.7;
const BOUNCE = 0.45;
const REACH = 0.9;
const FAST_DRAG = 0.3;
const FAST_PUSH = 34;
const MAZE_DRAG = 1.8;
const BOOST_KICK = 40;
const BOOST_PUSH = 50;
const BURST_PUSH = 90;
const HARD_LANDING = -14;
const LOUD_IMPACT = 20;

export const GRAVITY = GRAVITY_ACCEL;

export type MarbleEvent = 'boost' | 'wall' | 'crumble';

// One ball's physics. Knows nothing about sensors or players: it takes a force and a world,
// so a second ball on the same course is just a second Marble.
export class Marble {
  x = 0;
  y = 0;
  z = 0;
  vx = 0;
  vy = 0;
  vz = 0;
  grounded = true;
  burstLeft = 0;
  landedHard = false;
  landedNow = false;
  private inBoost = false;
  private field = { x: 0, z: 0 };

  onEvent: ((e: MarbleEvent) => void) | null = null;

  get speed(): number {
    return Math.hypot(this.vx, this.vz);
  }

  placeAt(x: number, y: number, z: number): void {
    this.x = x;
    this.y = y;
    this.z = z;
    this.vx = 0;
    this.vy = 0;
    this.vz = 0;
    this.grounded = true;
    this.inBoost = false;
    this.burstLeft = 0;
  }

  step(dt: number, world: World, forceX: number, forceZ: number, capSpeed: boolean): void {
    this.landedNow = false;
    const cell = world.cellAt(this.x, this.z);

    if (this.grounded && cell) {
      const drag = cell.kind === 'fast' ? FAST_DRAG : cell.kind === 'maze' ? MAZE_DRAG : DRAG;
      this.field.x = 0;
      this.field.z = 0;
      world.addFieldForce(this.x, this.z, this.field);
      // Slopes pull the marble downhill; tilt pushes it around like a table.
      this.vx += (forceX * THRUST + this.field.x - cell.sx * GRAVITY_ACCEL - this.vx * drag) * dt;
      this.vz += (forceZ * THRUST + this.field.z - cell.sz * GRAVITY_ACCEL - this.vz * drag) * dt;

      if (cell.dir && (cell.kind === 'boost' || cell.kind === 'fast')) {
        const d = DIR_VEC[cell.dir];
        const push = cell.kind === 'boost' ? BOOST_PUSH : FAST_PUSH;
        this.vx += d.x * push * dt;
        this.vz += d.z * push * dt;
        if (cell.kind === 'boost' && !this.inBoost) {
          this.vx += d.x * BOOST_KICK;
          this.vz += d.z * BOOST_KICK;
          this.onEvent?.('boost');
        }
      }
      this.inBoost = cell.kind === 'boost';
      if (world.touch(cell)) this.onEvent?.('crumble');

      if (this.burstLeft > 0) this.applyBurst(dt, cell.dir);
    } else {
      this.vx += forceX * AIR_CONTROL * dt;
      this.vz += forceZ * AIR_CONTROL * dt;
      this.vy -= GRAVITY_ACCEL * dt;
      this.inBoost = false;
    }
    this.burstLeft = Math.max(0, this.burstLeft - dt);

    const speed = this.speed;
    const cap = this.burstLeft > 0 ? BURST_MAX_SPEED : MAX_SPEED;
    if (capSpeed && speed > cap) {
      this.vx *= cap / speed;
      this.vz *= cap / speed;
    }

    this.moveAxis(world, this.vx * dt, 0);
    this.moveAxis(world, 0, this.vz * dt);
    this.y += this.vy * dt;

    const ground = world.surface(this.x, this.z);
    if (this.grounded) {
      const below = this.y - ground;
      if (below >= -STEP_UP && below <= STICK_DOWN) {
        this.y = ground;
        this.vy = 0;
      } else {
        this.grounded = false;
      }
    } else if (this.y <= ground && this.vy <= 0) {
      this.landedHard = this.vy < HARD_LANDING;
      this.landedNow = true;
      this.y = ground;
      this.vy = 0;
      this.grounded = true;
    }
  }

  private applyBurst(dt: number, fallback: 'N' | 'W' | 'E' | undefined): void {
    const speed = this.speed;
    const d = DIR_VEC[fallback ?? 'N'];
    const ux = speed > 1 ? this.vx / speed : d.x;
    const uz = speed > 1 ? this.vz / speed : d.z;
    this.vx += ux * BURST_PUSH * dt;
    this.vz += uz * BURST_PUSH * dt;
  }

  // Walls: a block more than a small step above the marble stops that axis.
  private moveAxis(world: World, dx: number, dz: number): void {
    if (dx === 0 && dz === 0) return;
    const probeX = this.x + dx + Math.sign(dx) * REACH;
    const probeZ = this.z + dz + Math.sign(dz) * REACH;
    if (world.surface(probeX, probeZ) > this.y + STEP_UP) {
      const impact = Math.abs(dx !== 0 ? this.vx : this.vz);
      if (dx !== 0) this.vx *= -BOUNCE;
      else this.vz *= -BOUNCE;
      if (impact > LOUD_IMPACT) this.onEvent?.('wall');
      return;
    }
    this.x += dx;
    this.z += dz;
  }
}
