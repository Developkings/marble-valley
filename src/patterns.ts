import * as THREE from 'three';
import type { BlockPattern } from './themes';

// How many blocks across one repeat of a pattern is, so the track doesn't show one tile over and over.
export const PATTERN_CELLS = 8;

const seeded = (start: number) => {
  let seed = start;
  return (): number => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
};

const grey = (level: number): string => {
  const v = Math.round(level * 255);
  return `rgb(${v},${v},${v})`;
};

function toTexture(canvas: HTMLCanvasElement, crisp: boolean): THREE.Texture {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 4;
  if (crisp) {
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    texture.generateMipmaps = false;
  }
  return texture;
}

// A soft patch of lighter or darker grey, wrapping around the edges so the repeat doesn't show.
function blotch(c: CanvasRenderingContext2D, size: number, x: number, y: number, radius: number, level: number, alpha: number): void {
  const v = Math.round(level * 255);
  for (const ox of [-size, 0, size]) {
    for (const oy of [-size, 0, size]) {
      const g = c.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, radius);
      g.addColorStop(0, `rgba(${v},${v},${v},${alpha})`);
      g.addColorStop(1, `rgba(${v},${v},${v},0)`);
      c.fillStyle = g;
      c.fillRect(x + ox - radius, y + oy - radius, radius * 2, radius * 2);
    }
  }
}

function crack(c: CanvasRenderingContext2D, rand: () => number, x: number, y: number, steps: number, reach: number): void {
  c.beginPath();
  c.moveTo(x, y);
  let angle = rand() * Math.PI * 2;
  let px = x;
  let py = y;
  for (let i = 0; i < steps; i++) {
    angle += (rand() - 0.5) * 1.6;
    px += Math.cos(angle) * reach;
    py += Math.sin(angle) * reach;
    c.lineTo(px, py);
  }
  c.stroke();
}

function specks(c: CanvasRenderingContext2D, rand: () => number, size: number, count: number, low: number, biggest: number): void {
  for (let i = 0; i < count; i++) {
    c.fillStyle = grey(low + rand() * (1 - low));
    c.fillRect(rand() * size, rand() * size, 1 + rand() * biggest, 1 + rand() * biggest);
  }
}

function drawPattern(c: CanvasRenderingContext2D, pattern: BlockPattern, size: number, tile: number, rand: () => number): void {
  if (pattern === 'plaster') {
    c.fillStyle = grey(0.95);
    c.fillRect(0, 0, size, size);
    for (let i = 0; i < 36; i++) blotch(c, size, rand() * size, rand() * size, 18 + rand() * 46, 0.78 + rand() * 0.22, 0.28);
    specks(c, rand, size, 1100, 0.84, 1.4);
    c.fillStyle = grey(0.8);
    for (let i = 0; i < size; i += tile) {
      c.fillRect(i, 0, 1, size);
      c.fillRect(0, i, size, 1);
    }
  } else if (pattern === 'bevel') {
    for (let y = 0; y < size; y += tile) {
      for (let x = 0; x < size; x += tile) {
        c.fillStyle = grey(0.82 + rand() * 0.08);
        c.fillRect(x, y, tile, tile);
        c.fillStyle = grey(1);
        c.fillRect(x, y, tile, 2);
        c.fillRect(x, y, 2, tile);
        c.fillStyle = grey(0.6);
        c.fillRect(x, y + tile - 2, tile, 2);
        c.fillRect(x + tile - 2, y, 2, tile);
        for (let i = 0; i < 3; i++) {
          c.fillStyle = grey(rand() > 0.5 ? 0.66 : 0.98);
          c.fillRect(x + 3 + Math.floor(rand() * (tile - 7)), y + 3 + Math.floor(rand() * (tile - 7)), 2, 2);
        }
      }
    }
  } else if (pattern === 'circuit') {
    for (let y = 0; y < size; y += tile) {
      for (let x = 0; x < size; x += tile) {
        c.fillStyle = grey(0.66 + rand() * 0.08);
        c.fillRect(x, y, tile, tile);
      }
    }
    c.fillStyle = grey(0.8);
    for (let i = 0; i < size; i += tile) {
      c.fillRect(i, 0, 1, size);
      c.fillRect(0, i, size, 1);
    }
    // Traces run across several blocks, turning square corners and ending in a solder point.
    c.strokeStyle = grey(1);
    c.lineWidth = 1.5;
    for (let i = 0; i < 34; i++) {
      let x = Math.floor(rand() * 32) * 8;
      let y = Math.floor(rand() * 32) * 8;
      c.beginPath();
      c.moveTo(x, y);
      for (let s = 0; s < 3; s++) {
        if (rand() > 0.5) x += (rand() > 0.5 ? 1 : -1) * (8 + Math.floor(rand() * 5) * 8);
        else y += (rand() > 0.5 ? 1 : -1) * (8 + Math.floor(rand() * 5) * 8);
        c.lineTo(x, y);
      }
      c.stroke();
      c.fillStyle = grey(1);
      c.fillRect(x - 2, y - 2, 4, 4);
    }
    for (let i = 0; i < 10; i++) {
      c.fillStyle = grey(0.28);
      c.fillRect(Math.floor(rand() * 30) * 8, Math.floor(rand() * 30) * 8, 14, 10);
    }
  } else if (pattern === 'dots') {
    c.fillStyle = grey(0.95);
    c.fillRect(0, 0, size, size);
    for (let i = 0; i < 18; i++) blotch(c, size, rand() * size, rand() * size, 20 + rand() * 30, 1, 0.3);
    const spot = tile / 2;
    for (let y = 0; y < size; y += spot) {
      for (let x = (y / spot) % 2 ? spot / 2 : 0; x < size; x += spot) {
        c.fillStyle = grey(0.86);
        c.beginPath();
        c.arc(x, y + 1, 4, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = grey(1);
        c.beginPath();
        c.arc(x, y, 4, 0, Math.PI * 2);
        c.fill();
      }
    }
    // Stitched seams, as on a quilt.
    c.fillStyle = grey(0.82);
    for (let i = 0; i < size; i += tile) {
      for (let d = 0; d < size; d += 6) {
        c.fillRect(i, d, 1, 3);
        c.fillRect(d, i, 3, 1);
      }
    }
  } else if (pattern === 'stone') {
    c.fillStyle = grey(0.46);
    c.fillRect(0, 0, size, size);
    // Courses of cut stones of different lengths, each its own shade.
    const course = tile * 0.75;
    for (let y = 0; y < size; y += course) {
      let x = -rand() * tile;
      while (x < size) {
        const w = tile * (0.7 + rand() * 0.9);
        const shade = 0.76 + rand() * 0.24;
        c.fillStyle = grey(shade);
        c.fillRect(x + 1, y + 1, w - 2, course - 2);
        c.fillStyle = grey(Math.min(1, shade + 0.12));
        c.fillRect(x + 1, y + 1, w - 2, 1);
        c.fillStyle = grey(shade - 0.14);
        c.fillRect(x + 1, y + course - 2, w - 2, 1);
        for (let i = 0; i < 7; i++) {
          c.fillStyle = grey(shade - 0.08 + rand() * 0.16);
          c.fillRect(x + 2 + rand() * (w - 6), y + 2 + rand() * (course - 6), 1 + rand() * 3, 1 + rand() * 2);
        }
        x += w;
      }
    }
  } else {
    c.fillStyle = grey(0.88);
    c.fillRect(0, 0, size, size);
    for (let i = 0; i < 10; i++) blotch(c, size, rand() * size, rand() * size, 24 + rand() * 40, 0.72, 0.45);
    specks(c, rand, size, 5200, 0.62, 1.2);
    // Patches and cracks from years of traffic.
    for (let i = 0; i < 4; i++) {
      c.fillStyle = 'rgba(70,70,70,0.22)';
      c.fillRect(rand() * size, rand() * size, 24 + rand() * 44, 16 + rand() * 30);
    }
    c.strokeStyle = grey(0.42);
    c.lineWidth = 1;
    for (let i = 0; i < 9; i++) crack(c, rand, rand() * size, rand() * size, 7, 7);
  }
}

function blockCanvas(pattern: BlockPattern): { canvas: HTMLCanvasElement; c: CanvasRenderingContext2D; size: number; tile: number } {
  const tile = pattern === 'bevel' ? 16 : 32;
  const size = tile * PATTERN_CELLS;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const c = canvas.getContext('2d')!;
  drawPattern(c, pattern, size, tile, seeded(11));
  return { canvas, c, size, tile };
}

// A stretch of track's surface in greys, multiplied over the block's own colour.
export function makeBlockPattern(pattern: BlockPattern): THREE.Texture {
  return toTexture(blockCanvas(pattern).canvas, pattern === 'bevel');
}

// The same surface, cracked on every block: track that won't hold for long.
export function makeCrumblePattern(pattern: BlockPattern): THREE.Texture {
  const { canvas, c, size, tile } = blockCanvas(pattern);
  const rand = seeded(29);
  c.strokeStyle = grey(0.18);
  c.lineWidth = pattern === 'bevel' ? 1 : 2;
  for (let y = 0; y < size; y += tile) {
    for (let x = 0; x < size; x += tile) {
      for (let i = 0; i < 2; i++) crack(c, rand, x + tile / 2, y + tile / 2, 4, tile * 0.2);
    }
  }
  return toTexture(canvas, pattern === 'bevel');
}

// Rows of windows, some lit, for the sides of buildings.
export function makeWindows(): THREE.Texture {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const c = canvas.getContext('2d')!;
  const rand = seeded(23);
  c.fillStyle = grey(0.75);
  c.fillRect(0, 0, size, size);
  for (let y = 3; y < size; y += 8) {
    for (let x = 3; x < size; x += 8) {
      c.fillStyle = rand() > 0.6 ? '#ffe9a8' : grey(0.35);
      c.fillRect(x, y, 4, 5);
    }
  }
  const texture = toTexture(canvas, false);
  texture.repeat.set(1, 3);
  return texture;
}
