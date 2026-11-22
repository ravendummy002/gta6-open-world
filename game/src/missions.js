// The story: four missions for Riko Vale, a driver new in Solmar Bay.
// Rico runs the garage and wants wheels; Lena runs the jobs and wants
// nerve. Each mission is a small state machine with a glowing marker,
// dialogue and a cash reward.

import { makeCar, drawCar } from './vehicles.js';
import { makePed, drawPed } from './pedestrians.js';
import { hexColor } from './geometry.js';
import { dist } from './rng.js';

export const MISSION_DEFS = [
  { id: 'm1', title: 'First Wheels', giver: 'Rico', reward: 500 },
  { id: 'm2', title: 'The Drop', giver: 'Lena', reward: 800 },
  { id: 'm3', title: 'Heat on the Pier', giver: 'Rico', reward: 1200 },
  { id: 'm4', title: 'The Big Score', giver: 'Lena', reward: 2500 },
];

const MARKER_YELLOW = [1, 0.82, 0.2];
const MARKER_GREEN = [0.3, 0.9, 0.4];

const GOON_SPOTS = [
  { x: 0, z: 244 },
  { x: 3, z: 256 },
  { x: -3, z: 266 },
  { x: 2, z: 280 },
  { x: -2, z: 290 },
];

export class Missions {
  constructor(game) {
    this.game = game;
    this.done = 0; // index of the next mission
    this.active = null; // {def, step, missionCar}
    this.marker = null; // {x, z, radius, label, color}
    this.objectiveText = '';
    this.cars = [];
    this.goons = [];
    this.holdTimer = 0;
  }

  get storyComplete() {
    return this.done >= MISSION_DEFS.length;
  }

  // Rico waits at his garage; Lena waits at the plaza fountain.
  startPoint(index) {
    const lm = this.game.city.landmarks;
    const def = MISSION_DEFS[index];
    if (def.giver === 'Rico') return { ...lm.garageDoor, name: "Rico's Garage" };
    return { ...lm.plaza, name: 'Plaza Fountain' };
  }

  update(dt, game) {
    if (this.storyComplete) {
      this.objectiveText = 'Story complete — Solmar Bay is yours. Free roam!';
      this.marker = null;
      return;
    }
    if (!this.active) {
      const def = MISSION_DEFS[this.done];
      const start = this.startPoint(this.done);
      this.objectiveText = `Meet ${def.giver} — ${def.title}`;
      this.marker = { x: start.x, z: start.z, radius: 4, label: def.giver, color: MARKER_YELLOW };
      if (dist(game.player.x, game.player.z, start.x, start.z) < 4) {
        this.startMission(this.done, game);
      }
      return;
    }
    const id = this.active.def.id;
    if (id === 'm1') this.updateM1(dt, game);
    else if (id === 'm2') this.updateM2(dt, game);
    else if (id === 'm3') this.updateM3(dt, game);
    else if (id === 'm4') this.updateM4(dt, game);
    this.updateGoons(dt, game);
  }

  say(who, text) {
    this.game.hud.say(who, text);
  }

  setObjective(text, x, z, radius, color) {
    this.objectiveText = text;
    this.marker = { x, z, radius, label: '', color: color || MARKER_YELLOW };
  }

  startMission(index, game) {
    const def = MISSION_DEFS[index];
    this.active = { def, step: 0, missionCar: null };
    game.hud.banner(def.title, `${def.giver} has a job for you`, 3);
    game.audio.click();
    const lm = game.city.landmarks;
    if (def.id === 'm1') {
      const spot = lm.missionCarSpot;
      const car = makeCar('sport', '#d94f3d', spot.x, spot.z, spot.heading, 'parked');
      this.cars.push(car);
      this.active.missionCar = car;
      this.setObjective('Steal the Vortex GT parked by the plaza', spot.x, spot.z, 4);
      this.say('Rico', "Riko! Fresh meat. There's a Vortex GT parked by the plaza — bring it to my garage and I'll make it worth your while.");
    } else if (def.id === 'm2') {
      this.setObjective('Meet the courier at the end of the pier', lm.pierEnd.x, lm.pierEnd.z, 4);
      this.say('Lena', 'My courier is waiting at the end of the pier. Take the package, drop it northside. And Riko — the cops are watching the pier tonight.');
    } else if (def.id === 'm3') {
      this.setObjective('Go to the pier', lm.pierStart.x, lm.pierStart.z, 5);
      this.say('Rico', "Dario's crew took my pier. They think they own the waterfront. Go remind them who runs Solmar.");
    } else if (def.id === 'm4') {
      this.setObjective('Go to Solmar Bank', lm.bankDoor.x, lm.bankDoor.z, 5);
      this.say('Lena', 'Solmar Bank. The vault needs six seconds of courage. Grab the cash, lose the heat, meet me at the safehouse.');
    }
  }

  updateM1(dt, game) {
    const a = this.active;
    const car = a.missionCar;
    if (a.step === 0) {
      this.marker.x = car.x;
      this.marker.z = car.z;
      if (game.player.car === car) {
        a.step = 1;
        this.say('Riko', 'Got the car. Garage time.');
        const g = game.city.landmarks.garageDoor;
        this.setObjective("Deliver the Vortex GT to Rico's garage", g.x, g.z, 5, MARKER_GREEN);
      }
    } else if (a.step === 1) {
      const g = game.city.landmarks.garageDoor;
      if (game.player.car === car && dist(game.player.x, game.player.z, g.x, g.z) < 5) {
        this.say('Rico', 'Beautiful. She purrs like a kitten. Here is your cut, kid.');
        this.completeMission(game);
      }
    }
  }

  updateM2(dt, game) {
    const a = this.active;
    const lm = game.city.landmarks;
    if (a.step === 0) {
      if (dist(game.player.x, game.player.z, lm.pierEnd.x, lm.pierEnd.z) < 4) {
        a.step = 1;
        this.say('Courier', "Package is yours. Don't open it, don't drop it, don't get caught.");
        game.police.addCrime(1, 'drop');
        game.hud.toast('The cops are onto you — 1 star');
        this.setObjective('Deliver the package to the northside drop', lm.dropPoint.x, lm.dropPoint.z, 5, MARKER_GREEN);
      }
    } else if (a.step === 1) {
      if (dist(game.player.x, game.player.z, lm.dropPoint.x, lm.dropPoint.z) < 5) {
        this.say('Lena', 'Clean delivery. The client is happy, and so am I.');
        this.completeMission(game);
      }
    }
  }

  updateM3(dt, game) {
    const a = this.active;
    if (a.step === 0) {
      const lm = game.city.landmarks;
      if (dist(game.player.x, game.player.z, lm.pierStart.x, lm.pierStart.z) < 6) {
        a.step = 1;
        this.spawnGoons(game);
        this.say('Rico', 'There they are. Clear the pier, Riko — all five of them.');
        this.setObjective('Clear the pier — 5 hostiles left', 0, 268, 6, MARKER_YELLOW);
      }
    } else if (a.step === 1) {
      const alive = this.goons.filter((g) => g.state !== 'dead').length;
      this.objectiveText = `Clear the pier — ${alive} hostile${alive === 1 ? '' : 's'} left`;
      if (alive === 0) {
        this.say('Rico', "Pier's quiet again. That's how you do business in this town.");
        this.completeMission(game);
      }
    }
  }

  updateM4(dt, game) {
    const a = this.active;
    const lm = game.city.landmarks;
    if (a.step === 0) {
      if (dist(game.player.x, game.player.z, lm.bankDoor.x, lm.bankDoor.z) < 5) {
        a.step = 1;
        this.holdTimer = 0;
        this.say('Lena', 'You are in. Hold the vault — six seconds!');
        this.setObjective('Hold the vault — stay in the marker', lm.bankDoor.x, lm.bankDoor.z, 4);
      }
    } else if (a.step === 1) {
      const inside = dist(game.player.x, game.player.z, lm.bankDoor.x, lm.bankDoor.z) < 4;
      if (inside) this.holdTimer += dt;
      this.objectiveText = `Hold the vault — ${Math.max(0, 6 - this.holdTimer).toFixed(1)}s`;
      if (this.holdTimer >= 6) {
        a.step = 2;
        game.police.setWanted(3);
        game.hud.toast('ALARM! 3 stars — run!');
        this.say('Lena', "Alarm's screaming! Three stars, Riko — get to the safehouse NOW!");
        this.setObjective('Escape to the safehouse', lm.safehouseDoor.x, lm.safehouseDoor.z, 5, MARKER_GREEN);
      }
    } else if (a.step === 2) {
      if (dist(game.player.x, game.player.z, lm.safehouseDoor.x, lm.safehouseDoor.z) < 5) {
        this.say('Lena', 'You made it. The score is ours — Solmar will remember this night.');
        this.completeMission(game);
      }
    }
  }

  spawnGoons(game) {
    this.goons = GOON_SPOTS.map((spot) => {
      const ped = makePed(spot.x, spot.z, Math.PI, Math.random, {
        shirt: hexColor('#7a1f1f'),
        pants: hexColor('#1a1a1a'),
        gun: true,
      });
      ped.shootTimer = 0.8 + Math.random() * 1.2;
      ped.strafeTimer = 1;
      ped.strafeDir = 1;
      return ped;
    });
  }

  updateGoons(dt, game) {
    const player = game.player;
    for (const goon of this.goons) {
      if (goon.state === 'dead' || goon.state === 'down') continue;
      const d = dist(goon.x, goon.z, player.x, player.z);
      const targetHeading = Math.atan2(player.x - goon.x, player.z - goon.z);
      let diff = targetHeading - goon.heading;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      goon.heading += diff * Math.min(1, dt * 5);
      // Sidestep along the pier so they are not standing targets.
      goon.strafeTimer -= dt;
      if (goon.strafeTimer <= 0) {
        goon.strafeTimer = 1 + Math.random();
        goon.strafeDir = Math.random() > 0.5 ? 1 : -1;
      }
      const px = Math.cos(goon.heading) * goon.strafeDir;
      const pz = -Math.sin(goon.heading) * goon.strafeDir;
      goon.x += px * 0.9 * dt;
      goon.z += pz * 0.9 * dt;
      const fixed = game.city.collideCircle(goon.x, goon.z, 0.45);
      goon.x = fixed.x;
      goon.z = fixed.z;
      goon.walkPhase += dt * 2;
      goon.shootTimer -= dt;
      if (d < 48 && goon.shootTimer <= 0) {
        goon.shootTimer = 1.3 + Math.random() * 0.9;
        game.combat.goonShoot(game, goon);
      }
    }
  }

  onGoonDown(goon) {
    // Completion is checked in updateM3 by counting the living.
  }

  completeMission(game) {
    const def = this.active.def;
    game.addCash(def.reward);
    game.hud.banner('Mission complete', `${def.title} — +$${def.reward}`, 3.5);
    game.audio.missionDone();
    game.combat.burst(game.player.x, 2, game.player.z, [1, 0.85, 0.3], 20, 5);
    this.done++;
    this.active = null;
    this.marker = null;
    this.goons = [];
    this.cars = [];
    game.saveGame();
    if (this.storyComplete) {
      game.hud.banner('Story complete', 'You own Solmar Bay now, Riko.', 5);
      game.hud.showComplete();
    }
  }

  failMission(game, reason) {
    if (!this.active) return;
    game.hud.banner('Mission failed', reason, 3);
    game.audio.missionFail();
    this.active = null;
    this.marker = null;
    this.goons = [];
    this.cars = [];
  }

  draw(geom, time) {
    for (const car of this.cars) drawCar(geom, car, time);
    for (const goon of this.goons) drawPed(geom, goon, time);
    if (this.marker) {
      const m = this.marker;
      const pulse = 0.75 + Math.sin(time * 3) * 0.25;
      geom.flatQuad(m.x, m.z, 0.06, m.radius * 2, m.radius * 2, [m.color[0], m.color[1], m.color[2], 0.3], 0);
      geom.cylinder(m.x, 0, m.z, 0.35, 0.5, 14, 6, [m.color[0], m.color[1], m.color[2], 0.5 * pulse]);
      const dy = 2.2 + Math.sin(time * 2) * 0.4;
      geom.box(m.x, dy, m.z, 0.9, 0.9, 0.9, m.color, time * 1.2, 0, Math.PI / 4);
    }
  }
}
