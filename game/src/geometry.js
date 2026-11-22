// Geometry builder: boxes, cylinders and flat quads pushed into one
// interleaved vertex array (position + normal + colour, 10 floats:
// the colour carries an alpha channel for soft shadows).
// Everything in Solmar is built from these primitives — no model files.

import { TAU } from './rng.js';

export function hexColor(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export function shade(c, f) {
  return [
    Math.min(1, c[0] * f),
    Math.min(1, c[1] * f),
    Math.min(1, c[2] * f),
  ];
}

// Rotate a point by Euler angles, applied Rz, then Rx, then Ry
// (R = Ry * Rx * Rz). Used for boxes, wheels, fronds and tracers.
function rotPoint(x, y, z, rx, ry, rz) {
  let c = Math.cos(rz);
  let s = Math.sin(rz);
  const x1 = x * c - y * s;
  const y1 = x * s + y * c;
  const z1 = z;
  c = Math.cos(rx);
  s = Math.sin(rx);
  const y2 = y1 * c - z1 * s;
  const z2 = y1 * s + z1 * c;
  const x2 = x1;
  c = Math.cos(ry);
  s = Math.sin(ry);
  return [x2 * c + z2 * s, y2, -x2 * s + z2 * c];
}

const BOX_CORNERS = [
  [-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1],
  [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1],
];
// Faces as [corner indices, outward normal]. Winding does not matter:
// face culling is off, every triangle is drawn.
const BOX_FACES = [
  { idx: [0, 4, 5, 1], n: [0, -1, 0] },
  { idx: [3, 2, 6, 7], n: [0, 1, 0] },
  { idx: [4, 7, 6, 5], n: [0, 0, 1] },
  { idx: [1, 2, 3, 0], n: [0, 0, -1] },
  { idx: [1, 5, 6, 2], n: [1, 0, 0] },
  { idx: [0, 3, 7, 4], n: [-1, 0, 0] },
];

export class Geom {
  // One preallocated buffer, grown as needed and reused every frame:
  // the dynamic batch is rebuilt 60 times a second, so it must never
  // allocate.
  constructor() {
    this.buf = new Float32Array(65536);
    this.len = 0; // floats used
    this.count = 0; // vertices
  }

  clear() {
    this.len = 0;
    this.count = 0;
  }

  vertex(x, y, z, nx, ny, nz, c) {
    if (this.len + 10 > this.buf.length) {
      const grown = new Float32Array(this.buf.length * 2);
      grown.set(this.buf);
      this.buf = grown;
    }
    const d = this.buf;
    let i = this.len;
    // Colours are [r, g, b] or [r, g, b, a]; alpha defaults to opaque.
    d[i++] = x;
    d[i++] = y;
    d[i++] = z;
    d[i++] = nx;
    d[i++] = ny;
    d[i++] = nz;
    d[i++] = c[0];
    d[i++] = c[1];
    d[i++] = c[2];
    d[i++] = c.length > 3 ? c[3] : 1;
    this.len = i;
    this.count++;
  }

  tri(a, b, c, n, color) {
    this.vertex(a[0], a[1], a[2], n[0], n[1], n[2], color);
    this.vertex(b[0], b[1], b[2], n[0], n[1], n[2], color);
    this.vertex(c[0], c[1], c[2], n[0], n[1], n[2], color);
  }

  quad(a, b, c, d, n, color) {
    this.tri(a, b, c, n, color);
    this.tri(a, c, d, n, color);
  }

  // Box centred at (cx, cy, cz) with size (sx, sy, sz), rotated by
  // Euler angles. The workhorse: buildings, cars, bodies, crates.
  box(cx, cy, cz, sx, sy, sz, color, ry = 0, rx = 0, rz = 0) {
    const hx = sx / 2;
    const hy = sy / 2;
    const hz = sz / 2;
    const pts = BOX_CORNERS.map(([x, y, z]) => {
      const p = rotPoint(x * hx, y * hy, z * hz, rx, ry, rz);
      return [p[0] + cx, p[1] + cy, p[2] + cz];
    });
    for (const face of BOX_FACES) {
      const n = rotPoint(face.n[0], face.n[1], face.n[2], rx, ry, rz);
      const [a, b, c, d] = face.idx;
      this.quad(pts[a], pts[b], pts[c], pts[d], n, color);
    }
  }

  // Flat horizontal quad at height y, facing up. Roads, dashes,
  // shadows, ground planes and beach towels are all flat quads.
  flatQuad(cx, cz, y, sx, sz, color, ry = 0) {
    const hx = sx / 2;
    const hz = sz / 2;
    const corners = [
      [-hx, -hz], [hx, -hz], [hx, hz], [-hx, hz],
    ].map(([x, z]) => {
      const p = rotPoint(x, 0, z, 0, ry, 0);
      return [p[0] + cx, y, p[2] + cz];
    });
    this.quad(corners[0], corners[1], corners[2], corners[3], [0, 1, 0], color);
  }

  // Vertical quad facing direction ry (used for windows and signs).
  // Centre (cx, cy, cz), width w along the facing direction, height h.
  wallQuad(cx, cy, cz, w, h, color, ry) {
    const hw = w / 2;
    const hh = h / 2;
    const corners = [
      [-hw, -hh, 0], [hw, -hh, 0], [hw, hh, 0], [-hw, hh, 0],
    ].map(([x, y, z]) => {
      const p = rotPoint(x, y, z, 0, ry, 0);
      return [p[0] + cx, p[1] + cy, p[2] + cz];
    });
    const n = rotPoint(0, 0, 1, 0, ry, 0);
    this.quad(corners[0], corners[1], corners[2], corners[3], n, color);
  }

  // Cylinder (or cone when rTop is 0) from y=cy up to cy+h.
  // Trunks, lamp posts, pillars, beacons, umbrella canopies.
  cylinder(cx, cy, cz, rTop, rBottom, h, seg, color, ry = 0) {
    const ring = (r, y) => {
      const pts = [];
      for (let i = 0; i < seg; i++) {
        const a = (i / seg) * TAU;
        const p = rotPoint(Math.cos(a) * r, y, Math.sin(a) * r, 0, ry, 0);
        pts.push([p[0] + cx, p[1] + cy, p[2] + cz]);
      }
      return pts;
    };
    const bot = ring(rBottom, 0);
    const top = ring(rTop, h);
    for (let i = 0; i < seg; i++) {
      const j = (i + 1) % seg;
      const am = ((i + 0.5) / seg) * TAU;
      const n = rotPoint(Math.cos(am), 0, Math.sin(am), 0, ry, 0);
      this.quad(bot[i], bot[j], top[j], top[i], n, color);
    }
    // Top cap as a fan.
    const centre = [cx, cy + h, cz];
    for (let i = 0; i < seg; i++) {
      const j = (i + 1) % seg;
      this.tri(centre, top[i], top[j], [0, 1, 0], color);
    }
  }

  // A view over the used part of the buffer — no copy, no allocation.
  toFloat32() {
    return this.buf.subarray(0, this.len);
  }
}
