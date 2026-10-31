import { log } from './telemetry';

export interface Gesture {
  t0: number;
  duration: number;
  activeSeconds: number; // time the hand was really pushing or stopping, without the settling tail
  peakAccel: number;
  integratedCm: number; // double integration of the 3D motion, velocity forced to zero at the end
  modelCm: number; // peak acceleration and active time, assuming a smooth push-and-stop
  cm: number; // the two estimates combined: distance moved in any direction
  dirX: number; // unit direction in phone axes: x right, y top edge, z out of the screen
  dirY: number;
  dirZ: number;
}

const START_ACCEL = 1.2;
const START_SAMPLES = 2;
const REST_ACCEL = 0.9;
const REST_SECONDS = 0.08;
const MIN_SECONDS = 0.12;
const MAX_SECONDS = 1.2;
const PRE_ROLL = 3;
const BIAS_SMOOTHING = 0.02;
const ACTIVE_FRACTION = 0.25;

interface Sample {
  t: number;
  x: number;
  y: number;
  z: number;
}

const magnitude = (s: Sample): number => Math.hypot(s.x, s.y, s.z);

// Measures one short start-move-stop gesture in whatever direction the hand goes.
export class JumpDetector {
  moving = false;
  startTime = 0;
  liveCm = 0;
  onGesture: ((g: Gesture) => void) | null = null;

  private biasX = 0;
  private biasY = 0;
  private biasZ = 0;
  private over = 0;
  private restSince = -1;
  private history: Sample[] = [];
  private samples: Sample[] = [];
  private vx = 0;
  private vy = 0;
  private vz = 0;
  private px = 0;
  private py = 0;
  private pz = 0;

  feed(t: number, ax: number, ay: number, az: number): void {
    const sample = { t, x: ax - this.biasX, y: ay - this.biasY, z: az - this.biasZ };
    const size = magnitude(sample);

    if (!this.moving) {
      this.over = size > START_ACCEL ? this.over + 1 : 0;
      if (this.over >= START_SAMPLES) {
        this.begin(sample);
        return;
      }
      this.biasX += (ax - this.biasX) * BIAS_SMOOTHING;
      this.biasY += (ay - this.biasY) * BIAS_SMOOTHING;
      this.biasZ += (az - this.biasZ) * BIAS_SMOOTHING;
      this.history.push(sample);
      if (this.history.length > PRE_ROLL + START_SAMPLES) this.history.shift();
      return;
    }

    this.integrate(this.samples[this.samples.length - 1], sample);
    this.samples.push(sample);

    const elapsed = t - this.startTime;
    if (size < REST_ACCEL) {
      if (this.restSince < 0) this.restSince = t;
    } else {
      this.restSince = -1;
    }
    const rested = this.restSince >= 0 && t - this.restSince >= REST_SECONDS && elapsed >= MIN_SECONDS;
    if (rested || elapsed >= MAX_SECONDS) this.finish();
  }

  private integrate(a: Sample, b: Sample): void {
    const dt = b.t - a.t;
    this.vx += ((a.x + b.x) / 2) * dt;
    this.vy += ((a.y + b.y) / 2) * dt;
    this.vz += ((a.z + b.z) / 2) * dt;
    this.px += this.vx * dt;
    this.py += this.vy * dt;
    this.pz += this.vz * dt;
    this.liveCm = Math.hypot(this.px, this.py, this.pz) * 100;
  }

  private begin(sample: Sample): void {
    this.moving = true;
    this.samples = [...this.history, sample];
    this.history = [];
    this.startTime = this.samples[0].t;
    this.restSince = -1;
    this.over = 0;
    this.vx = this.vy = this.vz = 0;
    this.px = this.py = this.pz = 0;
    this.liveCm = 0;
    for (let i = 1; i < this.samples.length; i++) this.integrate(this.samples[i - 1], this.samples[i]);
  }

  private finish(): void {
    this.moving = false;
    const s = this.samples;
    const t0 = s[0].t;
    const duration = s[s.length - 1].t - t0;

    const dx = correctedDistance(s, 'x', duration);
    const dy = correctedDistance(s, 'y', duration);
    const dz = correctedDistance(s, 'z', duration);
    const integrated = Math.hypot(dx, dy, dz);

    let peak = 0;
    for (const sample of s) peak = Math.max(peak, magnitude(sample));
    let first = 0;
    let last = s.length - 1;
    while (first < last && magnitude(s[first]) < peak * ACTIVE_FRACTION) first++;
    while (last > first && magnitude(s[last]) < peak * ACTIVE_FRACTION) last--;
    // Timing starts above a fraction of the peak, which clips both ends of the push; add them back.
    const active = (s[last].t - s[first].t) / (1 - Math.asin(ACTIVE_FRACTION) / Math.PI);
    // A sine-shaped push and stop of length T and peak A covers A * T^2 / (2 * pi).
    const model = (peak * active * active) / (2 * Math.PI);

    const gesture: Gesture = {
      t0,
      duration,
      activeSeconds: active,
      peakAccel: peak,
      integratedCm: integrated * 100,
      modelCm: model * 100,
      cm: ((integrated + model) / 2) * 100,
      dirX: dx / (integrated || 1),
      dirY: dy / (integrated || 1),
      dirZ: dz / (integrated || 1),
    };
    log('gesture', { ...gesture, n: s.length });
    this.samples = [];
    this.liveCm = 0;
    this.onGesture?.(gesture);
  }
}

// The phone is at rest at both ends, so velocity left over at the end is sensor error.
function correctedDistance(s: Sample[], axis: 'x' | 'y' | 'z', duration: number): number {
  const t0 = s[0].t;
  let v = 0;
  const velocities = [0];
  for (let i = 1; i < s.length; i++) {
    v += ((s[i - 1][axis] + s[i][axis]) / 2) * (s[i].t - s[i - 1].t);
    velocities.push(v);
  }
  const fixed = (i: number): number => velocities[i] - (v * (s[i].t - t0)) / (duration || 1);
  let distance = 0;
  for (let i = 1; i < s.length; i++) distance += ((fixed(i - 1) + fixed(i)) / 2) * (s[i].t - s[i - 1].t);
  return distance;
}
