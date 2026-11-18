// Screenshot scenes for Solmar: ?shot=start|drive|foot|chase&seed=1 puts the
// game into a fixed, photogenic state so the dossier screenshots are
// deterministic. The game still runs — traffic moves, cops chase.
import { dist2D, clamp, angleDiff } from './rng.js';
import { LOCATIONS } from './city.js';
import { Car } from './vehicles.js';

/** Put the game into the requested shot state. Returns the shot name. */
export function setupShot(game, name) {
  const { player, police, missions, hud, traffic } = game;
  if (name === 'start') {
    // Start screen stays up; main.js orbits the camera over the city.
    return 'start';
  }
  game.startGame();
  if (name === 'drive') {
    // Teo in a red coupe, cruising the main east-west avenue.
    const car = new Car(game.scene, -180, 0, Math.PI / 2, 0xc0392b, { driver: 'player', maxSpeed: 30 });
    car.speed = 12;
    traffic.cars.push(car);
    player.enterCar(car, null);
    hud.message('Solmar Bay — free roam', 'info');
    return 'drive';
  }
  if (name === 'foot') {
    // On foot at the beach bar, mid-mission against the Breakers. The player
    // stands on open sand south-east of the hut so the gang is in the open
    // between the camera and the bar, not stuck behind the hut.
    missions.completed.add('first-fare');
    missions.completed.add('hot-wheels');
    missions.start();
    player.teleport(330, -178);
    player.heading = -0.45;
    player.camYaw = player.heading + Math.PI;
    hud.setObjective('Clear the Breakers from the beach bar');
    return 'foot';
  }
  if (name === 'chase') {
    // Three stars, two pursuit cars on the player's tail.
    const car = new Car(game.scene, -60, 60, Math.PI / 2, 0x2980b9, { driver: 'player', maxSpeed: 30 });
    car.speed = 16;
    traffic.cars.push(car);
    player.enterCar(car, null);
    police.addWanted(3, 'The bank job');
    police.spawnCarNear(-60, 60);
    police.spawnCarNear(-60, 60);
    police.spawnCopNear(-60, 60);
    hud.message('3 stars — lose the heat!', 'fail');
    return 'chase';
  }
  return null;
}

/** Autopilot for drive/chase shots: keep the player's car on the road. */
export function autopilot(game, dt) {
  const car = game.player.car;
  if (!car) return { throttle: 0, steer: 0, handbrake: false };
  const f = car.forward;
  // Waypoint 30 units ahead, snapped onto the nearest road line.
  let wx = car.x + f.x * 30;
  let wz = car.z + f.z * 30;
  const onXRoad = Math.abs(car.z - Math.round(car.z / 60) * 60) < Math.abs(car.x - Math.round(car.x / 60) * 60);
  if (onXRoad) {
    wz = Math.round(car.z / 60) * 60;
  } else {
    wx = Math.round(car.x / 60) * 60;
  }
  const desired = Math.atan2(wx - car.x, wz - car.z);
  const steer = clamp(angleDiff(car.heading, desired) * 2.2, -1, 1);
  return { throttle: 0.85, steer, handbrake: false };
}
