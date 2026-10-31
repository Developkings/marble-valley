import { Course, DIR_VEC, FIRST_COURSE, loopPoint, type Hop, type Loop } from './course';
import { GRAVITY, Marble } from './marble';
import type { Sensors } from './sensors';
import { log } from './telemetry';
import { World } from './world';

export type State = 'menu' | 'countdown' | 'run' | 'loop' | 'jumpWindow' | 'flight' | 'finished';
export type Cue = 'boost' | 'wall' | 'crumble' | 'orb' | 'burst' | 'catch' | 'hit' | 'land' | 'softLand' | 'tick' | 'go' | 'fall' | 'launch' | 'loop';

const DEG = Math.PI / 180;
const DEFAULT_TILT_FULL = 22 * DEG;
const DEADZONE = 2 * DEG;

const LOOP_TRIGGER = 1.5; // world units before the end of the lane in, ahead of falling off it

const STEP = 1 / 120;

const WINDOW_SECONDS = 1;
const CATCH_RATE = 9;
const HOP_SECONDS = 1.05;
const TILT_TO_ACT = 0.5; // how far over the phone must be, of full tilt, to count as a move
const TILT_CHANGE_TO_ACT = 0.4; // and how far from how it was held on arriving
const DIRECTION_MATCH = Math.SQRT1_2; // within 45 degrees of the arrow
const LATE_REACH = 0.3; // too late: the jump leaves the pad but never gets near the next one
const BOUNCE_UP = 10; // landing without tilting back: bounces on, off the end of a pad
const COUNTDOWN_SECONDS = 3;
const EXIT_SPEED = 55;
const EXIT_SPEED_PER_CLEAN_HOP = 12;

const ORB_REACH = 2.6;
const ORB_VALUE = 0.2;
const BURST_SECONDS_FULL = 2.2;

const FALL_DEPTH = 34;

export class Game {
  readonly course = new Course(FIRST_COURSE);
  readonly world = new World(this.course);
  readonly ball = new Marble();
  readonly orbTaken: boolean[] = this.course.orbs.map(() => false);
  meter = 0;
  state: State = 'menu';
  time = 0;
  // Tilt in -1..1, for the view's parallax and for jumping.
  tiltX = 0;
  tiltY = 0;
  tiltFull = DEFAULT_TILT_FULL; // tilt that gives full force
  groundY = 0; // height of the ground last rolled on, what height in the air is measured from

  private loop: Loop | null = null;
  private loopAngle = 0;
  private loopSpeed = 0;
  private loopOffset = { x: 0, z: 0 };
  private loopAt = { x: 0, y: 0, z: 0 };
  private accumulator = 0;
  private section = 0;
  private windowLeft = 0;
  private heldX = 0; // tilt on arriving at the pad, so simply holding it or letting go doesn't jump
  private heldY = 0;
  private hop: Hop | null = null;
  private hopDirX = 0; // unit direction of the hop, in tilt terms: x right, y up the screen
  private hopDirY = 0;
  private flightOk = false; // a correct jump, still needing the tilt back to land
  private flightFailed = false; // a wrong or late jump, which can only end in a fall
  private tiltedBack = false;
  private cleanHops = 0;
  private countdownLeft = 0;
  private countdownCostsTime = false;
  private burning = false;

  onCallout: ((text: string, tone: 'neutral' | 'count' | 'good' | 'bad') => void) | null = null;
  onCue: ((cue: Cue) => void) | null = null;
  onFinish: ((time: number) => void) | null = null;

  constructor(private sensors: Sensors) {
    this.ball.onEvent = (e) => this.onCue?.(e);
    this.placeAt(0);
  }

  get speed(): number {
    return this.state === 'loop' ? Math.abs(this.loopSpeed) : this.ball.speed;
  }

  // What to show the player: which way to tilt (radians clockwise from up the screen) and the time left for it.
  get jumpCue(): { angle: number; timeLeft: number; landing: boolean } | null {
    if (this.state === 'jumpWindow') {
      return { angle: Math.atan2(this.hopDirX, this.hopDirY), timeLeft: Math.max(0, this.windowLeft / WINDOW_SECONDS), landing: false };
    }
    if (this.state === 'flight' && this.flightOk && !this.tiltedBack) {
      return { angle: Math.atan2(-this.hopDirX, -this.hopDirY), timeLeft: 1, landing: true };
    }
    return null;
  }

  // Back from the phone being put down or the app left: tilt has to be found again.
  realign(): void {
    if (this.state === 'run') this.startCountdown(false);
  }

  begin(): void {
    this.world.reset();
    this.placeAt(0);
    this.time = 0;
    this.accumulator = 0;
    this.cleanHops = 0;
    this.meter = 0;
    this.burning = false;
    this.orbTaken.fill(false);
    this.startCountdown(false);
    log('run', { event: 'begin' });
  }

  toMenu(): void {
    this.state = 'menu';
    this.world.reset();
    this.placeAt(0);
    this.tiltX = 0;
    this.tiltY = 0;
    log('run', { event: 'menu' });
  }

  // A tap spends the whole meter on one burst of speed.
  activateBurst(): void {
    if (this.state !== 'run' || this.meter <= 0 || this.ball.burstLeft > 0) return;
    this.ball.burstLeft = this.meter * BURST_SECONDS_FULL;
    this.burning = true;
    log('burst', { meter: this.meter, speed: this.ball.speed });
    this.onCue?.('burst');
  }

  // The marble is held while the phone settles, then tilt is measured from however it is held now.
  private startCountdown(costsTime: boolean): void {
    this.state = 'countdown';
    this.countdownLeft = COUNTDOWN_SECONDS;
    this.countdownCostsTime = costsTime;
    this.tiltX = 0;
    this.tiltY = 0;
    this.sensors.calibrate();
    this.onCallout?.(String(COUNTDOWN_SECONDS), 'count');
    this.onCue?.('tick');
  }

  private updateCountdown(dt: number): void {
    if (this.countdownCostsTime) this.time += dt;
    this.sensors.trackNeutral(dt);
    const before = Math.ceil(this.countdownLeft);
    this.countdownLeft -= dt;
    const after = Math.ceil(this.countdownLeft);
    if (this.countdownLeft <= 0) {
      this.state = 'run';
      this.accumulator = 0;
      this.onCallout?.('GO', 'count');
      this.onCue?.('go');
      log('run', { event: 'go', steer: this.sensors.steer, pitch: this.sensors.pitch });
    } else if (after !== before) {
      this.onCallout?.(String(after), 'count');
      this.onCue?.('tick');
    }
  }

  update(dt: number, keyX: number, keyY: number): void {
    if (this.state === 'menu' || this.state === 'finished') return;
    this.world.clock += dt;
    if (this.state === 'countdown') {
      this.updateCountdown(dt);
      return;
    }
    this.time += dt;

    this.tiltX = keyX !== 0 ? keyX : clampUnit(this.sensors.steer / this.tiltFull);
    this.tiltY = keyY !== 0 ? keyY : clampUnit(this.sensors.pitch / this.tiltFull);

    if (this.state === 'jumpWindow') {
      this.updateJumpWindow(dt);
      return;
    }
    if (this.state === 'flight' && this.flightOk && this.tiltsAgainstHop()) this.tiltedBack = true;

    // A jump's arc is set when it leaves the pad: tilting in the air is for landing, not steering.
    const free = this.state === 'run';
    const forceX = !free ? 0 : keyX !== 0 ? keyX : shape(this.sensors.steer, this.tiltFull);
    const forceZ = !free ? 0 : -(keyY !== 0 ? keyY : shape(this.sensors.pitch, this.tiltFull));

    this.accumulator += dt;
    while (this.accumulator >= STEP && (this.state === 'run' || this.state === 'flight' || this.state === 'loop')) {
      if (this.state === 'loop') this.stepLoop();
      else this.step(forceX, forceZ);
      this.accumulator -= STEP;
    }
    if (this.burning) {
      this.meter = this.ball.burstLeft / BURST_SECONDS_FULL;
      this.burning = this.ball.burstLeft > 0;
    }
  }

  private step(forceX: number, forceZ: number): void {
    const b = this.ball;
    b.step(STEP, this.world, forceX, forceZ, this.state === 'run');

    if (b.landedNow) {
      if (b.landedHard) this.onCue?.(this.state === 'flight' || b.launched ? 'land' : 'softLand');
      b.launched = false;
      if (this.state === 'flight') this.endFlight();
      if (this.state === 'countdown') return;
    }

    this.collectOrbs();

    if (this.world.isLethal(b.x, b.y, b.z)) {
      this.respawn();
      return;
    }
    if (b.grounded) {
      this.groundY = b.y;
      this.onGround();
      if (this.state === 'run') this.enterLoopIfAtOne();
    } else if (b.y < this.groundY - FALL_DEPTH) {
      this.respawn();
    }
  }

  private enterLoopIfAtOne(): void {
    const b = this.ball;
    for (const l of this.course.loops) {
      const d = DIR_VEC[l.dir];
      const along = (b.x - l.x) * d.x + (b.z - l.z) * d.z;
      const across = (b.x - l.x) * -d.z + (b.z - l.z) * d.x;
      if (Math.abs(across) > l.width / 2 || along < -LOOP_TRIGGER || along > LOOP_TRIGGER || Math.abs(b.y - l.y) > 1) continue;
      const speed = b.vx * d.x + b.vz * d.z;
      if (speed <= 0) continue;
      this.loop = l;
      this.loopAngle = 0;
      this.loopSpeed = speed;
      this.loopOffset.x = -d.z * across;
      this.loopOffset.z = d.x * across;
      this.state = 'loop';
      this.onCue?.('loop');
      log('loop', { event: 'enter', speed });
      return;
    }
  }

  // On the ring only its angle is free: gravity slows the climb and gives it back on the way down.
  // Too slow to stay pressed against the top and the marble drops off; too slow to reach
  // halfway up and it just rolls back down the way it came.
  private stepLoop(): void {
    const l = this.loop!;
    const b = this.ball;
    const r = l.radius;
    this.loopSpeed -= GRAVITY * Math.sin(this.loopAngle) * STEP;
    this.loopAngle += (this.loopSpeed / r) * STEP;
    const fromX = b.x;
    const fromY = b.y;
    const fromZ = b.z;

    const d = DIR_VEC[l.dir];
    if (this.loopAngle <= 0) {
      this.leaveLoop(0);
      b.x = l.x + this.loopOffset.x - d.x * LOOP_TRIGGER * 2;
      b.z = l.z + this.loopOffset.z - d.z * LOOP_TRIGGER * 2;
      b.vx = d.x * this.loopSpeed;
      b.vz = d.z * this.loopSpeed;
      return;
    }
    if (this.loopAngle >= Math.PI * 2) {
      this.leaveLoop(Math.PI * 2);
      b.x += d.x * LOOP_TRIGGER;
      b.z += d.z * LOOP_TRIGGER;
      b.vx = d.x * this.loopSpeed;
      b.vz = d.z * this.loopSpeed;
      log('loop', { event: 'exit', speed: this.loopSpeed });
      return;
    }

    loopPoint(l, this.loopAngle, this.loopAt);
    b.x = this.loopAt.x + this.loopOffset.x;
    b.y = this.loopAt.y;
    b.z = this.loopAt.z + this.loopOffset.z;
    b.vx = (b.x - fromX) / STEP;
    b.vz = (b.z - fromZ) / STEP;
    this.collectOrbs();

    const pressing = (this.loopSpeed * this.loopSpeed) / r + GRAVITY * Math.cos(this.loopAngle);
    if (pressing < 0) {
      b.vy = (b.y - fromY) / STEP;
      this.state = 'run';
      b.grounded = false;
      this.loop = null;
      log('loop', { event: 'fell', angle: this.loopAngle });
    }
  }

  private leaveLoop(angle: number): void {
    const b = this.ball;
    loopPoint(this.loop!, angle, this.loopAt);
    b.x = this.loopAt.x + this.loopOffset.x;
    b.y = this.loopAt.y;
    b.z = this.loopAt.z + this.loopOffset.z;
    b.vy = 0;
    b.grounded = true;
    this.loop = null;
    this.state = 'run';
  }

  private collectOrbs(): void {
    const b = this.ball;
    const orbs = this.course.orbs;
    for (let i = 0; i < orbs.length; i++) {
      if (this.orbTaken[i]) continue;
      const o = orbs[i];
      const dx = o.x - b.x;
      const dz = o.z - b.z;
      if (dx * dx + dz * dz > ORB_REACH * ORB_REACH || Math.abs(o.y - b.y) > 5) continue;
      this.orbTaken[i] = true;
      this.meter = Math.min(1, this.meter + ORB_VALUE);
      this.onCue?.('orb');
    }
  }

  private endFlight(): void {
    const b = this.ball;
    // A failed jump is a fall, even where it happens to come down on the course.
    if (this.flightFailed) {
      this.respawn();
      return;
    }
    // Forgot to tilt back: nothing stops it, and it bounces on past where it should have landed.
    if (this.flightOk && !this.tiltedBack) {
      this.flightOk = false;
      b.grounded = false;
      b.vy = BOUNCE_UP;
      this.onCallout?.('TILT BACK', 'bad');
      log('jump', { event: 'bounce', x: b.x, z: b.z });
      return;
    }
    if (this.flightOk) {
      this.cleanHops++;
      this.onCallout?.('LANDED', 'good');
    }
    this.state = 'run';
    const cell = this.world.cellAt(b.x, b.z);
    const dir = DIR_VEC[cell?.dir ?? 'N'];
    // Off the last pad, every clean hop in the rally comes back as speed.
    const exit = cell?.kind === 'pad' ? 0 : EXIT_SPEED + this.cleanHops * EXIT_SPEED_PER_CLEAN_HOP;
    b.vx = dir.x * exit;
    b.vz = dir.z * exit;
    log('jump', { event: 'land', x: b.x, z: b.z, exit, clean: this.flightOk });
    this.flightOk = false;
  }

  private onGround(): void {
    const cell = this.world.cellAt(this.ball.x, this.ball.z);
    if (!cell) return;
    if (cell.kind !== 'wall' && cell.section > this.section) this.section = cell.section;
    if (cell.kind === 'finish') {
      this.finish();
    } else if (cell.kind === 'pad') {
      this.openJumpWindow(cell.section);
    }
  }

  // A marble on a pad has one second to go the way the arrow points.
  private openJumpWindow(section: number): void {
    const hop = this.course.hops.get(section);
    if (!hop) return;
    this.hop = hop;
    const dx = hop.to.x - hop.from.x;
    const dz = hop.to.z - hop.from.z;
    const length = Math.hypot(dx, dz);
    this.hopDirX = dx / length;
    this.hopDirY = -dz / length;
    this.heldX = this.tiltX;
    this.heldY = this.tiltY;
    this.ball.vx = 0;
    this.ball.vz = 0;
    this.state = 'jumpWindow';
    this.windowLeft = WINDOW_SECONDS;
    this.onCue?.('catch');
    log('jump', { event: 'window', section });
  }

  private updateJumpWindow(dt: number): void {
    const hop = this.hop!;
    const pull = 1 - Math.exp(-dt * CATCH_RATE);
    this.ball.x += (hop.from.x - this.ball.x) * pull;
    this.ball.z += (hop.from.z - this.ball.z) * pull;

    if (this.isDeliberateTilt()) {
      const size = Math.hypot(this.tiltX, this.tiltY);
      const match = (this.tiltX * this.hopDirX + this.tiltY * this.hopDirY) / size;
      if (match >= DIRECTION_MATCH) this.jump();
      else this.jumpWrongWay(this.tiltX / size, -this.tiltY / size);
      return;
    }
    this.windowLeft -= dt;
    if (this.windowLeft <= 0) this.jumpTooLate();
  }

  // Over far enough, and not merely on the way back from however the phone was held on arrival.
  private isDeliberateTilt(): boolean {
    if (Math.hypot(this.tiltX, this.tiltY) < TILT_TO_ACT) return false;
    const movedX = this.tiltX - this.heldX;
    const movedY = this.tiltY - this.heldY;
    if (Math.hypot(movedX, movedY) < TILT_CHANGE_TO_ACT) return false;
    return movedX * this.tiltX + movedY * this.tiltY > 0;
  }

  private tiltsAgainstHop(): boolean {
    const size = Math.hypot(this.tiltX, this.tiltY);
    if (size < TILT_TO_ACT) return false;
    return -(this.tiltX * this.hopDirX + this.tiltY * this.hopDirY) / size >= DIRECTION_MATCH;
  }

  private jump(): void {
    const hop = this.hop!;
    this.flightOk = true;
    this.flightFailed = false;
    this.tiltedBack = false;
    this.launchTo(hop.to.x, hop.to.z);
    this.onCallout?.('JUMP', 'good');
    log('jump', { event: 'launch', result: 'ok' });
  }

  // The full distance, but the way the player tilted rather than the way to the next pad.
  private jumpWrongWay(dirX: number, dirZ: number): void {
    const hop = this.hop!;
    const distance = Math.hypot(hop.to.x - hop.from.x, hop.to.z - hop.from.z);
    this.flightOk = false;
    this.flightFailed = true;
    this.launchTo(hop.from.x + dirX * distance, hop.from.z + dirZ * distance);
    this.onCallout?.('WRONG WAY', 'bad');
    log('jump', { event: 'launch', result: 'wrong' });
  }

  private jumpTooLate(): void {
    const hop = this.hop!;
    this.flightOk = false;
    this.flightFailed = true;
    this.launchTo(hop.from.x + (hop.to.x - hop.from.x) * LATE_REACH, hop.from.z + (hop.to.z - hop.from.z) * LATE_REACH);
    this.onCallout?.('TOO LATE', 'bad');
    log('jump', { event: 'launch', result: 'late' });
  }

  private launchTo(x: number, z: number): void {
    const hop = this.hop!;
    const b = this.ball;
    b.vx = (x - b.x) / HOP_SECONDS;
    b.vz = (z - b.z) / HOP_SECONDS;
    b.vy = (hop.to.y - b.y + 0.5 * GRAVITY * HOP_SECONDS * HOP_SECONDS) / HOP_SECONDS;
    b.grounded = false;
    this.state = 'flight';
    this.accumulator = 0;
    this.onCue?.('hit');
  }

  private respawn(): void {
    const b = this.ball;
    log('fall', { x: b.x, z: b.z, section: this.section });
    this.world.restoreCrumble();
    this.placeAt(this.section);
    this.onCue?.('fall');
    // The clock keeps running: the wait is the price of falling.
    this.startCountdown(true);
  }

  private placeAt(section: number): void {
    const c = this.course.checkpoints[section];
    this.section = section;
    this.ball.placeAt(c.x, c.y, c.z);
    this.groundY = c.y;
  }

  private finish(): void {
    this.state = 'finished';
    log('run', { event: 'finish', time: this.time });
    this.onFinish?.(this.time);
  }
}

function clampUnit(v: number): number {
  return Math.max(-1, Math.min(1, v));
}

function shape(angle: number, full: number): number {
  const mag = Math.abs(angle);
  if (mag < DEADZONE) return 0;
  return Math.sign(angle) * Math.min(1, (mag - DEADZONE) / (full - DEADZONE));
}
