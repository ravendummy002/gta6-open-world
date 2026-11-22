// Riko Vale, the player: on foot and behind the wheel, plus the
// third-person camera that follows. Running into people and driving
// into them are both crimes the police notice.

import { clamp, angleLerp, dampFactor } from './rng.js';
import { drawPed, damagePed } from './pedestrians.js';
import { driveCarPhysics, findNearestCar } from './vehicles.js';
import { hexColor } from './geometry.js';

export class Player {
  constructor(game, x, z, heading) {
    this.game = game;
    this.x = x;
    this.z = z;
    this.heading = heading;
    this.speed = 0;
    this.walkPhase = 0;
    this.health = 100;
    this.car = null;
    this.camYaw = heading + Math.PI;
    this.camPitch = 0.34;
    this.eye = { x: x - Math.sin(this.camYaw) * 7, y: 4.5, z: z - Math.cos(this.camYaw) * 7 };
    this.target = { x, y: 2, z };
    this.lookHoldUntil = 0;
    this.regenTimer = 0;
    this.outfit = {
      shirt: hexColor('#0e9aa8'),
      pants: hexColor('#2c3e50'),
      skin: hexColor('#e0ac69'),
      hair: hexColor('#1a1a1a'),
    };
  }

  get onFoot() {
    return !this.car;
  }

  update(dt, game) {
    if (this.car) this.updateDriving(dt, game);
    else this.updateOnFoot(dt, game);
    this.updateCamera(dt, game);
    // Health creeps back when the player has been safe for a while.
    this.regenTimer -= dt;
    if (this.regenTimer <= 0 && this.health > 0 && this.health < 100) {
      this.health = Math.min(100, this.health + 2.5 * dt);
    }
  }

  hurt(amount, game) {
    if (this.health <= 0) return;
    this.health -= amount;
    this.regenTimer = 6;
    game.hud.damageFlash();
    if (this.health <= 0) {
      this.health = 0;
      game.wasted();
    }
  }

  updateOnFoot(dt, game) {
    const input = game.input;
    const axes = input.moveAxes();
    const running = input.isDown('ShiftLeft') || input.isDown('ShiftRight');
    const topSpeed = running ? 7 : 4.2;
    if (axes.x !== 0 || axes.y !== 0) {
      // Movement is relative to where the camera looks.
      const fwdX = Math.sin(this.camYaw);
      const fwdZ = Math.cos(this.camYaw);
      const rightX = Math.cos(this.camYaw);
      const rightZ = -Math.sin(this.camYaw);
      let mx = fwdX * axes.y + rightX * axes.x;
      let mz = fwdZ * axes.y + rightZ * axes.x;
      const len = Math.hypot(mx, mz) || 1;
      mx /= len;
      mz /= len;
      this.heading = angleLerp(this.heading, Math.atan2(mx, mz), Math.min(1, dt * 10));
      this.speed = topSpeed;
    } else {
      this.speed = Math.max(0, this.speed - 30 * dt);
    }
    if (this.speed > 0.1) {
      this.x += Math.sin(this.heading) * this.speed * dt;
      this.z += Math.cos(this.heading) * this.speed * dt;
      this.walkPhase += this.speed * dt * 2.4;
      // Sprinting into a pedestrian knocks them flying — and is a crime.
      if (this.speed > 5) {
        for (const ped of game.peds.peds) {
          if (ped.state !== 'walk' && ped.state !== 'flee') continue;
          const dx = ped.x - this.x;
          const dz = ped.z - this.z;
          if (dx * dx + dz * dz < 0.9) {
            damagePed(ped, 60, game);
            game.police.addCrime(1, 'assault');
            game.combat.burst(ped.x, 1, ped.z, [1, 0.8, 0.3], 6, 3);
          }
        }
      }
    }
    const fixed = game.city.collideCircle(this.x, this.z, 0.45);
    this.x = fixed.x;
    this.z = fixed.z;
    // Keep out of the cars' bodies.
    for (const car of game.allCars()) {
      const dx = this.x - car.x;
      const dz = this.z - car.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < 2.4 * 2.4 && d2 > 1e-6) {
        const d = Math.sqrt(d2);
        this.x = car.x + (dx / d) * 2.4;
        this.z = car.z + (dz / d) * 2.4;
      }
    }
    if (input.wasPressed('KeyE')) {
      const car = findNearestCar(game.allCars(), this.x, this.z, 3.6);
      if (car) this.enterCar(car, game);
    }
  }

  enterCar(car, game) {
    if (car.driver !== 'player' && !car.owned) {
      game.police.addCrime(1, 'steal');
      game.hud.toast('Car stolen — the cops noticed');
      car.owned = true;
    }
    car.driver = 'player';
    this.car = car;
    this.speed = 0;
    game.audio.setEngine(true, 0);
  }

  exitCar(game) {
    const car = this.car;
    if (!car) return;
    car.driver = 'parked'; // it waits where it is; getting back in is free
    car.speed = 0;
    // Step out on the driver's side.
    const sideX = car.x + Math.cos(car.heading) * 1.9;
    const sideZ = car.z - Math.sin(car.heading) * 1.9;
    const fixed = game.city.collideCircle(sideX, sideZ, 0.45);
    this.x = fixed.x;
    this.z = fixed.z;
    this.heading = car.heading;
    this.car = null;
    game.audio.setEngine(false, 0);
  }

  updateDriving(dt, game) {
    const input = game.input;
    const car = this.car;
    const throttle =
      (input.isDown('KeyW') || input.isDown('ArrowUp') ? 1 : 0) -
      (input.isDown('KeyS') || input.isDown('ArrowDown') ? 1 : 0);
    const steer =
      (input.isDown('KeyA') || input.isDown('ArrowLeft') ? 1 : 0) -
      (input.isDown('KeyD') || input.isDown('ArrowRight') ? 1 : 0);
    const handbrake = input.isDown('Space');
    driveCarPhysics(car, throttle, steer, handbrake, dt, game.city, game.allCars());
    this.x = car.x;
    this.z = car.z;
    this.heading = car.heading;
    this.speed = car.speed;
    // Driving into a pedestrian at speed is a crime.
    if (Math.abs(car.speed) > 3) {
      for (const ped of game.peds.peds) {
        if (ped.state === 'dead') continue;
        const dx = ped.x - car.x;
        const dz = ped.z - car.z;
        if (dx * dx + dz * dz < 2.6 * 2.6) {
          damagePed(ped, 120, game);
          game.police.addCrime(1, 'hitPed');
          game.combat.burst(ped.x, 1, ped.z, [1, 0.3, 0.2], 10, 4);
          car.speed *= 0.7;
        }
      }
    }
    if (input.wasPressed('KeyE')) this.exitCar(game);
    if (input.wasPressed('KeyH')) game.audio.horn();
    game.audio.setEngine(true, clamp(Math.abs(car.speed) / car.model.top, 0, 1));
  }

  updateCamera(dt, game) {
    const input = game.input;
    const look = input.consumeLook();
    if (look.dx !== 0 || look.dy !== 0) {
      this.camYaw -= look.dx * 0.0026;
      this.camPitch = clamp(this.camPitch + look.dy * 0.0022, 0.06, 1.05);
      this.lookHoldUntil = game.time + 2.5;
    }
    // With the mouse idle the camera swings back behind the player.
    // On foot this only happens while standing still: while moving,
    // the heading already follows the camera, so letting the camera
    // follow the heading too would spin them both in circles. In a
    // car the steering sets the heading independently, so following
    // there is stable.
    if (game.time > this.lookHoldUntil) {
      const axes = input.moveAxes();
      const idle = axes.x === 0 && axes.y === 0;
      if (this.car || idle) {
        this.camYaw = angleLerp(this.camYaw, this.heading + Math.PI, Math.min(1, dt * (this.car ? 2.2 : 1.2)));
      }
      const defaultPitch = this.car ? 0.24 : 0.34;
      this.camPitch += (defaultPitch - this.camPitch) * Math.min(1, dt * 1.5);
    }
    const dist = this.car ? 10.5 : 8;
    const tx = this.x;
    // Aim above the player's head so they sit below the centre of the
    // frame and the crosshair clears them; the world fills the shot.
    const ty = this.car ? 2.3 : 2.7;
    const tz = this.z;
    const flat = dist * Math.cos(this.camPitch);
    const ex = tx - Math.sin(this.camYaw) * flat;
    const ey = ty + dist * Math.sin(this.camPitch) + 0.8;
    const ez = tz - Math.cos(this.camYaw) * flat;
    // Frame-rate independent smoothing: the camera glides the same
    // at 30 fps and at 144 fps.
    const k = dampFactor(7, dt);
    this.eye.x += (ex - this.eye.x) * k;
    this.eye.y += (Math.max(1.4, ey) - this.eye.y) * k;
    this.eye.z += (ez - this.eye.z) * k;
    this.target.x = tx;
    this.target.y = ty;
    this.target.z = tz;
  }

  draw(geom, time) {
    // Behind the wheel the car itself is the drawing; the cabin glass
    // is opaque, so there is no driver to show.
    if (this.car) return;
    drawPed(
      geom,
      {
        x: this.x,
        z: this.z,
        heading: this.heading,
        walkPhase: this.walkPhase,
        speed: this.speed,
        state: this.health > 0 ? 'walk' : 'down',
        shirt: this.outfit.shirt,
        pants: this.outfit.pants,
        skin: this.outfit.skin,
        hair: this.outfit.hair,
        gun: true,
      },
      time,
    );
  }
}
