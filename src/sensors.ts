import { log } from './telemetry';

const GRAVITY_SMOOTHING = 0.25;
const FALLBACK_SMOOTHING = 0.08;
const NEUTRAL_RATE = 3;
const MIN_FUSED_GRAVITY = 5; // m/s2: real gravity is 9.8

// Reads devicemotion. Device axes in portrait: x right, y towards the top edge, z out of the screen.
export class Sensors {
  active = false;
  hasLinear = false;
  hz = 0;
  // Radians relative to the neutral pose. Positive steer = right side down, positive pitch = top edge away.
  steer = 0;
  pitch = 0;

  private gx = 0;
  private gy = 0;
  private gz = 9.81;
  private neutralSteer = 0;
  private neutralPitch = 0;
  private seeded = false;
  private count = 0;
  private windowStart = 0;

  start(): void {
    addEventListener('devicemotion', this.onMotion);
  }

  calibrate(): void {
    this.neutralSteer = this.rawSteer();
    this.neutralPitch = this.rawPitch();
    log('calibrate', { steer: this.neutralSteer, pitch: this.neutralPitch });
  }

  // Eases neutral towards the current pose, so a brief wobble doesn't become the new centre.
  trackNeutral(dt: number): void {
    const ease = 1 - Math.exp(-dt * NEUTRAL_RATE);
    this.neutralSteer += (this.rawSteer() - this.neutralSteer) * ease;
    this.neutralPitch += (this.rawPitch() - this.neutralPitch) * ease;
    this.steer = this.rawSteer() - this.neutralSteer;
    this.pitch = this.rawPitch() - this.neutralPitch;
  }

  private rawSteer(): number {
    const n = Math.hypot(this.gx, this.gy, this.gz) || 1;
    return Math.asin(Math.max(-1, Math.min(1, -this.gx / n)));
  }

  private rawPitch(): number {
    return -Math.atan2(this.gy, this.gz);
  }

  private onMotion = (e: DeviceMotionEvent): void => {
    const incl = e.accelerationIncludingGravity;
    if (!incl || incl.x === null || incl.y === null || incl.z === null) return;
    this.active = true;

    const lin = e.acceleration;
    this.hasLinear = !!lin && lin.x !== null && lin.y !== null && lin.z !== null;
    // Some phones' fused sensor spells of reporting everything as motion, leaving no gravity. Filter the raw signal then.
    if (this.hasLinear && Math.hypot(incl.x - lin!.x!, incl.y - lin!.y!, incl.z - lin!.z!) < MIN_FUSED_GRAVITY) this.hasLinear = false;
    const lx = this.hasLinear ? lin!.x! : 0;
    const ly = this.hasLinear ? lin!.y! : 0;
    const lz = this.hasLinear ? lin!.z! : 0;

    // With a fused linear sensor gravity is the difference; otherwise low-pass the raw signal.
    const alpha = this.hasLinear ? GRAVITY_SMOOTHING : FALLBACK_SMOOTHING;
    const tx = incl.x - lx;
    const ty = incl.y - ly;
    const tz = incl.z - lz;
    if (!this.seeded) {
      this.gx = tx;
      this.gy = ty;
      this.gz = tz;
      this.seeded = true;
    } else {
      this.gx += (tx - this.gx) * alpha;
      this.gy += (ty - this.gy) * alpha;
      this.gz += (tz - this.gz) * alpha;
    }

    this.steer = this.rawSteer() - this.neutralSteer;
    this.pitch = this.rawPitch() - this.neutralPitch;

    const now = performance.now();
    this.count++;
    if (now - this.windowStart >= 1000) {
      this.hz = (this.count * 1000) / (now - this.windowStart);
      this.count = 0;
      this.windowStart = now;
    }

    log('m', {
      i: e.interval,
      g: [round(this.gx), round(this.gy), round(this.gz)],
    });
  };
}

function round(v: number): number {
  return Math.round(v * 1000) / 1000;
}
