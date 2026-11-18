// The Solmar Police Department: the wanted system (0–5 stars), foot cops
// who chase and try to bust the player, and pursuit cars that ram.
import * as THREE from 'three';
import { clamp, angleDiff, dist2D } from './rng.js';
import { buildPedMesh } from './peds.js';
import { Car, CAR_RADIUS } from './vehicles.js';

/** One foot cop: runs the player down, shoots at 2+ stars, busts the slow. */
class Cop {
  constructor(scene, x, z, heading, rng) {
    this.scene = scene;
    this.x = x;
    this.z = z;
    this.heading = heading;
    this.rng = rng;
    this.hp = 100;
    this.state = 'chase'; // chase | dead
    this.speed = 0;
    this.phase = rng.f() * Math.PI * 2;
    this.shootTimer = rng.range(0.6, 1.4);
    this.bustTimer = 0;
    this.deadTimer = 0;
    const built = buildPedMesh(0x1a2a6b, 0x141c3a, rng.pick([0xf1c27d, 0x8d5524, 0xe0ac69]));
    this.mesh = built.group;
    this.parts = built;
    // Cop cap: a dark brim on the head.
    const cap = new THREE.Mesh(
      new THREE.BoxGeometry(0.46, 0.1, 0.5),
      new THREE.MeshLambertMaterial({ color: 0x0d1440 }),
    );
    cap.position.y = 2.06;
    this.mesh.add(cap);
    this.mesh.position.set(x, 0, z);
    this.mesh.rotation.y = heading;
    scene.add(this.mesh);
  }

  damage(amount) {
    if (this.state === 'dead') return false;
    this.hp -= amount;
    if (this.hp <= 0) {
      this.state = 'dead';
      this.deadTimer = 30;
      this.mesh.rotation.x = -Math.PI / 2;
      this.mesh.position.y = 0.3;
      return true;
    }
    return false;
  }

  update(dt, city, player, wanted, onShoot, onBust) {
    if (this.state === 'dead') {
      this.deadTimer -= dt;
      return this.deadTimer > 0;
    }
    const d = dist2D(this.x, this.z, player.pos.x, player.pos.z);
    const desired = Math.atan2(player.pos.x - this.x, player.pos.z - this.z);
    const turn = clamp(angleDiff(this.heading, desired) * 6, -3.2, 3.2);
    this.heading += turn * dt;
    // Run at the player; slow to a walk when close enough to grab.
    const targetSpeed = d > 3 ? 8.2 : 0;
    this.speed += (targetSpeed - this.speed) * Math.min(1, dt * 5);
    const f = { x: Math.sin(this.heading), z: Math.cos(this.heading) };
    const nx = this.x + f.x * this.speed * dt;
    const nz = this.z + f.z * this.speed * dt;
    [this.x, this.z] = city.resolveCircle(nx, nz, 0.6);
    this.phase += dt * (2 + this.speed * 1.4);
    const swing = Math.sin(this.phase) * clamp(this.speed / 5, 0, 1) * 0.7;
    this.parts.legL.rotation.x = swing;
    this.parts.legR.rotation.x = -swing;
    this.parts.armL.rotation.x = -swing * 0.8;
    this.parts.armR.rotation.x = swing * 0.8;
    this.mesh.position.set(this.x, 0, this.z);
    this.mesh.rotation.y = this.heading;
    // Bust: standing still next to a cop while wanted gets you caught.
    if (d < 2.6 && player.currentSpeed < 1.5 && player.mode === 'foot') {
      this.bustTimer += dt;
      if (this.bustTimer > 1.6 && onBust) onBust();
    } else {
      this.bustTimer = 0;
    }
    // Shoot at 2+ stars, within range.
    if (wanted >= 2 && d < 40 && d > 4) {
      this.shootTimer -= dt;
      if (this.shootTimer <= 0) {
        this.shootTimer = this.rng.range(1.0, 1.9);
        if (onShoot) onShoot(this, d);
      }
    }
    return true;
  }

  remove() {
    this.scene.remove(this.mesh);
  }
}

export class Police {
  constructor(scene, city, rng) {
    this.scene = scene;
    this.city = city;
    this.rng = rng;
    this.wanted = 0;
    this.cops = [];
    this.cars = [];
    this.calmTimer = 0; // time since the last crime
    this.decayTimer = 0;
    this.onWantedChange = null;
    this.onBusted = null;
    this.spawnTimer = 0;
  }

  addWanted(n, reason) {
    const before = this.wanted;
    this.wanted = clamp(this.wanted + n, 0, 5);
    this.calmTimer = 0;
    this.decayTimer = 0;
    if (this.wanted !== before && this.onWantedChange) this.onWantedChange(this.wanted, reason);
  }

  clearWanted() {
    this.wanted = 0;
    if (this.onWantedChange) this.onWantedChange(0, 'clear');
  }

  /** Is a cop close enough to see a crime at (x, z)? */
  witnessed(x, z, radius = 45) {
    for (const c of this.cops) {
      if (c.state !== 'dead' && dist2D(c.x, c.z, x, z) < radius) return true;
    }
    for (const car of this.cars) {
      if (!car.wrecked && dist2D(car.x, car.z, x, z) < radius) return true;
    }
    return false;
  }

  /** A gunshot draws attention when a cop is in earshot. */
  noiseAt(x, z) {
    if (this.wanted === 0 && this.witnessed(x, z, 60)) this.addWanted(1, 'Shots fired');
    else if (this.wanted > 0) this.calmTimer = 0;
  }

  /** Spawn a foot cop on a road near (but not on top of) the player. */
  spawnCopNear(px, pz) {
    const p = this.city.randomRoadPoint(this.rng);
    let x = p.x;
    let z = p.z;
    // Pull the spawn toward a ring 35–60 units from the player.
    const a = this.rng.angle();
    const r = this.rng.range(35, 60);
    const tx = px + Math.cos(a) * r;
    const tz = pz + Math.sin(a) * r;
    const snapX = Math.round(tx / 60) * 60;
    const snapZ = Math.round(tz / 60) * 60;
    if (this.rng.chance(0.5)) {
      x = snapX;
      z = clamp(tz, -240, 240);
    } else {
      x = clamp(tx, -240, 240);
      z = snapZ;
    }
    const cop = new Cop(this.scene, x, z, this.rng.angle(), this.rng);
    this.cops.push(cop);
    return cop;
  }

  spawnCarNear(px, pz) {
    const a = this.rng.angle();
    const r = this.rng.range(45, 70);
    const tx = clamp(px + Math.cos(a) * r, -240, 240);
    const tz = clamp(pz + Math.sin(a) * r, -240, 240);
    const snapX = Math.round(tx / 60) * 60;
    const snapZ = Math.round(tz / 60) * 60;
    const alongX = this.rng.chance(0.5);
    const car = new Car(
      this.scene,
      alongX ? snapX : tx,
      alongX ? tz : snapZ,
      alongX ? (tz > pz ? 0 : Math.PI) : (tx > px ? Math.PI / 2 : -Math.PI / 2),
      0x141c3a,
      { driver: 'police', police: true, maxSpeed: 34 },
    );
    this.cars.push(car);
    return car;
  }

  /** Pursuit driving: chase the player's position, ramming when close. */
  updatePoliceCar(car, dt, player, allCars) {
    if (car.wrecked) return;
    const target = player.pos;
    // Aim at where the player will be, not where they are.
    const lead = 0.6;
    const px = target.x + (player.mode === 'car' && player.car ? Math.sin(player.car.heading) * player.car.speed * lead : 0);
    const pz = target.z + (player.mode === 'car' && player.car ? Math.cos(player.car.heading) * player.car.speed * lead : 0);
    const desired = Math.atan2(px - car.x, pz - car.z);
    const steer = clamp(angleDiff(car.heading, desired) * 2.4, -1, 1);
    const d = dist2D(car.x, car.z, target.x, target.z);
    let throttle = 0.9;
    if (d < 6) throttle = 0.5; // nose in, keep pushing
    if (player.mode === 'foot' && d < 8) throttle = -0.4; // stop and let the cops out
    car.drive(dt, throttle, steer, false, this.city);
  }

  update(dt, player, world) {
    this.spawnTimer -= dt;
    const px = player.pos.x;
    const pz = player.pos.z;
    // Wanted decay: stay out of sight and the heat cools off.
    if (this.wanted > 0) {
      this.calmTimer += dt;
      if (this.calmTimer > 25 && !this.witnessed(px, pz, 50)) {
        this.decayTimer += dt;
        if (this.decayTimer > 18) {
          this.decayTimer = 0;
          this.addWanted(-1, 'heat off');
        }
      } else {
        this.decayTimer = 0;
      }
    }
    // Keep the right number of cops and cars for the wanted level.
    const wantCops = this.wanted === 0 ? 0 : Math.min(this.wanted, 3);
    const wantCars = this.wanted >= 2 ? Math.min(1 + Math.floor((this.wanted - 1) / 2), 4) : 0;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = 1.2;
      const liveCops = this.cops.filter((c) => c.state !== 'dead').length;
      const liveCars = this.cars.filter((c) => !c.wrecked).length;
      // Foot cops only join when the player is slow enough to catch; a fast
      // driver gets pursuit cars instead.
      if (liveCops < wantCops && player.currentSpeed < 12) this.spawnCopNear(px, pz);
      else if (liveCops > wantCops) {
        const extra = this.cops.find((c) => c.state !== 'dead');
        if (extra) {
          extra.remove();
          this.cops.splice(this.cops.indexOf(extra), 1);
        }
      }
      if (liveCars < wantCars) this.spawnCarNear(px, pz);
      else if (liveCars > wantCars) {
        const extra = this.cars.find((c) => !c.wrecked);
        if (extra) {
          extra.remove();
          this.cars.splice(this.cars.indexOf(extra), 1);
        }
      }
    }
    // Foot cops.
    for (let i = this.cops.length - 1; i >= 0; i--) {
      const cop = this.cops[i];
      const alive = cop.update(dt, this.city, player, this.wanted,
        (c, d) => {
          // Cop fires: hit chance falls with distance.
          if (this.rng.chance(clamp(0.65 - d / 90, 0.15, 0.65))) {
            player.damage(this.rng.range(7, 13));
            if (world.audio) world.audio.hit();
          }
          if (world.audio) world.audio.gunshotFar();
        },
        () => {
          if (this.onBusted) this.onBusted();
        });
      if (!alive) {
        cop.remove();
        this.cops.splice(i, 1);
      }
    }
    // Pursuit cars.
    const allCars = [...world.traffic.all(), ...this.cars];
    for (const car of this.cars) {
      this.updatePoliceCar(car, dt, player, allCars);
      // A stopped pursuit car drops a foot cop.
      if (player.mode === 'foot' && dist2D(car.x, car.z, px, pz) < 9 && Math.abs(car.speed) < 1) {
        const liveCops = this.cops.filter((c) => c.state !== 'dead').length;
        if (liveCops < wantCops + 1 && this.rng.chance(dt * 0.8)) {
          const cop = new Cop(this.scene, car.x + 2, car.z, this.rng.angle(), this.rng);
          this.cops.push(cop);
        }
      }
    }
    world.traffic.collideCars(allCars);
  }
}
