export type BlockPattern = 'plaster' | 'bevel' | 'circuit' | 'dots' | 'stone' | 'asphalt';
export type BackShape = 'tower' | 'building' | 'round' | 'castle';
export type BallExtra = 'none' | 'neonRing' | 'kittyFace' | 'spear' | 'skateboard';

export interface BallTheme {
  // Radial gradient stops for the matcap, highlight first.
  stops: [string, string, string, string];
  extra: BallExtra;
  neon?: [string, string]; // the ball's colour glides between these
  trail?: string;
}

// Everything a skin can change. Adding a skin means adding data here, not touching the renderer.
// All of it is drawn by the game itself. A theme's music is the file public/music/<id>.mp3, if there is one.
export interface WorldTheme {
  id: string;
  name: string;
  sky: string;
  jumpSpace: string;
  backInJumpSpace: string;
  // A small palette: the track's surface, what stands up from it, and what the player must react to.
  floor: string;
  wall: string;
  accent: string;
  sideTint: [number, number, number]; // block sides against their tops
  pattern: BlockPattern;
  back: string[];
  backShape: BackShape;
  front: string;
  streak: string;
  shadow: string;
  lightSky: string;
  lightGround: string;
  sun: string;
  laser: string;
  pixelWidth?: number; // renders this few pixels across and scales them up
  ball: BallTheme;
  ui: { font: string; ink: string; paper: string; page: string; pressed: string };
}

export const VALLEY: WorldTheme = {
  id: 'valley',
  name: 'Valley',
  sky: '#f3d9c9',
  jumpSpace: '#1b1247',
  backInJumpSpace: '#2c2160',
  floor: '#f7e8d8',
  wall: '#8f7fa8',
  accent: '#e8795a',
  sideTint: [0.86, 0.68, 0.72],
  pattern: 'plaster',
  back: ['#ecc8b8', '#e7bfb0', '#e2b8aa', '#ddb2a4'],
  backShape: 'tower',
  front: '#ffffff',
  streak: '#ffffff',
  shadow: '#4a3b52',
  lightSky: '#fff6ee',
  lightGround: '#c99aa8',
  sun: '#fff0dc',
  laser: '#ff3b5c',
  ball: { stops: ['#ffffff', '#cfd6e6', '#5e6480', '#1d1a2e'], extra: 'none' },
  ui: { font: "Georgia, 'Times New Roman', serif", ink: '#4a3b52', paper: '#fff8f0', page: '#f3d9c9', pressed: '#e8a48f' },
};

// 16-bit platformer feel: bright sky, green hills, chunky pixels.
const PIXEL_HILLS: WorldTheme = {
  id: 'pixel-hills',
  name: '16-bit Hills',
  sky: '#4fa8f0',
  jumpSpace: '#101a6b',
  backInJumpSpace: '#27348f',
  floor: '#58c838',
  wall: '#785028',
  accent: '#f8d830',
  sideTint: [0.62, 0.45, 0.3],
  pattern: 'bevel',
  back: ['#38b048', '#44bc50', '#50c458', '#2c9c40'],
  backShape: 'round',
  front: '#ffffff',
  streak: '#ffffff',
  shadow: '#102040',
  lightSky: '#ffffff',
  lightGround: '#a0c0e0',
  sun: '#fff8e0',
  laser: '#ff2040',
  pixelWidth: 270,
  ball: { stops: ['#ffffff', '#ff9090', '#d82020', '#600808'], extra: 'none', trail: '#ffe040' },
  ui: { font: "'Courier New', monospace", ink: '#102060', paper: '#fff8d0', page: '#4fa8f0', pressed: '#ffe040' },
};

const NEON_CITY: WorldTheme = {
  id: 'neon-city',
  name: 'Cyberpunk',
  sky: '#04020c',
  jumpSpace: '#000000',
  backInJumpSpace: '#0a0620',
  floor: '#8f85ff',
  wall: '#00d0f0',
  accent: '#ff2bd6',
  sideTint: [0.3, 0.25, 0.55],
  pattern: 'circuit',
  back: ['#140f38', '#181242', '#100c2e', '#1c164c'],
  backShape: 'building',
  front: '#7fe9ff',
  streak: '#00e5ff',
  shadow: '#000000',
  lightSky: '#b0b0ff',
  lightGround: '#502080',
  sun: '#ff90ff',
  laser: '#ff0040',
  ball: { stops: ['#ffffff', '#f0f0f0', '#909090', '#303030'], extra: 'neonRing', neon: ['#00f0ff', '#ff2bd6'], trail: '#00f0ff' },
  ui: { font: 'Consolas, Menlo, monospace', ink: '#d0f8ff', paper: 'rgba(20, 10, 50, 0.85)', page: '#0a0618', pressed: '#ff2bd6' },
};

const SUGAR_CLOUD: WorldTheme = {
  id: 'sugar-cloud',
  name: 'Kawaii',
  sky: '#ffe3f1',
  jumpSpace: '#a56fd0',
  backInJumpSpace: '#c99ae0',
  floor: '#fff0f7',
  wall: '#c7a5f0',
  accent: '#ff9ec7',
  sideTint: [0.95, 0.75, 0.88],
  pattern: 'dots',
  back: ['#ffffff', '#fff6fa', '#fff0f7', '#ffe9f4'],
  backShape: 'round',
  front: '#ffffff',
  streak: '#ffffff',
  shadow: '#b06a9c',
  lightSky: '#ffffff',
  lightGround: '#ffd0e8',
  sun: '#fff4f8',
  laser: '#ff5f92',
  ball: { stops: ['#ffffff', '#ffe0ee', '#ffa8cc', '#e070a4'], extra: 'kittyFace', trail: '#ffb8d8' },
  ui: { font: "'Comic Sans MS', 'Segoe Print', cursive", ink: '#8a4a7a', paper: '#fffafd', page: '#ffe3f1', pressed: '#ffb8d8' },
};

const OLD_KINGDOM: WorldTheme = {
  id: 'old-kingdom',
  name: 'Medieval',
  sky: '#9fb4a8',
  jumpSpace: '#1c1a2e',
  backInJumpSpace: '#2c2a40',
  floor: '#bdb29c',
  wall: '#5f5a54',
  accent: '#b8862c',
  sideTint: [0.62, 0.6, 0.56],
  pattern: 'stone',
  back: ['#6b6f63', '#75796c', '#61655a', '#7e8275'],
  backShape: 'castle',
  front: '#e8e4d8',
  streak: '#efe6d0',
  shadow: '#2e2618',
  lightSky: '#fff4e0',
  lightGround: '#7a8a70',
  sun: '#ffe8c0',
  laser: '#ff6a20',
  ball: { stops: ['#ffffff', '#c8ccd0', '#6c7278', '#23262a'], extra: 'spear' },
  ui: { font: "'Palatino Linotype', Palatino, Georgia, serif", ink: '#2e2618', paper: '#e8dcc0', page: '#b9a98a', pressed: '#d4a93a' },
};

const STREET: WorldTheme = {
  id: 'street',
  name: 'Urban Street',
  sky: '#7c8894',
  jumpSpace: '#1a1d24',
  backInJumpSpace: '#2a2e38',
  floor: '#5e6167',
  wall: '#2b2d32',
  accent: '#e3bb2f',
  sideTint: [0.5, 0.5, 0.52],
  pattern: 'asphalt',
  back: ['#3b3f47', '#454952', '#2f333a', '#50545d'],
  backShape: 'building',
  front: '#c8ccd2',
  streak: '#f0f0f0',
  shadow: '#101114',
  lightSky: '#f0f2f8',
  lightGround: '#50545c',
  sun: '#ffe6c8',
  laser: '#ff2b2b',
  ball: { stops: ['#ffe0c0', '#ff9a48', '#d8641c', '#6c2c08'], extra: 'skateboard' },
  ui: { font: "'Arial Black', Impact, sans-serif", ink: '#f4f4f4', paper: 'rgba(30, 32, 38, 0.85)', page: '#2b2d32', pressed: '#ff6a2b' },
};

export const THEMES: WorldTheme[] = [VALLEY, PIXEL_HILLS, NEON_CITY, SUGAR_CLOUD, OLD_KINGDOM, STREET];

export function themeById(id: string): WorldTheme {
  return THEMES.find((t) => t.id === id) ?? VALLEY;
}
