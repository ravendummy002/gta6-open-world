// Pistol combat: hitscan shooting from the crosshair, tracers,
// impact particles, and the goons shooting back. Shooting where an
// officer can see it is a crime; shooting people always is.

import { damagePed } from './pedestrians.js';
import { clamp } from './rng.js';

export class Combat {
  constructor() {
    this.ammo = 12;
    this.magSize = 12;
    this.cooldown = 0;
    this.reloadTimer = 0;
    this.tracers = []; // {from, to, life}
    this.particles = []; // {x, y, z, vx, vy, vz, life, color, size}
    this.muzzleTimer = 0;
    this.muzzlePos = { x: 0, y: 1.3, z: 0 };
  }

  update(dt, game) {
    this.cooldown -= dt;
    if (this.reloadTimer > 0) {
      this.reloadTimer -= dt;
      if (this.reloadTimer <= 0) this.ammo = this.magSize;
    }
    this.muzzleTimer -= dt;
    for (const t of this.tracers) t.life -= dt;
    this.tracers = this.tracers.filter((t) => t.life > 0);
    for (const p of this.particles) {
      p.life -= dt;
      p.vy -= 12 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      if (p.y < 0.05) {
        p.y = 0.05;
        p.vy *= -0.3;
      }
    }
    this.particles = this.particles.filter((p) => p.life > 0);

    if (game.state !== 'playing') return;
    if (!game.player.onFoot || game.player.health <= 0) return;
    if (game.input.mousePressed || game.input.wasPressed('KeyF')) {
      this.tryShoot(game);
    }
    if (game.input.wasPressed('KeyR')) this.reload(game);
  }

  reload(game) {
    if (this.reloadTimer <= 0 && this.ammo < this.magSize) {
      this.reloadTimer = 1.1;
      game.audio.reload();
    }
  }

  tryShoot(game) {
    if (this.cooldown > 0 || this.reloadTimer > 0) return;
    if (this.ammo <= 0) {
      this.reload(game);
      return;
    }
    this.ammo--;
    this.cooldown = 0.22;
    this.muzzleTimer = 0.06;
    game.audio.shot();
    const player = game.player;
    const ray = game.cameraRay();
    const mx = player.x + Math.sin(player.heading) * 0.4;
    const mz = player.z + Math.cos(player.heading) * 0.4;
    this.muzzlePos = { x: mx, y: 1.35, z: mz };
    const hit = this.raycast(game, ray.origin, ray.dir, 90);
    const end = hit
      ? hit.point
      : {
          x: ray.origin.x + ray.dir.x * 90,
          y: ray.origin.y + ray.dir.y * 90,
          z: ray.origin.z + ray.dir.z * 90,
        };
    this.tracers.push({ from: { ...this.muzzlePos }, to: end, life: 0.07 });
    // Gunfire sends nearby pedestrians running.
    game.addDanger(player.x, player.z, 26, 1.5);
    if (hit) {
      this.burst(hit.point.x, hit.point.y, hit.point.z, [1, 0.85, 0.4], 8, 3.5);
      if (hit.type === 'ped') {
        const result = damagePed(hit.obj, 34, game);
        game.audio.hit();
        if (result === 'dead') {
          game.police.addCrime(hit.obj.isCop ? 2 : 1, 'kill');
        } else if (result === 'down') {
          game.police.addCrime(1, 'shooting');
        }
      } else if (hit.type === 'goon') {
        const result = damagePed(hit.obj, 34, game);
        game.audio.hit();
        if (result === 'dead') game.missions.onGoonDown(hit.obj);
      } else if (hit.type === 'car') {
        if (game.nearestCopDist() < 40) game.police.addCrime(1, 'shooting');
      }
    } else if (game.nearestCopDist() < 40) {
      game.police.addCrime(1, 'shooting');
    }
  }

  // Nearest hit along a ray: people, goons, cars, buildings, ground.
  raycast(game, origin, dir, maxDist) {
    let best = null;
    const consider = (t, type, obj) => {
      if (t > 0.5 && t < maxDist && (!best || t < best.t)) {
        best = {
          t,
          type,
          obj,
          point: {
            x: origin.x + dir.x * t,
            y: origin.y + dir.y * t,
            z: origin.z + dir.z * t,
          },
        };
      }
    };
    const testPerson = (p, type) => {
      if (p.state === 'dead' || p.state === 'down') return;
      const cx = p.x - origin.x;
      const cy = 1.2 - origin.y;
      const cz = p.z - origin.z;
      const proj = cx * dir.x + cy * dir.y + cz * dir.z;
      if (proj < 0) return;
      const d2 = cx * cx + cy * cy + cz * cz - proj * proj;
      if (d2 < 0.81) consider(proj, type, p);
    };
    for (const p of game.peds.peds) testPerson(p, 'ped');
    for (const p of game.police.copPeds) testPerson(p, 'ped');
    for (const g of game.missions.goons) testPerson(g, 'goon');
    for (const car of game.allCars()) {
      const dx = car.x - origin.x;
      const dz = car.z - origin.z;
      const proj = dx * dir.x + dz * dir.z;
      if (proj < 0) continue;
      const px = origin.x + dir.x * proj;
      const pz = origin.z + dir.z * proj;
      const py = origin.y + dir.y * proj;
      const ddx = px - car.x;
      const ddz = pz - car.z;
      if (ddx * ddx + ddz * ddz < 2.3 * 2.3 && py > 0 && py < 1.8) {
        consider(proj, 'car', car);
      }
    }
    // Buildings: slab test against each solid's box.
    for (const s of game.city.solids) {
      const t = rayBox(origin, dir, s.minX, 0, s.minZ, s.maxX, s.h || 12, s.maxZ);
      if (t !== null) consider(t, 'building', s);
    }
    // The ground plane.
    if (dir.y < -0.001) {
      const t = -origin.y / dir.y;
      if (t > 0.5 && t < maxDist) consider(t, 'ground', null);
    }
    return best;
  }

  // A goon fires at the player: tracer, distant crack, damage roll.
  // No line of sight, no shot: a building between goon and player
  // blocks the bullet, so cover actually works.
  goonShoot(game, goon) {
    const player = game.player;
    const from = { x: goon.x, y: 1.3, z: goon.z };
    const d = Math.hypot(player.x - goon.x, player.z - goon.z);
    const dir = {
      x: (player.x - goon.x) / (d || 1),
      y: 0,
      z: (player.z - goon.z) / (d || 1),
    };
    for (const s of game.city.solids) {
      const t = rayBox(from, dir, s.minX, 0, s.minZ, s.maxX, s.h || 12, s.maxZ);
      if (t !== null && t < d) return;
    }
    const spread = 1.2 + d * 0.04;
    const to = {
      x: player.x + (Math.random() - 0.5) * spread * 2,
      y: 1.2,
      z: player.z + (Math.random() - 0.5) * spread * 2,
    };
    this.tracers.push({ from, to, life: 0.07 });
    game.audio.distantShot();
    const hitChance = clamp(0.42 - d * 0.006, 0.08, 0.42);
    if (Math.random() < hitChance) {
      player.hurt(6 + Math.random() * 5, game);
      this.burst(player.x, 1.3, player.z, [1, 0.3, 0.2], 6, 3);
    } else {
      this.burst(to.x, 0.2, to.z, [0.8, 0.75, 0.6], 3, 1.5);
    }
  }

  burst(x, y, z, color, n, speed) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.3 + Math.random() * 0.7);
      this.particles.push({
        x,
        y,
        z,
        vx: Math.cos(a) * s,
        vy: Math.random() * speed,
        vz: Math.sin(a) * s,
        life: 0.4 + Math.random() * 0.4,
        color,
        size: 0.09 + Math.random() * 0.08,
      });
    }
    if (this.particles.length > 300) {
      this.particles.splice(0, this.particles.length - 300);
    }
  }

  draw(geom, time, game) {
    for (const t of this.tracers) {
      const dx = t.to.x - t.from.x;
      const dy = t.to.y - t.from.y;
      const dz = t.to.z - t.from.z;
      const len = Math.hypot(dx, dy, dz);
      if (len < 0.1) continue;
      const mx = (t.from.x + t.to.x) / 2;
      const my = (t.from.y + t.to.y) / 2;
      const mz = (t.from.z + t.to.z) / 2;
      const ry = Math.atan2(dx, dz);
      const rx = -Math.asin(clamp(dy / len, -1, 1));
      geom.box(mx, my, mz, 0.06, 0.06, len, [1, 0.9, 0.5], ry, rx, 0);
    }
    for (const p of this.particles) {
      const fade = clamp(p.life / 0.4, 0, 1);
      geom.box(p.x, p.y, p.z, p.size, p.size, p.size, [p.color[0], p.color[1], p.color[2], fade], 0);
    }
    if (this.muzzleTimer > 0 && game && game.player.onFoot) {
      const m = this.muzzlePos;
      geom.box(m.x, m.y, m.z, 0.22, 0.22, 0.3, [1, 0.85, 0.3], game.player.heading);
    }
  }
}

// Ray vs axis-aligned box (slab method). Returns the entry distance
// or null when the ray misses.
function rayBox(o, d, minX, minY, minZ, maxX, maxY, maxZ) {
  let tmin = 0;
  let tmax = Infinity;
  const axes = [
    [o.x, d.x, minX, maxX],
    [o.y, d.y, minY, maxY],
    [o.z, d.z, minZ, maxZ],
  ];
  for (const [origin, dir, lo, hi] of axes) {
    if (Math.abs(dir) < 1e-8) {
      if (origin < lo || origin > hi) return null;
    } else {
      let t1 = (lo - origin) / dir;
      let t2 = (hi - origin) / dir;
      if (t1 > t2) {
        const tmp = t1;
        t1 = t2;
        t2 = tmp;
      }
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) return null;
    }
  }
  return tmin;
}
