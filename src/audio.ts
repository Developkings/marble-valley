import type { Cue } from './game';

// Every sound is synthesized, so the app carries no audio files.
const ROLL_MAX_GAIN = 0.16;
const ROLL_FULL_SPEED = 110;

export class Sound {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private rollGain: GainNode | null = null;
  private rollFilter: BiquadFilterNode | null = null;
  private noise: AudioBuffer | null = null;

  // Browsers only allow audio to start from a tap.
  unlock(): void {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    try {
      const ctx = new AudioContext();
      this.ctx = ctx;
      this.master = ctx.createGain();
      this.master.gain.value = 0.7;
      this.master.connect(ctx.destination);

      const length = ctx.sampleRate * 2;
      this.noise = ctx.createBuffer(1, length, ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;

      const roll = ctx.createBufferSource();
      roll.buffer = this.noise;
      roll.loop = true;
      this.rollFilter = ctx.createBiquadFilter();
      this.rollFilter.type = 'bandpass';
      this.rollFilter.Q.value = 0.8;
      this.rollGain = ctx.createGain();
      this.rollGain.gain.value = 0;
      roll.connect(this.rollFilter).connect(this.rollGain).connect(this.master);
      roll.start();
    } catch {
      this.ctx = null;
    }
  }

  // Rolling rumble: rises in pitch and level with speed, silent in the air.
  setRoll(speed: number, onGround: boolean): void {
    if (!this.ctx || !this.rollGain || !this.rollFilter) return;
    const k = Math.min(1, speed / ROLL_FULL_SPEED);
    const now = this.ctx.currentTime;
    this.rollGain.gain.setTargetAtTime(onGround ? k * ROLL_MAX_GAIN : 0, now, 0.05);
    this.rollFilter.frequency.setTargetAtTime(180 + k * 1500, now, 0.05);
  }

  play(cue: Cue): void {
    if (!this.ctx) return;
    switch (cue) {
      case 'boost':
        return this.sonicBoom();
      case 'burst':
        this.sonicBoom();
        return this.tone(220, 880, 0.45, 0.14, 'sawtooth');
      case 'orb':
        this.tone(880, 880, 0.08, 0.14);
        return this.tone(1320, 1320, 0.14, 0.14, 'sine', 0.07);
      case 'hit':
        return this.tone(1400, 900, 0.1, 0.3);
      case 'catch':
        return this.tone(620, 780, 0.1, 0.16);
      case 'land':
        return this.tone(160, 60, 0.22, 0.4);
      case 'softLand':
        return this.tone(110, 60, 0.12, 0.2);
      case 'wall':
        return this.tone(240, 120, 0.09, 0.22, 'square');
      case 'crumble':
        return this.burst(0.25, 500, 0.12);
      case 'tick':
        return this.tone(520, 520, 0.09, 0.16);
      case 'go':
        return this.tone(1040, 1040, 0.26, 0.2);
      case 'fall':
        return this.tone(500, 90, 0.5, 0.2);
    }
  }

  private sonicBoom(): void {
    this.tone(120, 40, 0.4, 0.5);
    this.burst(0.35, 1800, 0.3);
  }

  private tone(from: number, to: number, seconds: number, gain: number, type: OscillatorType = 'sine', delay = 0): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(from, t);
    osc.frequency.exponentialRampToValueAtTime(to, t + seconds);
    env.gain.setValueAtTime(gain, t);
    env.gain.exponentialRampToValueAtTime(0.001, t + seconds);
    osc.connect(env).connect(this.master!);
    osc.start(t);
    osc.stop(t + seconds + 0.02);
  }

  private burst(seconds: number, cutoff: number, gain: number): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(cutoff, t);
    filter.frequency.exponentialRampToValueAtTime(120, t + seconds);
    const env = ctx.createGain();
    env.gain.setValueAtTime(gain, t);
    env.gain.exponentialRampToValueAtTime(0.001, t + seconds);
    src.connect(filter).connect(env).connect(this.master!);
    src.start(t);
    src.stop(t + seconds + 0.02);
  }
}
