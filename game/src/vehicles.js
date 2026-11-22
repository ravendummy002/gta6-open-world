// Cars: models, arcade driving physics, traffic AI and parked cars.
// Every car in Solmar — traffic, parked, police and mission cars —
// lives in one list and is drawn by the same builder.

import { hexColor, shade } from './geometry.js';
import { angleLerp, clamp, mulberry32, pick, randRange } from './rng.js';
import { STREET_LINES } from './city.js';

export const CAR_MODELS = {
  sedan: { name: 'Comet', len: 4.4, wid: 1.9, top: 26, accel: 11, brake: 22 },
  sport: { name: 'Vortex GT', len: 4.2, wid: 1.95, top: 38, accel: 17, brake: 26 },
  taxi: { name: 'Solmar Cab', len: 4.4, wid: 1.9, top: 25, accel: 10, brake: 22 },
  van: { name: 'Bay Van', len: 4.8, wid: 2.0, top: 22, accel: 8, brake: 18 },
  truck: { name: 'Hauler', len: 5.4, wid: 2.1, top: 20, accel: 7, brake: 16 },
  cop: { name: 'Interceptor', len: 4.5, wid: 1.95, top: 34, accel: 16, brake: 26 },
};

export const CAR_COLORS = [
  '#d94f3d', '#3f7fd9', '#f2c230', '#e8e8e8', '#2fa8a0',
  '#e87f2e', '#8a5fd0', '#4caf50', '#c0c8d0', '#7a4a2e',
];

let nextCarId = 1;

export function makeCar(modelId, colorHex, x, z, heading, driver) {
  const model = CAR_MODELS[modelId];
  return {
    id: nextCarId++,
    modelId,
    model,
    color: hexColor(colorHex),
    x,
    z,
    heading,
    speed: 0,
    steer: 0,
    wheelAngle: 0,
    driver, // 'traffic' | 'parked' | 'player' | 'cop'
    owned: false,
    cruise: randRange(Math.random, 8, 13),
    axis: 'z',
    line: 0,
    s: 0,
    dir: 1,
    turn: null,
    lastCross: null,
    sirenPhase: Math.random() * 10,
  };
}

// Local (lx, lz) offset rotated by the car's heading into world space.
function localToWorld(car, lx, lz) {
  const c = Math.cos(car.heading);
  const s = Math.sin(car.heading);
  return { x: car.x + lx * c + lz * s, z: car.z - lx * s + lz * c };
}

const GLASS = [0.11, 0.16, 0.2];
const TYRE = [0.09, 0.09, 0.1];
const DARK = [0.16, 0.17, 0.18];

export function drawCar(geom, car, time) {
  const m = car.model;
  const { len, wid } = m;
  const h = car.heading;
  const body = car.color;
  const low = car.modelId === 'sport';

  // Soft blob shadow under the car. The quad's long side runs along
  // the car's local Z (its length), like the body above it.
  geom.flatQuad(car.x, car.z, 0.04, wid + 0.5, len + 0.5, [0, 0, 0, 0.28], h);

  const at = (lx, ly, lz) => {
    const p = localToWorld(car, lx, lz);
    return [p.x, ly, p.z];
  };

  if (car.modelId === 'van') {
    const [bx, by, bz] = at(0, 1.05, 0);
    geom.box(bx, by, bz, wid, 1.7, len, body, h);
    const [wx, wy, wz] = at(0, 1.15, len / 2 - 0.4);
    geom.box(wx, wy, wz, wid * 0.8, 0.7, 0.2, GLASS, h);
  } else if (car.modelId === 'truck') {
    const [bx, by, bz] = at(0, 0.75, 0.8);
    geom.box(bx, by, bz, wid, 1.1, 2.4, body, h);
    const [cx, cy, cz] = at(0, 1.5, 1.4);
    geom.box(cx, cy, cz, wid * 0.85, 0.8, 1.2, GLASS, h);
    const [dx, dy, dz] = at(0, 0.85, -1.5);
    geom.box(dx, dy, dz, wid, 0.9, 2.6, shade(body, 0.85), h);
  } else {
    // Lower body and glasshouse.
    const bodyY = low ? 0.48 : 0.55;
    const [bx, by, bz] = at(0, bodyY, 0);
    geom.box(bx, by, bz, wid, low ? 0.6 : 0.72, len, body, h);
    const [cx, cy, cz] = at(0, bodyY + 0.55, -0.25);
    geom.box(cx, cy, cz, wid * 0.82, 0.55, len * 0.48, GLASS, h);
    const [rx, ry, rz] = at(0, bodyY + 0.86, -0.25);
    geom.box(rx, ry, rz, wid * 0.8, 0.1, len * 0.46, body, h);
    if (car.modelId === 'sport') {
      // Rear spoiler.
      const [sx, sy, sz] = at(0, 1.05, -len / 2 + 0.15);
      geom.box(sx, sy, sz, wid * 0.9, 0.08, 0.5, DARK, h);
      const [s2x, s2y, s2z] = at(0, 0.85, -len / 2 + 0.15);
      geom.box(s2x, s2y, s2z, 0.14, 0.35, 0.3, DARK, h);
    }
  }

  // Wheels: front pair steers, all four spin with speed.
  const wheelZ = len * 0.32;
  const wheelX = wid / 2 - 0.08;
  for (const [lx, lz, front] of [
    [-wheelX, wheelZ, true], [wheelX, wheelZ, true],
    [-wheelX, -wheelZ, false], [wheelX, -wheelZ, false],
  ]) {
    const p = localToWorld(car, lx, lz);
    const steer = front ? car.steer : 0;
    geom.box(p.x, 0.33, p.z, 0.3, 0.66, 0.66, TYRE, h + steer, car.wheelAngle, 0);
    geom.box(p.x, 0.33, p.z, 0.32, 0.3, 0.3, [0.7, 0.7, 0.72], h + steer, car.wheelAngle, 0);
  }

  // Lights and bumpers.
  const [f1x, f1y, f1z] = at(-wid * 0.32, 0.62, len / 2 + 0.02);
  const [f2x, f2y, f2z] = at(wid * 0.32, 0.62, len / 2 + 0.02);
  geom.box(f1x, f1y, f1z, 0.4, 0.18, 0.1, [1, 0.97, 0.78], h);
  geom.box(f2x, f2y, f2z, 0.4, 0.18, 0.1, [1, 0.97, 0.78], h);
  const [r1x, r1y, r1z] = at(-wid * 0.32, 0.62, -len / 2 - 0.02);
  const [r2x, r2y, r2z] = at(wid * 0.32, 0.62, -len / 2 - 0.02);
  const braking = car.braking ? [1, 0.15, 0.1] : [0.75, 0.1, 0.08];
  geom.box(r1x, r1y, r1z, 0.4, 0.18, 0.1, braking, h);
  geom.box(r2x, r2y, r2z, 0.4, 0.18, 0.1, braking, h);

  if (car.modelId === 'cop') {
    // Flashing light bar: red and blue swap twice a second.
    const phase = Math.floor((time + car.sirenPhase) * 2.4) % 2 === 0;
    const [lx, ly, lz] = at(-0.42, 1.48, -0.25);
    geom.box(lx, ly, lz, 0.72, 0.22, 0.4, phase ? [1, 0.1, 0.1] : [0.25, 0.25, 0.3], h);
    const [lx2, ly2, lz2] = at(0.42, 1.48, -0.25);
    geom.box(lx2, ly2, lz2, 0.72, 0.22, 0.4, phase ? [0.25, 0.25, 0.3] : [0.15, 0.3, 1], h);
    const [sx, sy, sz] = at(0, 0.62, 0);
    geom.box(sx, sy, sz, wid + 0.04, 0.22, len * 0.8, [0.15, 0.35, 0.85], h);
  }
  if (car.modelId === 'taxi') {
    const [tx, ty, tz] = at(0, 1.5, -0.25);
    geom.box(tx, ty, tz, 0.8, 0.26, 0.45, [1, 0.92, 0.55], h);
  }
}

// Arcade driving: throttle in [-1, 1], steerInput in [-1, 1] (positive
// is left), handbrake boolean. Handles buildings and other cars.
export function driveCarPhysics(car, throttle, steerInput, handbrake, dt, city, others) {
  const m = car.model;
  const onRoad = city.isOnRoad(car.x, car.z) || city.isOnPier(car.x, car.z);
  const top = onRoad ? m.top : m.top * 0.55;
  car.braking = false;

  if (throttle > 0) {
    car.speed += m.accel * throttle * dt * Math.max(0, 1 - car.speed / (top * 1.15));
  } else if (throttle < 0) {
    if (car.speed > 0.5) {
      car.speed -= m.brake * dt;
      car.braking = true;
    } else {
      car.speed = Math.max(-8, car.speed + m.accel * 0.6 * throttle * dt);
    }
  }
  // Drag, rolling resistance and the handbrake.
  car.speed -= car.speed * (onRoad ? 0.25 : 0.8) * dt;
  if (throttle === 0) {
    car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 1.4 * dt);
  }
  if (handbrake) {
    car.speed -= car.speed * 2.4 * dt;
  }
  car.speed = clamp(car.speed, -9, top * 1.05);

  const speed01 = clamp(Math.abs(car.speed) / m.top, 0, 1);
  const maxSteer = 0.55 - speed01 * 0.36;
  const steerTarget = steerInput * maxSteer;
  car.steer += (steerTarget - car.steer) * Math.min(1, dt * (handbrake ? 5 : 8));
  const grip = handbrake ? 0.55 : 1;
  car.heading += (car.speed / 2.7) * Math.tan(car.steer) * dt * grip;

  const fx = Math.sin(car.heading);
  const fz = Math.cos(car.heading);
  const nx = car.x + fx * car.speed * dt;
  const nz = car.z + fz * car.speed * dt;

  // Collide at the front and rear axle points.
  let crashed = false;
  for (const along of [1.6, -1.6]) {
    const px = nx + fx * along;
    const pz = nz + fz * along;
    const fixed = city.collideCircle(px, pz, 1.05);
    if (Math.abs(fixed.x - px) > 0.01 || Math.abs(fixed.z - pz) > 0.01) {
      crashed = true;
    }
    // Push the whole car by the correction.
    car.x = nx + (fixed.x - px);
    car.z = nz + (fixed.z - pz);
  }
  if (!crashed) {
    car.x = nx;
    car.z = nz;
  } else if (Math.abs(car.speed) > 3) {
    car.speed *= 0.35;
  }

  // Car-to-car shunts.
  if (others) {
    for (const other of others) {
      if (other === car) continue;
      const dx = car.x - other.x;
      const dz = car.z - other.z;
      const d2 = dx * dx + dz * dz;
      const minD = 2.5;
      if (d2 < minD * minD && d2 > 1e-6) {
        const d = Math.sqrt(d2);
        const push = (minD - d) / 2;
        const ux = dx / d;
        const uz = dz / d;
        car.x += ux * push;
        car.z += uz * push;
        other.x -= ux * push;
        other.z -= uz * push;
        const rel = Math.abs(car.speed - other.speed);
        if (rel > 4) {
          car.speed *= 0.6;
          other.speed *= 0.6;
        }
      }
    }
  }

  car.wheelAngle += (car.speed * dt) / 0.33;
}

export function findNearestCar(cars, x, z, maxDist) {
  let best = null;
  let bestD2 = maxDist * maxDist;
  for (const car of cars) {
    const dx = car.x - x;
    const dz = car.z - z;
    const d2 = dx * dx + dz * dz;
    if (d2 < bestD2) {
      bestD2 = d2;
      best = car;
    }
  }
  return best;
}

function laneOffset(axis, dir) {
  if (axis === 'z') return dir > 0 ? -2.2 : 2.2;
  return dir > 0 ? 2.2 : -2.2;
}

function headingFor(axis, dir) {
  if (axis === 'z') return dir > 0 ? 0 : Math.PI;
  return dir > 0 ? Math.PI / 2 : -Math.PI / 2;
}

// Traffic: cars that drive the street grid, turn at intersections,
// and brake for the car (or pedestrian) ahead.
export class Traffic {
  constructor(city, rng) {
    this.city = city;
    this.cars = [];
    for (let k = 0; k < 14; k++) {
      this.cars.push(this.spawnCar(rng));
    }
    // Parked cars: the lot, plus a couple at the kerb near the plaza.
    for (const spot of city.parkingSpots.slice(0, 5)) {
      const car = makeCar(pick(rng, ['sedan', 'sedan', 'van', 'taxi']), pick(rng, CAR_COLORS), spot.x, spot.z, spot.heading, 'parked');
      this.cars.push(car);
    }
    const kerb = [
      { x: -40.5, z: -70, heading: 0 },
      { x: 50.5, z: 30, heading: Math.PI },
    ];
    for (const k of kerb) {
      this.cars.push(makeCar('sedan', pick(rng, CAR_COLORS), k.x, k.z, k.heading, 'parked'));
    }
  }

  spawnCar(rng) {
    const vertical = rng() > 0.5;
    const line = pick(rng, STREET_LINES);
    const dir = rng() > 0.5 ? 1 : -1;
    const s = randRange(rng, -180, 180);
    const axis = vertical ? 'z' : 'x';
    const off = laneOffset(axis, dir);
    const x = vertical ? line + off : s;
    const z = vertical ? s : line + off;
    const modelId = pick(rng, ['sedan', 'sedan', 'sedan', 'taxi', 'van', 'truck', 'sport']);
    const car = makeCar(modelId, pick(rng, CAR_COLORS), x, z, headingFor(axis, dir), 'traffic');
    car.axis = axis;
    car.line = line;
    car.s = s;
    car.dir = dir;
    car.speed = car.cruise;
    return car;
  }

  update(dt, game) {
    const allCars = game.allCars();
    for (const car of this.cars) {
      if (car.driver !== 'traffic') continue;
      if (car.turn) {
        // Cornering: ease from the old lane to the new one.
        car.turn.t += dt;
        const k = Math.min(1, car.turn.t / car.turn.dur);
        const e = k * k * (3 - 2 * k);
        car.x = car.turn.fromX + (car.turn.toX - car.turn.fromX) * e;
        car.z = car.turn.fromZ + (car.turn.toZ - car.turn.fromZ) * e;
        car.heading = angleLerp(car.turn.fromH, car.turn.toH, e);
        car.wheelAngle += (car.speed * dt) / 0.33;
        if (k >= 1) {
          car.axis = car.turn.axis;
          car.line = car.turn.line;
          car.s = car.turn.s;
          car.dir = car.turn.dir;
          car.turn = null;
        }
        continue;
      }

      // Look ahead: brake for a car or pedestrian in this lane.
      // Positions are projected onto this street, so the player's car
      // and police cars count even though they keep no lane bookkeeping.
      let targetSpeed = car.cruise;
      const ahead = 10;
      for (const other of allCars) {
        if (other === car || other.driver === 'parked') continue;
        const along = car.axis === 'z' ? other.z : other.x;
        const across = car.axis === 'z' ? other.x : other.z;
        if (Math.abs(across - car.line) > 4.5) continue;
        const gap = (along - car.s) * car.dir;
        if (gap > 0 && gap < ahead) targetSpeed = 0;
      }
      for (const ped of game.peds.peds) {
        if (ped.state === 'dead' || ped.state === 'down') continue;
        const along = car.axis === 'z' ? ped.z : ped.x;
        const across = car.axis === 'z' ? ped.x : ped.z;
        if (Math.abs(across - car.line) > 5) continue;
        const gap = (along - car.s) * car.dir;
        if (gap > 0 && gap < 8) targetSpeed = 0;
      }
      car.braking = targetSpeed < car.speed - 0.5;
      car.speed += (targetSpeed - car.speed) * Math.min(1, dt * 2.5);
      car.s += car.dir * car.speed * dt;

      // City edge: turn around.
      if (Math.abs(car.s) > 192) {
        car.dir *= -1;
        car.s = Math.sign(car.s) * 192;
        car.heading = headingFor(car.axis, car.dir);
      }

      // Intersections: sometimes turn onto the crossing street.
      for (const cross of STREET_LINES) {
        if (Math.abs(car.s - cross) < 0.9 && car.lastCross !== cross) {
          car.lastCross = cross;
          if (Math.random() < 0.3) {
            const newAxis = car.axis === 'z' ? 'x' : 'z';
            const newDir = Math.random() > 0.5 ? 1 : -1;
            const newOff = laneOffset(newAxis, newDir);
            const toX = newAxis === 'z' ? cross + newOff : car.line;
            const toZ = newAxis === 'z' ? car.line : cross + newOff;
            car.turn = {
              t: 0,
              dur: 0.7,
              fromX: car.x,
              fromZ: car.z,
              fromH: car.heading,
              toX,
              toZ,
              toH: headingFor(newAxis, newDir),
              axis: newAxis,
              line: cross,
              s: car.line,
              dir: newDir,
            };
          }
          break;
        }
      }

      const off = laneOffset(car.axis, car.dir);
      car.x = car.axis === 'z' ? car.line + off : car.s;
      car.z = car.axis === 'z' ? car.s : car.line + off;
      car.heading = angleLerp(car.heading, headingFor(car.axis, car.dir), Math.min(1, dt * 6));
      car.wheelAngle += (car.speed * dt) / 0.33;
    }
  }

  draw(geom, time) {
    for (const car of this.cars) drawCar(geom, car, time);
  }
}
