// Teo Reyes, the player: on-foot movement and shooting, car entry and exit,
// and the third-person camera. Driving physics live in vehicles.js; this
// module only steers the car the player is in.
import * as THREE from 'three';
import { clamp, angleDiff, dist2D } from './rng.js';
import { buildPedMesh } from './peds.js';
import { CAR_RADIUS } from './vehicles.js';

const WALK_SPEED = 5.5;
const RUN_SPEED = 9.5;
const GRAVITY = 24;
const JUMP_VELOCITY = 8;
const PISTOL_DAMAGE = 34;
const PISTOL_RANGE = 70;
const FIRE_INTERVAL = 0.22;

/** Ray vs AABB (XZ slab test, ignoring Y): distance along the ray, or null. */
function rayHitBox(ox, oz, dx, dz, box, maxDist) {
  let tmin = 0;
  let tmax = maxDist;
  for (const [o, d, mn, mx] of [[ox, dx, box.minX, box.maxX], [oz, dz, box.minZ, box.maxZ]]) {
    if (Math.abs(d) < 1e-8) {
      if (o < mn || o > mx) return null;
    } else {
      let t1 = (mn - o) / d;
      let t2 = (mx - o) / d;
      if (t1 > t2) [t1, t2] = [t2, t1];
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) return null;
    }
  }
  return tmin;
}

export class Player {
  constructor(scene, city, x, z) {
    this.scene = scene;
    this.city = city;
    this.x = x;
    this.z = z;
    this.y = 0;
    this.vy = 0;
    this.heading = 0;
    this.speed = 0;
    this.hp = 100;
    this.mode = 'foot'; // foot | car
    this.car = null;
    this.lastCar = null;
    this.fireTimer = 0;
    this.hurtTimer = 0;
    this.phase = 0;
    this.dead = false;
    // Camera state.
    this.camYaw = Math.PI;
    this.camPitch = 0.32;
    this.camDist = 7.5;
    this.carCamYaw = 0;
    const built = buildPedMesh(0x2e8b8b, 0x2c3e50, 0xc68642);
    this.mesh = built.group;
    this.parts = built;
    this.mesh.position.set(x, 0, z);
    scene.add(this.mesh);
    // Muzzle flash light + tracer line, reused every shot.
    this.flash = new THREE.PointLight(0xffcc66, 0, 18);
    scene.add(this.flash);
    const tracerGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
    this.tracer = new THREE.Line(tracerGeo, new THREE.LineBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0 }));
    scene.add(this.tracer);
    this.tracerTimer = 0;
  }

  get pos() {
    return this.car ? { x: this.car.x, z: this.car.z } : { x: this.x, z: this.z };
  }

  damage(amount) {
    if (this.dead) return;
    this.hp -= amount;
    this.hurtTimer = 8;
    if (this.hp <= 0) {
      this.hp = 0;
      this.dead = true;
    }
  }

  heal(amount) {
    this.hp = Math.min(100, this.hp + amount);
  }

  /** Enter a car (called by the game when F is pressed near one). */
  enterCar(car, onStolen) {
    this.car = car;
    this.lastCar = car;
    this.mode = 'car';
    const wasParked = car.driver === 'parked' || car.driver === 'traffic';
    car.driver = 'player';
    this.mesh.visible = false;
    this.carCamYaw = car.heading + Math.PI;
    if (wasParked && onStolen) onStolen(car);
  }

  /** Step out of the car beside its left flank. */
  exitCar() {
    if (!this.car) return;
    const car = this.car;
    const side = { x: Math.cos(car.heading), z: -Math.sin(car.heading) };
    this.x = car.x + side.x * 3.2;
    this.z = car.z + side.z * 3.2;
    [this.x, this.z] = this.city.resolveCircle(this.x, this.z, 0.6);
    this.heading = car.heading;
    this.y = 0;
    this.vy = 0;
    car.driver = 'parked';
    this.car = null;
    this.mode = 'foot';
    this.mesh.visible = true;
    this.mesh.position.set(this.x, 0, this.z);
    this.camYaw = car.heading + Math.PI;
  }

  /** Fire the pistol along the camera's aim. Returns what was hit. */
  shoot(world) {
    const camera = world.camera;
    const origin = new THREE.Vector3();
    camera.getWorldPosition(origin);
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    const o = { x: origin.x, z: origin.z };
    const d = { x: dir.x, z: dir.z };
    const dLen = Math.hypot(d.x, d.z) || 1;
    d.x /= dLen;
    d.z /= dLen;
    // Nearest blocking building.
    let blockDist = PISTOL_RANGE;
    for (const b of this.city.colliders) {
      const t = rayHitBox(o.x, o.z, d.x, d.z, b, PISTOL_RANGE);
      if (t !== null && t < blockDist) blockDist = t;
    }
    // Nearest living target (ped, cop, car) inside the block distance.
    let best = null;
    let bestDist = blockDist;
    const consider = (tx, tz, radius, target) => {
      const dx = tx - o.x;
      const dz = tz - o.z;
      const along = dx * d.x + dz * d.z;
      if (along < 0 || along > bestDist) return;
      const perp = Math.abs(dx * d.z - dz * d.x);
      if (perp < radius && along < bestDist) {
        bestDist = along;
        best = target;
      }
    };
    for (const p of world.crowd.peds) {
      if (p.state !== 'dead') consider(p.x, p.z, 1.1, { kind: 'ped', ped: p });
    }
    for (const h of world.missions?.current?.hostiles ?? []) {
      if (h.state !== 'dead') consider(h.x, h.z, 1.1, { kind: 'hostile', ped: h });
    }
    for (const cop of world.police.cops) {
      if (cop.state !== 'dead') consider(cop.x, cop.z, 1.1, { kind: 'cop', ped: cop });
    }
    for (const car of world.traffic.all()) {
      if (car !== this.car && !car.wrecked) consider(car.x, car.z, 2.6, { kind: 'car', car });
    }
    for (const car of world.police.cars) {
      if (!car.wrecked) consider(car.x, car.z, 2.6, { kind: 'car', car });
    }
    // Effects: tracer from the muzzle to the hit point, muzzle flash.
    const hitX = o.x + d.x * bestDist;
    const hitZ = o.z + d.z * bestDist;
    const muzzle = new THREE.Vector3(this.x + Math.sin(this.heading) * 0.6, 1.45, this.z + Math.cos(this.heading) * 0.6);
    const end = new THREE.Vector3(hitX, 1.3, hitZ);
    this.tracer.geometry.setFromPoints([muzzle, end]);
    this.tracer.material.opacity = 0.9;
    this.tracerTimer = 0.08;
    this.flash.position.copy(muzzle);
    this.flash.intensity = 60;
    if (best) {
      if (best.kind === 'ped' || best.kind === 'cop' || best.kind === 'hostile') {
        const killed = best.ped.damage(PISTOL_DAMAGE, this.x, this.z);
        if (killed && world.onPedKilled) world.onPedKilled(best.ped, best.kind === 'cop');
      } else if (best.kind === 'car') {
        best.car.damage(12);
      }
    }
    return best;
  }

  update(dt, input, world) {
    if (this.dead) return;
    this.fireTimer -= dt;
    this.hurtTimer -= dt;
    if (this.hurtTimer <= 0 && this.hp < 100 && this.hp > 0) this.hp = Math.min(100, this.hp + 4 * dt);
    if (this.tracerTimer > 0) {
      this.tracerTimer -= dt;
      if (this.tracerTimer <= 0) this.tracer.material.opacity = 0;
    }
    this.flash.intensity = Math.max(0, this.flash.intensity - dt * 600);

    // Camera look: mouse (pointer lock) or arrow keys.
    const look = input.lookDelta();
    this.camYaw -= look.dx * 0.0028;
    if (this.mode === 'car') this.carCamYaw -= look.dx * 0.0028;
    this.camPitch = clamp(this.camPitch + look.dy * 0.0022, -0.12, 1.1);
    if (input.down('ArrowLeft')) this.camYaw += dt * 2.2;
    if (input.down('ArrowRight')) this.camYaw -= dt * 2.2;
    if (input.down('ArrowUp')) this.camPitch = clamp(this.camPitch - dt * 1.4, -0.12, 1.1);
    if (input.down('ArrowDown')) this.camPitch = clamp(this.camPitch + dt * 1.4, -0.12, 1.1);
    this.camDist = clamp(this.camDist + input.wheel() * 0.004, 4.5, 12);

    if (this.mode === 'car' && this.car) {
      this.updateDriving(dt, input, world);
    } else {
      this.updateOnFoot(dt, input, world);
    }
    this.updateCamera(dt, world.camera);
    // Missions and police read the player's speed for chase logic.
    this.currentSpeed = this.mode === 'car' ? Math.abs(this.car.speed) : this.speed;
  }

  updateDriving(dt, input, world) {
    const car = this.car;
    const throttle = (input.down('KeyW') || input.down('ArrowUp') ? 1 : 0) - (input.down('KeyS') ? 1 : 0);
    const steer = (input.down('KeyA') ? -1 : 0) + (input.down('KeyD') ? 1 : 0);
    const handbrake = input.down('Space');
    car.drive(dt, throttle, steer, handbrake, this.city);
    if (input.pressed('KeyF')) this.exitCar();
    if (input.mouseDown && world.audio) world.audio.horn();
    // Running over pedestrians.
    for (const p of world.crowd.peds) {
      if (p.state === 'dead') continue;
      if (dist2D(car.x, car.z, p.x, p.z) < CAR_RADIUS + 0.4 && Math.abs(car.speed) > 3) {
        const killed = p.damage(100, car.x, car.z);
        car.speed *= 0.82;
        if (killed && world.onPedKilled) world.onPedKilled(p, false);
        if (world.audio) world.audio.thud();
      }
    }
    // Scare nearby peds with a fast car.
    if (Math.abs(car.speed) > 12) world.crowd.scareAll(car.x, car.z, 14);
  }

  updateOnFoot(dt, input, world) {
    // Camera-relative movement.
    const fwd = { x: Math.sin(this.camYaw), z: Math.cos(this.camYaw) };
    const right = { x: fwd.z, z: -fwd.x };
    let mx = 0;
    let mz = 0;
    if (input.down('KeyW')) { mx += fwd.x; mz += fwd.z; }
    if (input.down('KeyS')) { mx -= fwd.x; mz -= fwd.z; }
    if (input.down('KeyD')) { mx += right.x; mz += right.z; }
    if (input.down('KeyA')) { mx -= right.x; mz -= right.z; }
    const moving = Math.hypot(mx, mz) > 0.01;
    const run = input.down('ShiftLeft') || input.down('ShiftRight');
    const targetSpeed = moving ? (run ? RUN_SPEED : WALK_SPEED) : 0;
    this.speed += (targetSpeed - this.speed) * Math.min(1, dt * 8);
    if (moving) {
      const desired = Math.atan2(mx, mz);
      this.heading += clamp(angleDiff(this.heading, desired) * 10 * dt, -3.5 * dt, 3.5 * dt);
      const nx = this.x + Math.sin(this.heading) * this.speed * dt;
      const nz = this.z + Math.cos(this.heading) * this.speed * dt;
      [this.x, this.z] = this.city.resolveCircle(nx, nz, 0.6);
    }
    // Jump + gravity.
    if (input.pressed('Space') && this.y <= 0.01) this.vy = JUMP_VELOCITY;
    this.vy -= GRAVITY * dt;
    this.y += this.vy * dt;
    if (this.y <= 0) {
      this.y = 0;
      this.vy = 0;
    }
    // Walk-cycle animation.
    this.phase += dt * (2 + this.speed * 1.5);
    const swing = Math.sin(this.phase) * clamp(this.speed / 6, 0, 1) * 0.65;
    this.parts.legL.rotation.x = swing;
    this.parts.legR.rotation.x = -swing;
    this.parts.armL.rotation.x = -swing * 0.8;
    this.parts.armR.rotation.x = swing * 0.8;
    this.mesh.position.set(this.x, this.y, this.z);
    this.mesh.rotation.y = this.heading;
    // Enter the nearest car.
    if (input.pressed('KeyF')) {
      let best = null;
      let bestD = 5;
      for (const car of [...world.traffic.all(), ...world.police.cars]) {
        if (car.wrecked) continue;
        const d = dist2D(this.x, this.z, car.x, car.z);
        if (d < bestD) {
          bestD = d;
          best = car;
        }
      }
      if (best) this.enterCar(best, world.onCarStolen);
    }
    // Fire the pistol.
    if (input.mouseDown && this.fireTimer <= 0) {
      this.fireTimer = FIRE_INTERVAL;
      this.shoot(world);
      world.crowd.scareAll(this.x, this.z, 45);
      if (world.audio) world.audio.gunshot();
      if (world.police) world.police.noiseAt(this.x, this.z);
    }
  }

  updateCamera(dt, camera) {
    let target;
    let desiredYaw;
    let desiredPitch;
    let dist;
    if (this.mode === 'car' && this.car) {
      const car = this.car;
      target = new THREE.Vector3(car.x, 2.2, car.z);
      // Chase cam: ease back behind the car; the mouse can swing it around
      // and the easing pulls it back over a second or two.
      const behind = car.heading + Math.PI;
      this.carCamYaw += angleDiff(this.carCamYaw, behind) * Math.min(1, dt * 1.4);
      desiredYaw = this.carCamYaw;
      desiredPitch = 0.42;
      dist = this.camDist + 3.2;
    } else {
      target = new THREE.Vector3(this.x, 1.7 + this.y, this.z);
      desiredYaw = this.camYaw;
      desiredPitch = this.camPitch;
      dist = this.camDist;
    }
    // Pull the camera in when a building blocks the view.
    let useDist = dist;
    for (let d = dist; d > 2.5; d -= 1.2) {
      const px = target.x + Math.sin(desiredYaw) * Math.cos(desiredPitch) * d;
      const pz = target.z + Math.cos(desiredYaw) * Math.cos(desiredPitch) * d;
      if (!this.city.hitsBuilding(px, pz, 0.6)) {
        useDist = d;
        break;
      }
      useDist = 2.5;
    }
    const fx = target.x + Math.sin(desiredYaw) * Math.cos(desiredPitch) * useDist;
    const fy = Math.max(0.9, target.y + Math.sin(desiredPitch) * useDist);
    const fz = target.z + Math.cos(desiredYaw) * Math.cos(desiredPitch) * useDist;
    camera.position.set(fx, fy, fz);
    camera.lookAt(target);
  }

  /** Teleport the player (respawn, mission start). */
  teleport(x, z) {
    if (this.car) {
      this.car.driver = 'parked';
      this.car = null;
    }
    this.mode = 'foot';
    this.x = x;
    this.z = z;
    this.y = 0;
    this.vy = 0;
    this.hp = 100;
    this.dead = false;
    this.mesh.visible = true;
    this.mesh.position.set(x, 0, z);
  }
}
