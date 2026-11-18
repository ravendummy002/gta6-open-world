// Vehicles for Solmar: box-built cars with spinning wheels, arcade driving
// physics shared by the player, traffic and police, plus the traffic manager
// that keeps the streets alive and the parked cars the player can steal.
import * as THREE from 'three';
import { clamp, angleDiff, dist2D } from './rng.js';
import { ROADS, PITCH, GRID } from './city.js';

export const CAR_RADIUS = 2.3;
const BODY_COLORS = [
  0xc0392b, 0x2980b9, 0xf1c40f, 0x27ae60, 0x8e44ad, 0xe67e22,
  0x1abc9c, 0xecf0f1, 0x2c3e50, 0xfd79a8, 0x95a5a6, 0xd35400,
];

/** Build a car mesh. Forward is local +Z. Returns { group, wheels, lightBar }. */
export function buildCarMesh(color, opts = {}) {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.55 });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x101820, roughness: 0.1, metalness: 0.8 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.8 });

  const body = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.85, 4.4), bodyMat);
  body.position.y = 0.78;
  body.castShadow = true;
  g.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.75, 2.2), opts.police ? bodyMat : glassMat);
  cabin.position.set(0, 1.55, -0.3);
  cabin.castShadow = true;
  g.add(cabin);
  // Police cars get a white cabin band and a light bar.
  let lightBar = null;
  if (opts.police) {
    const band = new THREE.Mesh(new THREE.BoxGeometry(2.02, 0.4, 1.6), new THREE.MeshStandardMaterial({ color: 0xf5f5f5, roughness: 0.4 }));
    band.position.set(0, 0.95, -0.2);
    g.add(band);
    lightBar = new THREE.Group();
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.22, 0.4), new THREE.MeshBasicMaterial({ color: 0xff2222 }));
    red.position.x = -0.45;
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.22, 0.4), new THREE.MeshBasicMaterial({ color: 0x2266ff }));
    blue.position.x = 0.45;
    lightBar.add(red, blue);
    lightBar.position.set(0, 2.05, -0.3);
    lightBar.userData.red = red;
    lightBar.userData.blue = blue;
    g.add(lightBar);
  }
  // Bumpers, headlights, taillights.
  const bumperF = new THREE.Mesh(new THREE.BoxGeometry(2.02, 0.3, 0.3), darkMat);
  bumperF.position.set(0, 0.5, 2.25);
  const bumperB = bumperF.clone();
  bumperB.position.z = -2.25;
  g.add(bumperF, bumperB);
  const headMat = new THREE.MeshBasicMaterial({ color: 0xfff6c0 });
  const tailMat = new THREE.MeshBasicMaterial({ color: 0xff2a2a });
  for (const sx of [-0.7, 0.7]) {
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.22, 0.1), headMat);
    h.position.set(sx, 0.85, 2.21);
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.22, 0.1), tailMat);
    t.position.set(sx, 0.85, -2.21);
    g.add(h, t);
  }
  // Wheels: cylinders rotated so their axis is across the car.
  const wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.3, 12);
  wheelGeo.rotateZ(Math.PI / 2);
  const wheels = [];
  for (const [wx, wz, front] of [[-0.95, 1.45, true], [0.95, 1.45, true], [-0.95, -1.45, false], [0.95, -1.45, false]]) {
    const w = new THREE.Mesh(wheelGeo, darkMat);
    w.position.set(wx, 0.38, wz);
    w.castShadow = true;
    w.userData.front = front;
    g.add(w);
    wheels.push(w);
  }
  return { group: g, wheels, lightBar };
}

/** One car in the world: physics state plus its mesh. */
export class Car {
  constructor(scene, x, z, heading, color, opts = {}) {
    this.scene = scene;
    this.x = x;
    this.z = z;
    this.heading = heading;
    this.speed = 0;
    this.steer = 0; // -1..1, smoothed
    this.color = color;
    this.police = !!opts.police;
    this.driver = opts.driver || 'parked'; // parked | traffic | player | police | none
    this.hp = 100;
    this.wrecked = false;
    this.maxSpeed = opts.maxSpeed ?? 30;
    // Traffic AI state; every car carries it so a car handed to the traffic
    // manager later (a shot car, a mission car) never crashes the update.
    this.cruise = { targetSpeed: this.maxSpeed, waypoint: null };
    this.id = Car.nextId++;
    const built = buildCarMesh(color, opts);
    this.mesh = built.group;
    this.wheels = built.wheels;
    this.lightBar = built.lightBar;
    this.mesh.position.set(x, 0, z);
    this.mesh.rotation.y = heading;
    scene.add(this.mesh);
    // Smoke sprites for a wrecked car.
    this.smoke = [];
    this.smokeTimer = 0;
  }

  get forward() {
    return { x: Math.sin(this.heading), z: Math.cos(this.heading) };
  }

  /** Arcade drive step. throttle -1..1, steer -1..1, handbrake bool. */
  drive(dt, throttle, steer, handbrake, city) {
    if (this.wrecked) {
      this.speed = 0;
      return;
    }
    const accel = throttle >= 0 ? 16 : 22;
    this.speed += throttle * accel * dt;
    // Drag + rolling resistance; handbrake kills speed fast and frees the tail.
    const drag = handbrake ? 2.6 : 0.55;
    this.speed -= this.speed * drag * dt;
    if (throttle === 0) this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), 4 * dt);
    this.speed = clamp(this.speed, -10, this.maxSpeed);
    // Steering: sharper at low speed, looser at high speed; handbrake drifts.
    const grip = handbrake ? 1.7 : 1;
    const turnRate = 1.9 * clamp(Math.abs(this.speed) / 9, 0, 1) * grip;
    this.steer += (steer - this.steer) * Math.min(1, dt * 8);
    this.heading += this.steer * turnRate * dt * Math.sign(this.speed || 1);
    const f = this.forward;
    const nx = this.x + f.x * this.speed * dt;
    const nz = this.z + f.z * this.speed * dt;
    const [rx, rz] = city.resolveCircle(nx, nz, CAR_RADIUS);
    if (rx !== nx || rz !== nz) {
      // Hit a building: bounce a little speed off and take damage.
      if (Math.abs(this.speed) > 6) this.damage(Math.abs(this.speed) * 1.2);
      this.speed *= 0.45;
    }
    this.x = rx;
    this.z = rz;
    this.syncMesh(dt);
  }

  damage(amount) {
    if (this.wrecked) return;
    this.hp -= amount;
    if (this.hp <= 0) {
      this.hp = 0;
      this.wrecked = true;
      this.speed = 0;
      this.mesh.rotation.z = 0.06;
    }
  }

  syncMesh(dt) {
    this.mesh.position.set(this.x, 0, this.z);
    this.mesh.rotation.y = this.heading;
    // Spin wheels, yaw the front pair with steering.
    const spin = (this.speed * dt) / 0.38;
    for (const w of this.wheels) {
      w.rotation.x += spin;
      if (w.userData.front) w.rotation.y = this.steer * 0.45;
    }
    // Police light bar strobes.
    if (this.lightBar) {
      const phase = Math.floor(performance.now() / 180) % 2 === 0;
      this.lightBar.userData.red.material.color.setHex(phase ? 0xff2222 : 0x551111);
      this.lightBar.userData.blue.material.color.setHex(phase ? 0x112266 : 0x2266ff);
    }
    // Wreck smoke: grey puffs rising from the bonnet.
    if (this.wrecked) {
      this.smokeTimer -= dt;
      if (this.smokeTimer <= 0 && this.smoke.length < 10) {
        this.smokeTimer = 0.35;
        const puff = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0x555555, transparent: true, opacity: 0.5 }));
        puff.position.set(this.x + Math.sin(this.heading) * 1.5, 1.6, this.z + Math.cos(this.heading) * 1.5);
        puff.scale.setScalar(1.2);
        this.scene.add(puff);
        this.smoke.push({ puff, life: 1.4 });
      }
    }
    for (let i = this.smoke.length - 1; i >= 0; i--) {
      const s = this.smoke[i];
      s.life -= dt;
      s.puff.position.y += dt * 1.2;
      s.puff.scale.multiplyScalar(1 + dt * 0.8);
      s.puff.material.opacity = Math.max(0, s.life / 1.4) * 0.5;
      if (s.life <= 0) {
        this.scene.remove(s.puff);
        this.smoke.splice(i, 1);
      }
    }
  }

  remove() {
    this.scene.remove(this.mesh);
    for (const s of this.smoke) this.scene.remove(s.puff);
  }
}
Car.nextId = 1;

/**
 * Traffic manager: keeps N cars cruising the road grid and a set of parked
 * cars the player can steal. Cars far from the player recycle to fresh roads.
 */
export class Traffic {
  constructor(scene, city, rng, count = 16, parkedCount = 14) {
    this.scene = scene;
    this.city = city;
    this.rng = rng;
    this.cars = [];
    this.parked = [];
    for (let i = 0; i < count; i++) this.spawnTraffic();
    for (let i = 0; i < parkedCount; i++) this.spawnParked();
  }

  spawnTraffic() {
    const p = this.city.randomRoadPoint(this.rng);
    const car = new Car(this.scene, p.x, p.z, p.heading, this.rng.pick(BODY_COLORS), { driver: 'traffic', maxSpeed: this.rng.range(8, 12) });
    car.cruise = { targetSpeed: car.maxSpeed, waypoint: null };
    this.cars.push(car);
    return car;
  }

  spawnParked() {
    const p = this.city.randomRoadPoint(this.rng);
    // Parked cars sit at the road edge, parallel to the road.
    const car = new Car(this.scene, p.x, p.z, p.heading, this.rng.pick(BODY_COLORS), { driver: 'parked' });
    this.parked.push(car);
    return car;
  }

  /** All cars (traffic + parked + any the police manager added elsewhere). */
  all() {
    return [...this.cars, ...this.parked];
  }

  /** Steer one traffic car along the grid, turning at intersections. */
  updateTrafficCar(car, dt, playerPos, others) {
    if (car.wrecked || car.driver !== 'traffic') return;
    const c = car.cruise;
    // Waypoint: 26 units ahead along the current heading, snapped to the road.
    if (!c.waypoint) {
      const f = car.forward;
      c.waypoint = { x: car.x + f.x * 26, z: car.z + f.z * 26 };
    }
    const wp = c.waypoint;
    const d = dist2D(car.x, car.z, wp.x, wp.z);
    if (d < 4) {
      // Reached the waypoint: at an intersection, maybe turn.
      c.waypoint = null;
      const nearX = Math.round(car.x / PITCH) * PITCH;
      const nearZ = Math.round(car.z / PITCH) * PITCH;
      const atIntersection = Math.abs(car.x - nearX) < 9 && Math.abs(car.z - nearZ) < 9;
      if (atIntersection && this.rng.chance(0.45)) {
        const turn = this.rng.pick([-Math.PI / 2, Math.PI / 2]);
        const newHeading = car.heading + turn;
        const fx = Math.sin(newHeading);
        const fz = Math.cos(newHeading);
        c.waypoint = { x: nearX + fx * 26, z: nearZ + fz * 26 };
      } else {
        const f = car.forward;
        c.waypoint = { x: car.x + f.x * 26, z: car.z + f.z * 26 };
      }
      return;
    }
    // Steer toward the waypoint.
    const desired = Math.atan2(wp.x - car.x, wp.z - car.z);
    const steer = clamp(angleDiff(car.heading, desired) * 2.2, -1, 1);
    // Brake for anything ahead.
    let throttle = 0.55;
    const f = car.forward;
    for (const o of others) {
      if (o === car || o.wrecked) continue;
      const dx = o.x - car.x;
      const dz = o.z - car.z;
      const ahead = dx * f.x + dz * f.z;
      const side = Math.abs(dx * f.z - dz * f.x);
      if (ahead > 0 && ahead < 11 && side < 3.4) {
        throttle = -0.6;
        break;
      }
    }
    if (playerPos) {
      const dx = playerPos.x - car.x;
      const dz = playerPos.z - car.z;
      const ahead = dx * f.x + dz * f.z;
      const side = Math.abs(dx * f.z - dz * f.x);
      if (ahead > 0 && ahead < 9 && side < 3) throttle = -0.6;
    }
    car.drive(dt, throttle, steer, false, this.city);
    // Keep off the sand and out of the park: roads only, so clamp to the grid.
    car.x = clamp(car.x, -GRID * PITCH - 6, GRID * PITCH + 6);
    car.z = clamp(car.z, -GRID * PITCH - 6, GRID * PITCH + 6);
  }

  /** Circle-vs-circle separation between all cars. */
  collideCars(cars) {
    for (let i = 0; i < cars.length; i++) {
      for (let j = i + 1; j < cars.length; j++) {
        const a = cars[i];
        const b = cars[j];
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const d = Math.hypot(dx, dz);
        const min = CAR_RADIUS * 1.9;
        if (d > 0.001 && d < min) {
          const push = (min - d) / 2;
          const nx = dx / d;
          const nz = dz / d;
          a.x -= nx * push;
          a.z -= nz * push;
          b.x += nx * push;
          b.z += nz * push;
          const rel = Math.abs(a.speed - b.speed);
          if (rel > 5) {
            a.damage(rel * 0.8);
            b.damage(rel * 0.8);
          }
          a.speed *= 0.7;
          b.speed *= 0.7;
          a.syncMesh(0);
          b.syncMesh(0);
        }
      }
    }
  }

  update(dt, playerPos) {
    const all = this.all();
    for (const car of this.cars) {
      this.updateTrafficCar(car, dt, playerPos, all);
      // Recycle cars that wandered far from the player.
      if (playerPos && dist2D(car.x, car.z, playerPos.x, playerPos.z) > 280 && !car.wrecked) {
        const p = this.city.randomRoadPoint(this.rng);
        // Respawn near (not on top of) the player.
        const a = this.rng.angle();
        const px = playerPos.x + Math.cos(a) * 130;
        const pz = playerPos.z + Math.sin(a) * 130;
        const roadX = Math.round(px / PITCH) * PITCH;
        const roadZ = Math.round(pz / PITCH) * PITCH;
        car.x = this.rng.chance(0.5) ? roadX : p.x;
        car.z = this.rng.chance(0.5) ? p.z : roadZ;
        car.heading = p.heading;
        car.speed = 0;
        car.cruise.waypoint = null;
        car.syncMesh(0);
      }
    }
    this.collideCars(all);
  }
}
