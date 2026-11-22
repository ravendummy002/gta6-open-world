// Pedestrians: people walking the pavements, fleeing from danger,
// and getting knocked down. The same body builder draws the player,
// the police on foot and the mission goons.

import { hexColor, shade } from './geometry.js';
import { angleLerp, clamp, pick, randRange, TAU } from './rng.js';
import { STREET_LINES } from './city.js';

const SHIRTS = ['#e74c3c', '#3498db', '#f1c40f', '#9b59b6', '#1abc9c', '#e67e22', '#ecf0f1', '#fd79a8', '#00cec9', '#fdcb6e'];
const PANTS = ['#2c3e50', '#34495e', '#7f8c8d', '#5d4037', '#1a252f', '#6c7a89'];
const SKINS = ['#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#ffdbac'];
const HAIRS = ['#1a1a1a', '#4a2c14', '#8a5a2e', '#c0c0c0', '#6e3b1f', '#2e4a2e'];

export function makeAppearance(rng) {
  return {
    shirt: hexColor(pick(rng, SHIRTS)),
    pants: hexColor(pick(rng, PANTS)),
    skin: hexColor(pick(rng, SKINS)),
    hair: hexColor(pick(rng, HAIRS)),
    // One pedestrian in five wears a cap, for a little variety.
    hat: rng() < 0.2 ? hexColor(pick(rng, SHIRTS)) : null,
  };
}

export function makePed(x, z, heading, rng, overrides = {}) {
  return {
    x,
    z,
    heading,
    walkPhase: rng() * TAU,
    speed: 0,
    cruise: randRange(rng, 1.1, 1.8),
    state: 'walk', // walk | flee | down | dead
    stateTimer: 0,
    health: 100,
    gun: false,
    axis: 'z',
    line: 0,
    side: 6.9,
    s: 0,
    dir: 1,
    turn: null,
    lastCross: null,
    fleeX: 0,
    fleeZ: 0,
    ...makeAppearance(rng),
    ...overrides,
  };
}

// Draw a person from boxes. Legs and arms swing with walkPhase; the
// lying pose is used for knocked-down and dead pedestrians.
export function drawPed(geom, p, time) {
  const h = p.heading;
  const c = Math.cos(h);
  const s = Math.sin(h);
  const at = (lx, ly, lz) => {
    return [p.x + lx * c + lz * s, ly, p.z - lx * s + lz * c];
  };

  if (p.state === 'down' || p.state === 'dead') {
    // Lying flat, head toward the heading direction.
    geom.flatQuad(p.x, p.z, 0.04, 1.9, 0.8, [0, 0, 0, 0.25], h);
    const [tx, ty, tz] = at(0, 0.28, 0);
    geom.box(tx, ty, tz, 0.55, 0.35, 0.9, p.shirt, h);
    const [hx, hy, hz] = at(0, 0.28, 0.75);
    geom.box(hx, hy, hz, 0.34, 0.3, 0.34, p.skin, h);
    const [lx, ly, lz] = at(0, 0.22, -0.85);
    geom.box(lx, ly, lz, 0.45, 0.28, 0.9, p.pants, h);
    return;
  }

  geom.flatQuad(p.x, p.z, 0.04, 1.1, 1.1, [0, 0, 0, 0.25], h);

  const swing = Math.sin(p.walkPhase) * (p.speed > 0.3 ? 0.55 : 0.08);
  const bob = Math.abs(Math.cos(p.walkPhase)) * 0.05 * clamp(p.speed / 2, 0, 1);

  // Legs swing from the hips.
  for (const [side, phase] of [[-0.14, swing], [0.14, -swing]]) {
    const a = phase;
    const lx = side;
    const ly = 0.82 - 0.4 * Math.cos(a) + bob;
    const lz = -0.4 * Math.sin(a);
    const [wx, wy, wz] = at(lx, ly, lz);
    geom.box(wx, wy, wz, 0.22, 0.8, 0.26, p.pants, h, a, 0);
  }
  // Torso.
  const [tx, ty, tz] = at(0, 1.28 + bob, 0);
  geom.box(tx, ty, tz, 0.56, 0.68, 0.34, p.shirt, h);
  // Arms swing opposite to the legs.
  for (const [side, phase] of [[-0.37, -swing], [0.37, swing]]) {
    const a = phase * 0.8;
    const ly = 1.32 - 0.3 * Math.cos(a) + bob;
    const lz = -0.3 * Math.sin(a);
    const [wx, wy, wz] = at(side, ly, lz);
    geom.box(wx, wy, wz, 0.16, 0.62, 0.2, shade(p.shirt, 0.9), h, a, 0);
  }
  // Head and hair.
  const [hx, hy, hz] = at(0, 1.82 + bob, 0);
  geom.box(hx, hy, hz, 0.34, 0.34, 0.34, p.skin, h);
  const [ax, ay, az] = at(0, 2.0 + bob, 0);
  geom.box(ax, ay, az, 0.36, 0.15, 0.36, p.hair, h);
  if (p.hat) {
    const [kx, ky, kz] = at(0, 2.08 + bob, 0.02);
    geom.box(kx, ky, kz, 0.38, 0.1, 0.38, p.hat, h);
    const [bx, by, bz] = at(0, 2.05 + bob, 0.26);
    geom.box(bx, by, bz, 0.34, 0.05, 0.22, p.hat, h);
  }
  // Pistol in the right hand, for goons and armed police.
  if (p.gun) {
    const [gx, gy, gz] = at(0.37, 1.05 + bob, 0.35);
    geom.box(gx, gy, gz, 0.09, 0.12, 0.42, [0.1, 0.1, 0.11], h);
  }
}

export class Pedestrians {
  constructor(city, rng) {
    this.city = city;
    this.peds = [];
    for (let k = 0; k < 26; k++) {
      const vertical = rng() > 0.5;
      const line = pick(rng, STREET_LINES);
      const side = rng() > 0.5 ? 6.9 : -6.9;
      const s = randRange(rng, -185, 185);
      const dir = rng() > 0.5 ? 1 : -1;
      const x = vertical ? line + side : s;
      const z = vertical ? s : line + side;
      const heading = vertical ? (dir > 0 ? 0 : Math.PI) : (dir > 0 ? Math.PI / 2 : -Math.PI / 2);
      const ped = makePed(x, z, heading, rng);
      ped.axis = vertical ? 'z' : 'x';
      ped.line = line;
      ped.side = side;
      ped.s = s;
      ped.dir = dir;
      this.peds.push(ped);
    }
  }

  // Danger points: {x, z, radius}. Peds within one start fleeing.
  update(dt, game) {
    const dangers = game.dangerPoints || [];
    for (const ped of this.peds) {
      if (ped.state === 'dead') continue;
      if (ped.state === 'down') {
        ped.stateTimer -= dt;
        ped.speed = 0;
        if (ped.stateTimer <= 0) {
          ped.state = 'flee';
          ped.stateTimer = 3;
          ped.fleeX = ped.x;
          ped.fleeZ = ped.z;
        }
        continue;
      }
      if (ped.state === 'flee') {
        ped.stateTimer -= dt;
        const dx = ped.x - ped.fleeX;
        const dz = ped.z - ped.fleeZ;
        const d = Math.hypot(dx, dz) || 1;
        const targetHeading = Math.atan2(dx / d, dz / d);
        ped.heading = angleLerp(ped.heading, targetHeading, Math.min(1, dt * 6));
        ped.speed = 4.4;
        ped.x += Math.sin(ped.heading) * ped.speed * dt;
        ped.z += Math.cos(ped.heading) * ped.speed * dt;
        const fixed = this.city.collideCircle(ped.x, ped.z, 0.45);
        ped.x = fixed.x;
        ped.z = fixed.z;
        ped.walkPhase += ped.speed * dt * 2.6;
        if (ped.stateTimer <= 0) {
          // Settle back onto the nearest pavement and walk again.
          ped.state = 'walk';
          let bestLine = STREET_LINES[0];
          let bestD = Infinity;
          for (const line of STREET_LINES) {
            const dAxis = Math.min(Math.abs(ped.x - line), Math.abs(ped.z - line));
            if (dAxis < bestD) {
              bestD = dAxis;
              bestLine = line;
            }
          }
          ped.axis = Math.abs(ped.x - bestLine) < Math.abs(ped.z - bestLine) ? 'z' : 'x';
          ped.line = bestLine;
          ped.s = ped.axis === 'z' ? ped.z : ped.x;
          ped.side = ped.axis === 'z' ? ped.x - bestLine : ped.z - bestLine;
          ped.dir = Math.random() > 0.5 ? 1 : -1;
        }
        continue;
      }

      // Walking: check for danger first.
      for (const danger of dangers) {
        const dx = ped.x - danger.x;
        const dz = ped.z - danger.z;
        if (dx * dx + dz * dz < danger.radius * danger.radius) {
          ped.state = 'flee';
          ped.stateTimer = 3;
          ped.fleeX = danger.x;
          ped.fleeZ = danger.z;
          break;
        }
      }
      if (ped.state !== 'walk') continue;

      if (ped.turn) {
        ped.turn.t += dt;
        const k = Math.min(1, ped.turn.t / ped.turn.dur);
        const e = k * k * (3 - 2 * k);
        ped.x = ped.turn.fromX + (ped.turn.toX - ped.turn.fromX) * e;
        ped.z = ped.turn.fromZ + (ped.turn.toZ - ped.turn.fromZ) * e;
        ped.heading = angleLerp(ped.turn.fromH, ped.turn.toH, e);
        ped.speed = ped.cruise;
        ped.walkPhase += ped.speed * dt * 2.6;
        if (k >= 1) {
          ped.axis = ped.turn.axis;
          ped.line = ped.turn.line;
          ped.s = ped.turn.s;
          ped.dir = ped.turn.dir;
          ped.side = ped.turn.side;
          ped.turn = null;
        }
        continue;
      }

      ped.speed = ped.cruise;
      ped.s += ped.dir * ped.speed * dt;
      if (Math.abs(ped.s) > 192) {
        ped.dir *= -1;
        ped.s = Math.sign(ped.s) * 192;
      }
      for (const cross of STREET_LINES) {
        if (Math.abs(ped.s - cross) < 0.7 && ped.lastCross !== cross) {
          ped.lastCross = cross;
          if (Math.random() < 0.22) {
            const newAxis = ped.axis === 'z' ? 'x' : 'z';
            const newDir = Math.random() > 0.5 ? 1 : -1;
            const newSide = Math.random() > 0.5 ? 6.9 : -6.9;
            const toX = newAxis === 'z' ? cross + newSide : ped.line + ped.side;
            const toZ = newAxis === 'z' ? ped.line + ped.side : cross + newSide;
            const toH = newAxis === 'z' ? (newDir > 0 ? 0 : Math.PI) : (newDir > 0 ? Math.PI / 2 : -Math.PI / 2);
            ped.turn = {
              t: 0, dur: 0.6,
              fromX: ped.x, fromZ: ped.z, fromH: ped.heading,
              toX, toZ, toH,
              axis: newAxis, line: cross, s: ped.line + ped.side, dir: newDir, side: newSide,
            };
          }
          break;
        }
      }
      ped.x = ped.axis === 'z' ? ped.line + ped.side : ped.s;
      ped.z = ped.axis === 'z' ? ped.s : ped.line + ped.side;
      const targetH = ped.axis === 'z' ? (ped.dir > 0 ? 0 : Math.PI) : (ped.dir > 0 ? Math.PI / 2 : -Math.PI / 2);
      ped.heading = angleLerp(ped.heading, targetH, Math.min(1, dt * 6));
      ped.walkPhase += ped.speed * dt * 2.6;
    }
  }

  draw(geom, time) {
    for (const ped of this.peds) drawPed(geom, ped, time);
  }
}

// Damage from the player's pistol or car. Returns 'down' | 'dead' | 'hit'.
export function damagePed(ped, amount, game) {
  if (ped.state === 'dead') return 'dead';
  ped.health -= amount;
  if (ped.health <= 0) {
    ped.state = 'dead';
    ped.speed = 0;
    return 'dead';
  }
  if (ped.state !== 'down') {
    ped.state = 'down';
    ped.stateTimer = 4;
    ped.speed = 0;
    return 'down';
  }
  return 'hit';
}
