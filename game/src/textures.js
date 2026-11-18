// Procedural textures for Solmar: every facade, road and sign is drawn on an
// offscreen canvas, so the game ships no image assets at all. All textures are
// generated once at boot from the city's seeded RNG.
import * as THREE from 'three';
import { Rng } from './rng.js';

/** Make a canvas of the given size and return [canvas, ctx]. */
function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

/** Wrap a canvas as a three.js texture with sRGB colours. */
function toTexture(canvas, repeatX = 1, repeatY = 1) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.anisotropy = 4;
  return tex;
}

/** Sun-soaked pastel palette for the city's buildings. */
export const FACADE_COLORS = [
  '#f2e3c9', '#e8c9a0', '#d9a679', '#c97e5a', '#f5d9d0',
  '#a8c8c0', '#7fb3b0', '#e9b44c', '#d96c4f', '#b8a88a',
  '#f0ede4', '#c9d6c5', '#e5b8a0', '#9db8c9',
];

/**
 * A building facade: base colour, rows of windows (some lit, some dark),
 * a ground-floor shopfront band. `floors` rows, `cols` window columns.
 */
export function facadeTexture(rng, base, floors, cols) {
  const [c, ctx] = makeCanvas(128, 256);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 128, 256);
  // Subtle vertical shading so flat walls read as sunlit.
  const grad = ctx.createLinearGradient(0, 0, 128, 0);
  grad.addColorStop(0, 'rgba(255,255,255,0.10)');
  grad.addColorStop(0.5, 'rgba(255,255,255,0)');
  grad.addColorStop(1, 'rgba(0,0,0,0.12)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 256);
  const winW = 128 / cols;
  const winH = 200 / floors;
  for (let f = 0; f < floors; f++) {
    for (let col = 0; col < cols; col++) {
      const x = col * winW + winW * 0.22;
      const y = 14 + f * winH + winH * 0.18;
      const w = winW * 0.56;
      const h = winH * 0.58;
      const lit = rng.chance(0.28);
      ctx.fillStyle = lit ? '#ffe9a8' : '#2e4a5e';
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.fillRect(x, y, w, h * 0.28);
      ctx.strokeStyle = 'rgba(0,0,0,0.25)';
      ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    }
  }
  // Ground floor: shopfront band with awning stripes.
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.fillRect(0, 214, 128, 42);
  ctx.fillStyle = rng.pick(['#d95f43', '#2e7f86', '#e9b44c', '#7a5ea8']);
  for (let x = 0; x < 128; x += 16) ctx.fillRect(x, 214, 8, 10);
  ctx.fillStyle = '#1d2b36';
  ctx.fillRect(10, 228, 108, 22);
  ctx.fillStyle = '#cfe8ef';
  ctx.fillRect(14, 232, 100, 14);
  // A doorway at the right end of the shopfront.
  ctx.fillStyle = '#1d2b36';
  ctx.fillRect(104, 222, 14, 34);
  ctx.fillStyle = 'rgba(255,233,168,0.85)';
  ctx.fillRect(106, 224, 10, 30);
  return toTexture(c);
}

/** A flat roof texture: concrete with vents and a water tank hint. */
export function roofTexture(rng) {
  const [c, ctx] = makeCanvas(128, 128);
  ctx.fillStyle = rng.pick(['#8a7f74', '#7d7468', '#94897c']);
  ctx.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 40; i++) {
    ctx.fillStyle = rng.chance(0.5) ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.06)';
    ctx.fillRect(rng.int(0, 120), rng.int(0, 120), rng.int(4, 18), rng.int(4, 18));
  }
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(20, 20, 26, 18);
  ctx.fillRect(84, 70, 22, 22);
  ctx.fillStyle = 'rgba(255,255,255,0.15)';
  ctx.fillRect(22, 22, 22, 3);
  return toTexture(c);
}

/**
 * The ground texture for one city tile: asphalt roads with centre dashes and
 * edge lines, concrete sidewalks, and block interiors left to the buildings.
 * One 512px tile covers a 60-unit pitch and repeats across the city.
 */
export function groundTexture() {
  const [c, ctx] = makeCanvas(512, 512);
  // Block interior (mostly hidden under buildings): pale concrete.
  ctx.fillStyle = '#b9ac93';
  ctx.fillRect(0, 0, 512, 512);
  // Sidewalk ring.
  ctx.fillStyle = '#cfc4ab';
  ctx.fillRect(0, 0, 512, 512);
  ctx.fillStyle = '#b9ac93';
  ctx.fillRect(40, 40, 432, 432);
  // Asphalt cross: roads run along the tile edges (16 of 60 units).
  ctx.fillStyle = '#3a3f45';
  ctx.fillRect(0, 0, 512, 68);
  ctx.fillRect(0, 444, 512, 68);
  ctx.fillRect(0, 0, 68, 512);
  ctx.fillRect(444, 0, 68, 512);
  // Asphalt speckle.
  const rng = new Rng(7);
  for (let i = 0; i < 500; i++) {
    ctx.fillStyle = rng.chance(0.5) ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.10)';
    ctx.fillRect(rng.int(0, 511), rng.int(0, 67), 2, 2);
    ctx.fillRect(rng.int(0, 511), 444 + rng.int(0, 67), 2, 2);
    ctx.fillRect(rng.int(0, 67), rng.int(0, 511), 2, 2);
    ctx.fillRect(444 + rng.int(0, 67), rng.int(0, 511), 2, 2);
  }
  // Centre dashes (yellow) and edge lines (white).
  ctx.fillStyle = '#e8c33a';
  for (let x = 8; x < 512; x += 32) {
    ctx.fillRect(x, 32, 18, 4);
    ctx.fillRect(x, 476, 18, 4);
    ctx.fillRect(32, x, 4, 18);
    ctx.fillRect(476, x, 4, 18);
  }
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.fillRect(0, 64, 512, 3);
  ctx.fillRect(0, 445, 512, 3);
  ctx.fillRect(64, 0, 3, 512);
  ctx.fillRect(445, 0, 3, 512);
  // Crosswalk stripes at the corners.
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  for (let i = 0; i < 6; i++) {
    ctx.fillRect(76 + i * 10, 8, 5, 52);
    ctx.fillRect(76 + i * 10, 452, 5, 52);
    ctx.fillRect(8, 76 + i * 10, 52, 5);
    ctx.fillRect(452, 76 + i * 10, 52, 5);
  }
  return toTexture(c);
}

/** Beach sand with soft ripples. */
export function sandTexture() {
  const [c, ctx] = makeCanvas(256, 256);
  ctx.fillStyle = '#e8d5a3';
  ctx.fillRect(0, 0, 256, 256);
  const rng = new Rng(21);
  for (let i = 0; i < 900; i++) {
    ctx.fillStyle = rng.chance(0.5) ? 'rgba(180,150,90,0.25)' : 'rgba(255,245,210,0.30)';
    ctx.fillRect(rng.int(0, 255), rng.int(0, 255), 2, 2);
  }
  ctx.strokeStyle = 'rgba(180,150,90,0.20)';
  for (let y = 10; y < 256; y += 22) {
    ctx.beginPath();
    for (let x = 0; x <= 256; x += 16) ctx.lineTo(x, y + Math.sin(x * 0.05 + y) * 3);
    ctx.stroke();
  }
  return toTexture(c, 6, 6);
}

/** A neon shop sign texture with the given text (drawn, never an image). */
export function signTexture(text, bg, fg) {
  const [c, ctx] = makeCanvas(256, 64);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 256, 64);
  ctx.strokeStyle = fg;
  ctx.lineWidth = 3;
  ctx.strokeRect(4, 4, 248, 56);
  ctx.fillStyle = fg;
  ctx.font = 'bold 26px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 128, 34);
  return toTexture(c);
}
