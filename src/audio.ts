import type { Cue } from './game';

// Every sound effect is synthesized; the only audio file is the world's music.
const SOUNDS_GAIN = 0.7;
const ROLL_MAX_GAIN = 0.16;
const ROLL_FULL_SPEED = 110;

export class Sound {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private rollGain: GainNode | null = null;
  private rollFilter: BiquadFilterNode | null = null;
  private noise: AudioBuffer | null = null;
  private music: HTMLAudioElement;
  private soundsVolume = 1;
  private musicOn = true;

  constructor(musicFile: string) {
    this.music = new Audio(musicFile);
    this.music.loop = true;
  }

  // Both from 0 to 1.
  setVolumes(music: number, sounds: number): void {
    this.music.volume = music;
    this.soundsVolume = sounds;
    if (this.master) this.master.gain.value = SOUNDS_GAIN * sounds;
  }

  // The app may be out of sight but still alive, and must go quiet with it.
  setHidden(hidden: boolean): void {
    if (hidden) {
      this.music.pause();
      void this.ctx?.suspend();
    } else if (this.ctx) {
      void this.ctx.resume();
      this.playMusic();
    }
  }

  private playMusic(): void {
    if (!this.musicOn) return;
    // Missing or blocked music only means a quieter game.
    this.music.play().catch(() => {});
  }

  setMusicOn(on: boolean): void {
    this.musicOn = on;
    if (!on) this.music.pause();
    else if (this.ctx) this.playMusic();
  }

  // Swaps the track. False if audio is already unlocked and this file won't play.
  async setMusic(src: string): Promise<boolean> {
    this.music.pause();
    this.music.src = src;
    if (!this.ctx || !this.musicOn) return true;
    try {
      await this.music.play();
      return true;
    } catch {
      return false;
    }
  }

  // Browsers only allow audio to start from a tap.
  unlock(): void {
    if (this.music.paused) this.playMusic();
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    try {
      const ctx = new AudioContext();
      this.ctx = ctx;
      this.master = ctx.createGain();
      this.master.gain.value = SOUNDS_GAIN * this.soundsVolume;
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
      case 'launch':
        return this.tone(260, 1100, 0.35, 0.22);
      case 'loop':
        return this.tone(330, 660, 0.7, 0.14, 'triangle');
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
