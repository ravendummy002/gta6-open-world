// The wanted system and the Solmar Bay police: cruisers that chase
// and ram, officers on foot who run the player down and make arrests,
// and the heat that fades when the player breaks line of sight.

import { drawCar, makeCar, driveCarPhysics } from './vehicles.js';
import { drawPed, makePed } from './pedestrians.js';
import { hexColor } from './geometry.js';
import { angleDiff, clamp, dist } from './rng.js';

export class Police {
  constructor(city) {
    this.city = city;
    this.wanted = 0; // 0-5 stars
    this.copCars = [];
    this.copPeds = [];
    this.heatTimer = 0; // time since any officer last saw the player
    this.arrestTimer = 0;
    this.crimeCooldowns = {};
    this.evading = false; // stars blink while the player is losing them
    this.spawnTimer = 0;
  }

  addCrime(stars, reason) {
    // Same crime twice in four seconds only counts once, so one
    // joyride does not jump straight to five stars.
    if ((this.crimeCooldowns[reason] || 0) > 0) return;
    this.crimeCooldowns[reason] = 4;
    this.wanted = Math.min(5, this.wanted + stars);
    this.heatTimer = 0;
    this.evading = false;
  }

  setWanted(n) {
    this.wanted = clamp(n, 0, 5);
    this.heatTimer = 0;
    this.evading = false;
  }

  clearWanted() {
    this.wanted = 0;
    this.evading = false;
    this.arrestTimer = 0;
  }

  update(dt, game) {
    for (const key of Object.keys(this.crimeCooldowns)) {
      this.crimeCooldowns[key] -= dt;
    }
    const player = game.player;
    const px = player.x;
    const pz = player.z;

    // Force scales with the wanted level.
    const wantCars = this.wanted === 0 ? 0 : Math.min(1 + Math.floor(this.wanted / 2), 3);
    const wantPeds = this.wanted === 0 || player.car ? 0 : Math.min(this.wanted + 1, 4);

    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = 1.2;
      if (this.copCars.length < wantCars) this.spawnCopCar(game);
      if (this.copPeds.length < wantPeds) this.spawnCopPed(game);
    }
    // When the heat is off, distant officers give up and leave.
    if (this.wanted === 0) {
      this.copCars = this.copCars.filter((c) => c.driver === 'player' || dist(c.x, c.z, px, pz) < 120);
      this.copPeds = this.copPeds.filter((p) => dist(p.x, p.z, px, pz) < 120);
    }

    // Cruiser chase AI: aim at where the player will be, and ram.
    for (const cop of this.copCars) {
      if (cop.driver === 'player') continue; // stolen cruiser: not police any more
      const d = dist(cop.x, cop.z, px, pz);
      const playerSpeed = player.car ? player.car.speed : player.speed;
      const lead = player.car ? 0.6 : 0.2;
      const tx = px + Math.sin(player.heading) * playerSpeed * lead;
      const tz = pz + Math.cos(player.heading) * playerSpeed * lead;
      const targetHeading = Math.atan2(tx - cop.x, tz - cop.z);
      const steer = clamp(angleDiff(cop.heading, targetHeading) * 2.2, -1, 1);
      driveCarPhysics(cop, d > 6 ? 1 : 0.4, steer, false, dt, this.city, game.allCars());
      cop.speed = Math.min(cop.speed, 19 + this.wanted * 2.5);
      // An officer bails out when the cruiser corners a player on foot.
      if (!player.car && d < 7 && this.copPeds.length < wantPeds + 2 && Math.random() < dt * 0.5) {
        this.spawnCopPed(game, cop.x, cop.z);
      }
    }

    // Officers on foot run the player down.
    let nearestCopDist = Infinity;
    for (const ped of this.copPeds) {
      const d = dist(ped.x, ped.z, px, pz);
      nearestCopDist = Math.min(nearestCopDist, d);
      const targetHeading = Math.atan2(px - ped.x, pz - ped.z);
      const turn = angleDiff(ped.heading, targetHeading);
      ped.heading += turn * Math.min(1, dt * 8);
      ped.speed = d > 1.6 ? 5.6 : 0;
      ped.x += Math.sin(ped.heading) * ped.speed * dt;
      ped.z += Math.cos(ped.heading) * ped.speed * dt;
      const fixed = this.city.collideCircle(ped.x, ped.z, 0.45);
      ped.x = fixed.x;
      ped.z = fixed.z;
      ped.walkPhase += ped.speed * dt * 2.6;
      // Arrest: an officer standing next to a slow player fills the meter.
      const playerSpeed = player.car ? Math.abs(player.car.speed) : player.speed;
      if (d < 2.0 && playerSpeed < 1.5) {
        this.arrestTimer += dt;
      }
    }
    for (const cop of this.copCars) {
      if (cop.driver === 'player') continue;
      nearestCopDist = Math.min(nearestCopDist, dist(cop.x, cop.z, px, pz));
    }
    // Boxed in: crawling in a car with cruisers pressing in.
    if (player.car && Math.abs(player.car.speed) < 1) {
      let close = 0;
      for (const cop of this.copCars) {
        if (cop.driver !== 'player' && dist(cop.x, cop.z, px, pz) < 7) close++;
      }
      if (close >= 2) this.arrestTimer += dt;
    }
    if (this.arrestTimer > 2.2) {
      this.arrestTimer = 0;
      game.busted();
      return;
    }
    if (nearestCopDist > 4) {
      this.arrestTimer = Math.max(0, this.arrestTimer - dt * 2);
    }

    // Evading: stay out of sight and the heat drops a star at a time.
    if (this.wanted > 0) {
      if (nearestCopDist > 55) {
        this.heatTimer += dt;
        this.evading = true;
        if (this.heatTimer > 8) {
          this.wanted -= 1;
          this.heatTimer = 0;
          this.evading = false;
        }
      } else {
        this.heatTimer = 0;
        this.evading = false;
      }
    }

    // Sirens swell as the nearest cruiser closes in.
    const sirenNear = nearestCopDist === Infinity ? 0 : clamp(1 - nearestCopDist / 90, 0, 1);
    game.audio.setSiren(this.copCars.length > 0 && this.wanted > 0, sirenNear);
  }

  spawnCopCar(game) {
    const player = game.player;
    for (let tries = 0; tries < 8; tries++) {
      const pt = this.city.randomRoadPoint(Math.random);
      const d = dist(pt.x, pt.z, player.x, player.z);
      if (d > 40 && d < 75) {
        const heading = Math.atan2(player.x - pt.x, player.z - pt.z);
        this.copCars.push(makeCar('cop', '#f2f4f6', pt.x, pt.z, heading, 'cop'));
        return;
      }
    }
    this.copCars.push(makeCar('cop', '#f2f4f6', player.x + 30, player.z, Math.PI / 2, 'cop'));
  }

  spawnCopPed(game, x, z) {
    const player = game.player;
    let sx = x;
    let sz = z;
    if (sx === undefined) {
      const pt = this.city.randomSidewalkPoint(Math.random);
      sx = pt.x;
      sz = pt.z;
      if (dist(sx, sz, player.x, player.z) < 15) {
        sx = player.x + 25;
        sz = player.z + 5;
      }
    }
    const ped = makePed(sx, sz, Math.atan2(player.x - sx, player.z - sz), Math.random, {
      shirt: hexColor('#2f6fd0'),
      pants: hexColor('#1a252f'),
      gun: true,
      isCop: true,
    });
    this.copPeds.push(ped);
  }

  draw(geom, time) {
    for (const car of this.copCars) drawCar(geom, car, time);
    for (const ped of this.copPeds) drawPed(geom, ped, time);
  }
}
