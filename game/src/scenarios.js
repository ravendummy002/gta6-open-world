// Screenshot scenarios, reached with ?shot=NAME. They run through the
// same code as normal play — the same player, traffic, police and
// missions — with the world arranged for a good picture. No scenario
// is reachable from the menus; they exist so the entry's screenshots
// show the game at its best.

import { makeCar } from './vehicles.js';
import { MISSION_DEFS } from './missions.js';

function placePlayer(game, x, z, heading, camYaw) {
  const player = game.player;
  player.x = x;
  player.z = z;
  player.heading = heading;
  player.camYaw = camYaw;
  player.camPitch = 0.3;
  player.lookHoldUntil = game.time + 120;
  // Snap the camera eye so the first frame is already framed.
  const flat = 8 * Math.cos(player.camPitch);
  player.eye.x = x - Math.sin(camYaw) * flat;
  player.eye.y = 2.7 + 8 * Math.sin(player.camPitch) + 0.8;
  player.eye.z = z - Math.cos(camYaw) * flat;
  player.target.x = x;
  player.target.y = 2.7;
  player.target.z = z;
}

function giveCar(game, modelId, color, x, z, heading, speed) {
  const car = makeCar(modelId, color, x, z, heading, 'player');
  car.owned = true;
  car.speed = speed;
  game.missions.cars.push(car);
  game.player.car = car;
  game.player.x = x;
  game.player.z = z;
  game.player.heading = heading;
  game.player.camYaw = heading + Math.PI;
  game.player.camPitch = 0.24;
  game.player.lookHoldUntil = game.time + 120;
  const flat = 10.5 * Math.cos(0.24);
  game.player.eye.x = x - Math.sin(game.player.camYaw) * flat;
  game.player.eye.y = 2.3 + 10.5 * Math.sin(0.24) + 0.8;
  game.player.eye.z = z - Math.cos(game.player.camYaw) * flat;
  game.player.target.x = x;
  game.player.target.y = 2.3;
  game.player.target.z = z;
  return car;
}

export function applyScenario(game, name) {
  if (name === 'cover') {
    // On foot on the plaza itself, facing the fountain and downtown
    // with traffic crossing the avenues on both sides.
    placePlayer(game, -28, -14, Math.PI, Math.PI);
  } else if (name === 'drive') {
    // Flying down the central avenue in the Vortex GT.
    giveCar(game, 'sport', '#d94f3d', 2.2, -120, 0, 30);
  } else if (name === 'chase') {
    // Three stars and three cruisers closing in on the avenue.
    giveCar(game, 'sport', '#3f7fd9', 2.2, -40, 0, 24);
    game.police.setWanted(3);
    game.police.spawnTimer = 30;
    const spots = [
      { x: -2.2, z: -72, heading: 0 },
      { x: 6.5, z: -18, heading: Math.PI * 0.9 },
      { x: -2.2, z: -100, heading: 0 },
    ];
    for (const s of spots) {
      const cop = makeCar('cop', '#f2f4f6', s.x, s.z, s.heading, 'cop');
      cop.speed = 12;
      game.police.copCars.push(cop);
    }
  } else if (name === 'mission') {
    // Mission 3 in progress: Riko on the pier, goons ahead, the
    // objective and the ammo counter on the HUD.
    game.missions.done = 2;
    game.missions.active = { def: MISSION_DEFS[2], step: 1, missionCar: null };
    game.missions.spawnGoons(game);
    game.missions.setObjective('Clear the pier — 5 hostiles left', 0, 268, 6);
    // Far enough down the pier that the first-aid kit at its foot is
    // behind the camera instead of looming in the foreground.
    placePlayer(game, 0, 224, 0, 0);
  }
}
