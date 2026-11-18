// Pedestrians for Solmar: stylised walkers who stroll the sidewalks, flee
// from gunfire and fast cars, and (in missions) fight back as gang members.
import * as THREE from 'three';
import { clamp, angleDiff, dist2D } from './rng.js';
import { ROADS, PITCH, GRID } from './city.js';

const SHIRTS = [0xd95f43, 0x2e7f86, 0xe9b44c, 0x7a5ea8, 0x4a90d9, 0xdddddd, 0x8bc34a, 0xf06292];
const PANTS = [0x2c3e50, 0x5d4037, 0x37474f, 0x4e342e, 0x1a1a2e];
const SKINS = [0xf1c27d, 0xe0ac69, 0xc68642, 0x8d5524, 0xffdbac];

/** Build a low-poly person. Forward is local +Z. Returns { group, legL, legR, armL, armR }. */
export function buildPedMesh(shirt, pants, skin) {
  const g = new THREE.Group();
  const shirtMat = new THREE.MeshLambertMaterial({ color: shirt });
  const pantsMat = new THREE.MeshLambertMaterial({ color: pants });
  const skinMat = new THREE.MeshLambertMaterial({ color: skin });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.75, 0.34), shirtMat);
  torso.position.y = 1.18;
  torso.castShadow = true;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.42), skinMat);
  head.position.y = 1.78;
  head.castShadow = true;
  const hair = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.16, 0.44), new THREE.MeshLambertMaterial({ color: 0x2b1d12 }));
  hair.position.y = 2.02;
  const legGeo = new THREE.BoxGeometry(0.24, 0.8, 0.28);
  legGeo.translate(0, -0.4, 0);
  const legL = new THREE.Mesh(legGeo, pantsMat);
  legL.position.set(-0.17, 0.82, 0);
  const legR = new THREE.Mesh(legGeo, pantsMat);
  legR.position.set(0.17, 0.82, 0);
  const armGeo = new THREE.BoxGeometry(0.18, 0.7, 0.22);
  armGeo.translate(0, -0.35, 0);
  const armL = new THREE.Mesh(armGeo, shirtMat);
  armL.position.set(-0.42, 1.5, 0);
  const armR = new THREE.Mesh(armGeo, shirtMat);
  armR.position.set(0.42, 1.5, 0);
  g.add(torso, head, hair, legL, legR, armL, armR);
  return { group: g, legL, legR, armL, armR };
}

export class Ped {
  constructor(scene, x, z, heading, rng, opts = {}) {
    this.scene = scene;
    this.x = x;
    this.z = z;
    this.heading = heading;
    this.rng = rng;
    this.hp = opts.hp ?? 100;
    this.hostile = !!opts.hostile;
    this.state = 'walk'; // walk | flee | dead | fight
    this.speed = 0;
    this.phase = rng.f() * Math.PI * 2;
    this.waypoint = null;
    this.fleeFrom = null;
    this.fleeTimer = 0;
    this.shootTimer = rng.range(0.5, 1.5);
    this.deadTimer = 0;
    const built = buildPedMesh(
      opts.shirt ?? rng.pick(SHIRTS),
      opts.pants ?? rng.pick(PANTS),
      opts.skin ?? rng.pick(SKINS),
    );
    this.mesh = built.group;
    this.parts = built;
    this.mesh.position.set(x, 0, z);
    this.mesh.rotation.y = heading;
    scene.add(this.mesh);
  }

  get forward() {
    return { x: Math.sin(this.heading), z: Math.cos(this.heading) };
  }

  /** Scare this ped away from a point (gunshot, near-miss). */
  scare(x, z) {
    if (this.state === 'dead' || this.hostile) return;
    this.state = 'flee';
    this.fleeFrom = { x, z };
    this.fleeTimer = 4;
  }

  damage(amount, fromX, fromZ) {
    if (this.state === 'dead') return false;
    this.hp -= amount;
    if (this.hp <= 0) {
      this.state = 'dead';
      this.deadTimer = 45;
      this.mesh.rotation.x = -Math.PI / 2;
      this.mesh.position.y = 0.3;
      return true;
    }
    if (!this.hostile) this.scare(fromX, fromZ);
    return false;
  }

  /** Walk the sidewalks; flee when scared; hostiles chase and shoot. */
  update(dt, city, playerPos, onShoot) {
    if (this.state === 'dead') {
      this.deadTimer -= dt;
      return this.deadTimer > 0;
    }
    let targetSpeed = 0;
    let desired = this.heading;
    if (this.state === 'flee') {
      this.fleeTimer -= dt;
      if (this.fleeTimer <= 0) {
        this.state = 'walk';
        this.waypoint = null;
      } else {
        desired = Math.atan2(this.x - this.fleeFrom.x, this.z - this.fleeFrom.z);
        targetSpeed = 7;
      }
    } else if (this.hostile && playerPos) {
      // Gang member: close in and shoot at the player.
      const d = dist2D(this.x, this.z, playerPos.x, playerPos.z);
      desired = Math.atan2(playerPos.x - this.x, playerPos.z - this.z);
      targetSpeed = d > 14 ? 6.5 : 0;
      this.state = 'fight';
      this.shootTimer -= dt;
      if (this.shootTimer <= 0 && d < 45) {
        this.shootTimer = this.rng.range(0.9, 1.8);
        if (onShoot) onShoot(this);
      }
    } else {
      // Stroll: waypoint 20 units ahead along the sidewalk; turn at corners.
      if (!this.waypoint) {
        const f = this.forward;
        this.waypoint = { x: this.x + f.x * 20, z: this.z + f.z * 20 };
      }
      const wp = this.waypoint;
      if (dist2D(this.x, this.z, wp.x, wp.z) < 2.5) {
        this.waypoint = null;
        const nearX = Math.round(this.x / PITCH) * PITCH;
        const nearZ = Math.round(this.z / PITCH) * PITCH;
        if (Math.abs(this.x - nearX) < 12 && Math.abs(this.z - nearZ) < 12 && this.rng.chance(0.4)) {
          const turn = this.rng.pick([-Math.PI / 2, Math.PI / 2, Math.PI]);
          const nh = this.heading + turn;
          this.waypoint = { x: this.x + Math.sin(nh) * 20, z: this.z + Math.cos(nh) * 20 };
        } else {
          const f = this.forward;
          this.waypoint = { x: this.x + f.x * 20, z: this.z + f.z * 20 };
        }
        return true;
      }
      desired = Math.atan2(wp.x - this.x, wp.z - this.z);
      targetSpeed = 2.2;
    }
    // Turn toward the desired heading, then move.
    const turn = clamp(angleDiff(this.heading, desired) * 6, -3.2, 3.2);
    this.heading += turn * dt;
    this.speed += (targetSpeed - this.speed) * Math.min(1, dt * 5);
    const f = this.forward;
    const nx = this.x + f.x * this.speed * dt;
    const nz = this.z + f.z * this.speed * dt;
    const [rx, rz] = city.resolveCircle(nx, nz, 0.6);
    this.x = clamp(rx, -GRID * PITCH - 4, 340);
    this.z = clamp(rz, -GRID * PITCH - 4, GRID * PITCH + 4);
    // Walk-cycle animation.
    this.phase += dt * (2 + this.speed * 1.4);
    const swing = Math.sin(this.phase) * clamp(this.speed / 5, 0, 1) * 0.7;
    this.parts.legL.rotation.x = swing;
    this.parts.legR.rotation.x = -swing;
    this.parts.armL.rotation.x = -swing * 0.8;
    this.parts.armR.rotation.x = swing * 0.8;
    this.mesh.position.set(this.x, 0, this.z);
    this.mesh.rotation.y = this.heading;
    return true;
  }

  remove() {
    this.scene.remove(this.mesh);
  }
}

/** Crowd manager: keeps the sidewalks populated around the player. */
export class Crowd {
  constructor(scene, city, rng, count = 22) {
    this.scene = scene;
    this.city = city;
    this.rng = rng;
    this.peds = [];
    for (let i = 0; i < count; i++) this.spawn();
  }

  /** A sidewalk spot near (x, z) when given, anywhere in the city otherwise. */
  spawnNear(x, z, radius = 120) {
    const road = this.rng.pick(ROADS);
    const side = this.rng.pick([-10.5, 10.5]);
    const along = (x !== undefined && z !== undefined)
      ? (road.axis === 'x' ? x : z) + this.rng.range(-radius, radius)
      : this.rng.range(-240, 240);
    const clamped = Math.max(-240, Math.min(240, along));
    return road.axis === 'x'
      ? { x: clamped, z: road.at + side }
      : { x: road.at + side, z: clamped };
  }

  spawn() {
    const p = this.spawnNear();
    const heading = this.rng.angle();
    const ped = new Ped(this.scene, p.x, p.z, heading, this.rng);
    this.peds.push(ped);
    return ped;
  }

  /** Scare every ped within radius of a point (gunfire, crash). */
  scareAll(x, z, radius) {
    for (const p of this.peds) {
      if (dist2D(p.x, p.z, x, z) < radius) p.scare(x, z);
    }
  }

  update(dt, playerPos, onShoot) {
    for (let i = this.peds.length - 1; i >= 0; i--) {
      const p = this.peds[i];
      const alive = p.update(dt, this.city, playerPos, onShoot);
      if (!alive) {
        p.remove();
        this.peds.splice(i, 1);
        this.spawn();
        continue;
      }
      // Recycle peds far from the player, respawning near them.
      if (playerPos && p.state !== 'dead' && dist2D(p.x, p.z, playerPos.x, playerPos.z) > 220) {
        const spot = this.spawnNear(playerPos.x, playerPos.z, 120);
        p.x = spot.x;
        p.z = spot.z;
        p.waypoint = null;
        p.state = 'walk';
      }
    }
  }
}
