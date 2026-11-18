// Seeded random helpers for Solmar: one deterministic stream drives the whole
// city layout, so the same seed always builds the same streets, buildings and
// traffic. Gameplay randomness (pedestrian wander, traffic respawns) uses a
// separate live stream seeded from the clock.

/** mulberry32: a small fast seeded PRNG. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A small random toolkit wrapped around one stream. */
export class Rng {
  constructor(seed) {
    this.next = mulberry32(seed);
  }
  /** Float in [0, 1). */
  f() {
    return this.next();
  }
  /** Float in [min, max). */
  range(min, max) {
    return min + (max - min) * this.next();
  }
  /** Integer in [min, max] inclusive. */
  int(min, max) {
    return min + Math.floor(this.next() * (max - min + 1));
  }
  /** Pick one element of an array. */
  pick(list) {
    return list[Math.floor(this.next() * list.length)];
  }
  /** A shuffled copy of an array (Fisher–Yates on this stream). */
  shuffle(list) {
    const out = [...list];
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }
  /** True with probability p. */
  chance(p) {
    return this.next() < p;
  }
  /** A random angle in radians. */
  angle() {
    return this.next() * Math.PI * 2;
  }
}

/** Clamp a value into [min, max]. */
export function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v;
}

/** Linear interpolation. */
export function lerp(a, b, t) {
  return a + (b - a) * t;
}

/** Shortest signed angular difference from a to b, in radians. */
export function angleDiff(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** Distance between two points on the XZ plane. */
export function dist2D(ax, az, bx, bz) {
  const dx = bx - ax;
  const dz = bz - az;
  return Math.sqrt(dx * dx + dz * dz);
}
