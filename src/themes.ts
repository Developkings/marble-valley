import type { Kind } from './course';

// Everything a skin can change. Adding a skin means adding data here, not touching the renderer.
export interface WorldTheme {
  id: string;
  sky: string;
  jumpSpace: string;
  backInJumpSpace: string;
  tones: Record<Kind, [string, string]>;
  back: string[];
  lightSky: string;
  lightGround: string;
  sun: string;
  piston: string;
  laser: string;
  magnet: string;
  orb: string;
  loop: string;
  music: string; // file under public/music, credited on the Attribution page
}

export interface BallTheme {
  id: string;
  // Radial gradient stops for the matcap, highlight first.
  stops: [string, string, string, string];
}

export const VALLEY: WorldTheme = {
  id: 'valley',
  sky: '#f3d9c9',
  jumpSpace: '#1b1247',
  backInJumpSpace: '#2c2160',
  tones: {
    plain: ['#fff3e4', '#f7e3d3'],
    ramp: ['#f6d2c4', '#efc5b9'],
    boost: ['#59d6a0', '#3fc48c'],
    fast: ['#fff6ea', '#ee8f76'],
    maze: ['#e6dcec', '#dcd0e6'],
    pad: ['#f9c74f', '#f4a93d'],
    wall: ['#8f7fa8', '#83739c'],
    finish: ['#ffffff', '#4a3b52'],
    crumble: ['#efe0a8', '#e4d292'],
    launch: ['#ff9e7d', '#f58a68'],
  },
  back: ['#ecc8b8', '#e7bdb3', '#e2c5d2', '#d6d2e0'],
  lightSky: '#fff6ee',
  lightGround: '#c99aa8',
  sun: '#fff0dc',
  piston: '#5d4f78',
  laser: '#ff3b5c',
  magnet: '#6fb7ff',
  orb: '#39c6ff',
  loop: '#8f7fa8',
  music: 'music/adagio-for-strings-kinda.mp3',
};

export const JOY_BALL: BallTheme = {
  id: 'joy',
  stops: ['#ffffff', '#cfd6e6', '#5e6480', '#1d1a2e'],
};
