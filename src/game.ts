import { Course, DIR_VEC, FIRST_COURSE, type Hop } from './course';
import type { Gesture } from './jumpDetector';
import { GRAVITY, Marble } from './marble';
import type { Sensors } from './sensors';
import { log } from './telemetry';
import { World } from './world';

export type State = 'menu' | 'countdown' | 'run' | 'jumpWindow' | 'jumpLift' | 'flight' | 'finished';
export type Band = 'miss' | 'short' | 'good' | 'perfect' | 'long';
export type Cue = 'boost' | 'wall' | 'crumble' | 'orb' | 'burst' | 'catch' | 'hit' | 'land' | 'softLand' | 'tick' | 'go' | 'fall';

const DEG = Math.PI / 180;
const TILT_FULL = 22 * DEG;
const DEADZONE = 2 * DEG;

const STEP = 1 / 120;

const WINDOW_SECONDS = 4;
const CATCH_RATE = 9;
const HOP_SECONDS = 1.05;
const ARC_HEIGHT = 4.7; // apex of a hop's parabola under GRAVITY and HOP_SECONDS
const IDEAL_HIT_CM = 20;
const FOLLOW_RATE = 25;
const MIN_FALL_SECONDS = 0.3;
const HIT_GRACE_SECONDS = 0.25; // the pad's catch buzz shakes the phone; don't read that as a hit
const IGNORE_BELOW_CM = 4; // tremor, not a swing
const COUNTDOWN_SECONDS = 3;
const EXIT_SPEED = 55;
const EXIT_SPEED_PER_PERFECT = 12;

const ORB_REACH = 2.6;
const ORB_VALUE = 0.2;
const BURST_SECONDS_FULL = 2.2;

const SHORT_BELOW_CM = 13;
const PERFECT_FROM_CM = 16;
const PERFECT_TO_CM = 25;
const LONG_ABOVE_CM = 33;
const REACH: Record<Band, number> = { miss: 0.3, short: 0.55, good: 1, perfect: 1, long: 1.4 };
const LABEL: Record<Band, string> = { miss: 'MISSED', short: 'TOO SHORT', good: 'GOOD', perfect: 'PERFECT', long: 'TOO FAR' };

const FALL_DEPTH = 34;

export class Game {
  readonly course = new Course(FIRST_COURSE);
  readonly world = new World(this.course);
  readonly ball = new Marble();
  readonly orbTaken: boolean[] = this.course.orbs.map(() => false);
  meter = 0;
  state: State = 'menu';
  time = 0;
  lastBand: Band | null = null;
  lastCm = 0;
  // Tilt in -1..1 for the view's parallax; zero while the phone is being swung.
  tiltX = 0;
  tiltY = 0;

  private accumulator = 0;
  private section = 0;
  private lastGroundY = 0;
  private windowLeft = 0;
  private windowOpenedAt = 0;
  private padY = 0;
  private hop: Hop | null = null;
  private perfects = 0;
  private hitProgress = 0; // 0 on the pad, 1 at the apex: how far the hand has carried the marble
  private countdownLeft = 0;
  private countdownCostsTime = false;
  private burning = false;

  onCallout: ((text: string, tone: 'neutral' | 'count' | 'good' | 'bad') => void) | null = null;
  onCue: ((cue: Cue) => void) | null = null;
  onFinish: ((time: number) => void) | null = null;

  constructor(private sensors: Sensors) {
    sensors.jump.onGesture = (g) => this.acceptGesture(g);
    this.ball.onEvent = (e) => this.onCue?.(e);
    this.placeAt(0);
  }

  get speed(): number {
    return this.ball.speed;
  }

  begin(): void {
    this.world.reset();
    this.placeAt(0);
    this.time = 0;
    this.accumulator = 0;
    this.lastBand = null;
    this.perfects = 0;
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

  // For desktop testing without a phone.
  simulateGesture(cm: number): void {
    if (this.state === 'jumpWindow') this.launch(cm);
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

    const swinging = this.state !== 'run';
    this.tiltX = swinging ? 0 : keyX !== 0 ? keyX : clampUnit(this.sensors.steer / TILT_FULL);
    this.tiltY = swinging ? 0 : keyY !== 0 ? keyY : clampUnit(this.sensors.pitch / TILT_FULL);

    if (this.state === 'jumpWindow' || this.state === 'jumpLift') {
      this.updateJumpInput(dt);
      return;
    }

    // The arc of a hit is the player's to watch, not to steer: the phone is still moving.
    const forceX = swinging ? 0 : keyX !== 0 ? keyX : shape(this.sensors.steer);
    const forceZ = swinging ? 0 : -(keyY !== 0 ? keyY : shape(this.sensors.pitch));

    this.accumulator += dt;
    while (this.accumulator >= STEP && (this.state === 'run' || this.state === 'flight')) {
      this.step(forceX, forceZ);
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
      if (b.landedHard) this.onCue?.(this.state === 'flight' ? 'land' : 'softLand');
      if (this.state === 'flight') this.endFlight();
    }

    this.collectOrbs();

    if (this.world.isLethal(b.x, b.y, b.z)) {
      this.respawn();
      return;
    }
    if (b.grounded) {
      this.lastGroundY = b.y;
      this.onGround();
    } else if (b.y < this.lastGroundY - FALL_DEPTH) {
      this.respawn();
    }
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
    this.state = 'run';
    const cell = this.world.cellAt(b.x, b.z);
    const dir = DIR_VEC[cell?.dir ?? 'N'];
    // Off the last pad, every perfect hit in the rally comes back as speed.
    const exit = cell?.kind === 'pad' ? 0 : EXIT_SPEED + this.perfects * EXIT_SPEED_PER_PERFECT;
    b.vx = dir.x * exit;
    b.vz = dir.z * exit;
    log('jump', { event: 'land', x: b.x, z: b.z, exit });
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

  private openJumpWindow(section: number): void {
    const hop = this.course.hops.get(section);
    if (!hop) return;
    this.hop = hop;
    this.padY = this.ball.y;
    this.ball.vx = 0;
    this.ball.vz = 0;
    this.state = 'jumpWindow';
    this.windowLeft = WINDOW_SECONDS;
    this.windowOpenedAt = performance.now() / 1000 + HIT_GRACE_SECONDS;
    this.hitProgress = 0;
    this.onCallout?.('HIT', 'neutral');
    this.onCue?.('catch');
    log('jump', { event: 'window', section });
  }

  private updateJumpInput(dt: number): void {
    const hop = this.hop!;
    const detector = this.sensors.jump;
    if (detector.moving && detector.startTime >= this.windowOpenedAt) {
      this.state = 'jumpLift';
      this.followHand(hop, detector.liveCm, dt);
      return;
    }
    // The pad catches the marble and holds it until the player swings.
    const pull = 1 - Math.exp(-dt * CATCH_RATE);
    this.ball.x += (hop.from.x - this.ball.x) * pull;
    this.ball.z += (hop.from.z - this.ball.z) * pull;
    if (this.state === 'jumpWindow') {
      this.windowLeft -= dt;
      if (this.windowLeft <= 0) this.launch(0);
    }
  }

  // While the hand moves, the marble climbs the first half of the hop's arc in step with it:
  // the ideal swing distance puts it at the apex, and it only falls once the hand has stopped.
  private followHand(hop: Hop, liveCm: number, dt: number): void {
    const wanted = Math.min(1, liveCm / IDEAL_HIT_CM);
    if (wanted > this.hitProgress) {
      this.hitProgress += (wanted - this.hitProgress) * (1 - Math.exp(-dt * FOLLOW_RATE));
    }
    const p = this.hitProgress;
    const b = this.ball;
    b.x = hop.from.x + (hop.to.x - hop.from.x) * 0.5 * p;
    b.z = hop.from.z + (hop.to.z - hop.from.z) * 0.5 * p;
    b.y = this.padY + ARC_HEIGHT * (1 - (1 - p) * (1 - p));
    // Only for the camera and the marble's spin; position comes from the hand.
    b.vx = (hop.to.x - hop.from.x) / HOP_SECONDS;
    b.vz = (hop.to.z - hop.from.z) / HOP_SECONDS;
  }

  private acceptGesture(g: Gesture): void {
    if (this.state !== 'jumpLift' && this.state !== 'jumpWindow') return;
    if (g.t0 < this.windowOpenedAt) return;
    if (g.cm < IGNORE_BELOW_CM) {
      // A tremor: settle back on the pad with no penalty.
      this.state = 'jumpWindow';
      this.hitProgress = 0;
      this.ball.y = this.padY;
      this.ball.vx = 0;
      this.ball.vz = 0;
      return;
    }
    this.launch(g.cm);
  }

  private launch(cm: number): void {
    const hop = this.hop!;
    const band = bandFor(cm);
    this.lastBand = band;
    this.lastCm = cm;
    if (band === 'perfect') this.perfects++;

    // Picks up from wherever the hand carried the marble, never turning back along the arc.
    // A full swing leaves it at the apex with half the hop's time left, so it just falls.
    const b = this.ball;
    const carried = this.hitProgress * 0.5;
    const landAt = Math.max(REACH[band], carried + 0.05);
    const targetX = hop.from.x + (hop.to.x - hop.from.x) * landAt;
    const targetZ = hop.from.z + (hop.to.z - hop.from.z) * landAt;
    const remaining = Math.max(MIN_FALL_SECONDS, HOP_SECONDS * (1 - carried));
    b.vx = (targetX - b.x) / remaining;
    b.vz = (targetZ - b.z) / remaining;
    b.vy = (hop.to.y - b.y + 0.5 * GRAVITY * remaining * remaining) / remaining;

    b.grounded = false;
    this.state = 'flight';
    this.accumulator = 0;
    this.onCue?.('hit');
    this.onCallout?.(LABEL[band], band === 'perfect' || band === 'good' ? 'good' : 'bad');
    log('jump', { event: 'launch', cm, band });
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
    this.lastGroundY = c.y;
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

function shape(angle: number): number {
  const mag = Math.abs(angle);
  if (mag < DEADZONE) return 0;
  return Math.sign(angle) * Math.min(1, (mag - DEADZONE) / (TILT_FULL - DEADZONE));
}

function bandFor(cm: number): Band {
  if (cm <= 0) return 'miss';
  if (cm < SHORT_BELOW_CM) return 'short';
  if (cm > LONG_ABOVE_CM) return 'long';
  if (cm >= PERFECT_FROM_CM && cm <= PERFECT_TO_CM) return 'perfect';
  return 'good';
}
