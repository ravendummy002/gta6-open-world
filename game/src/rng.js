// Seeded randomness and small numeric helpers for Solmar.
// The whole city is generated from one fixed seed, so every run of the
// game builds the same streets, buildings and palm rows.

export const TAU = Math.PI * 2;

// mulberry32: a tiny deterministic PRNG. Same seed, same stream, every run.
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

// Deterministic 0..1 value for a pair of integer coordinates (block ids).
// Lets any system ask "what is true of block (i, j)" without stored state.
export function hash2(x, z, salt = 0) {
  let h = (x * 374761393 + z * 668265263 + salt * 974634211) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

// Frame-rate independent damping factor: how far a value moves toward
// its target in dt seconds at the given rate. Unlike a raw dt * rate
// clamp it behaves the same at 30 fps and at 144 fps.
export function dampFactor(rate, dt) {
  return 1 - Math.exp(-rate * dt);
}

export function randRange(rng, lo, hi) {
  return lo + rng() * (hi - lo);
}

export function randInt(rng, lo, hi) {
  return Math.floor(randRange(rng, lo, hi + 1));
}

export function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

// Shortest signed difference from angle a to angle b, in (-PI, PI].
export function angleDiff(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

// Interpolate between two headings along the shortest arc.
export function angleLerp(a, b, t) {
  return a + angleDiff(a, b) * t;
}

export function dist2(ax, az, bx, bz) {
  const dx = ax - bx;
  const dz = az - bz;
  return dx * dx + dz * dz;
}

export function dist(ax, az, bx, bz) {
  return Math.sqrt(dist2(ax, az, bx, bz));
}
