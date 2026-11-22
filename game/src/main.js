// Solmar — Streets of Solmar. Entry point: builds the world, runs the
// game loop, and owns the state machine (menu, playing, paused,
// busted, wasted). Every system is updated here, in dependency order,
// and rendered as one static city plus one dynamic batch per frame.

import { Renderer } from './gl.js';
import { Geom } from './geometry.js';
import { mat4Perspective, mat4LookAt } from './math3d.js';
import { buildCity } from './city.js';
import { Traffic } from './vehicles.js';
import { Pedestrians } from './pedestrians.js';
import { Police } from './police.js';
import { Player } from './player.js';
import { Combat } from './combat.js';
import { Pickups } from './pickups.js';
import { Missions } from './missions.js';
import { HUD } from './hud.js';
import { AudioEngine } from './audio.js';
import { Input } from './input.js';
import { loadSave, writeSave, clearSave } from './save.js';
import { applyScenario } from './scenarios.js';
import { mulberry32 } from './rng.js';

export class Game {
  constructor() {
    this.canvas = document.getElementById('game-canvas');
    try {
      this.renderer = new Renderer(this.canvas);
    } catch (err) {
      document.getElementById('webgl-error').classList.remove('hidden');
      document.getElementById('webgl-error').textContent =
        'Solmar needs WebGL to run. Please use a desktop browser with hardware acceleration enabled.';
      throw err;
    }
    this.input = new Input();
    this.input.attach(this.canvas);
    this.audio = new AudioEngine();
    this.hud = new HUD();
    this.city = buildCity();
    this.renderer.setStatic(this.city.geom);

    const rng = mulberry32(1337);
    this.traffic = new Traffic(this.city, rng);
    this.peds = new Pedestrians(this.city, rng);
    this.police = new Police(this.city);
    this.combat = new Combat();
    this.pickups = new Pickups(this.city, rng);
    this.missions = new Missions(this);
    const spawn = this.city.landmarks.spawn;
    this.player = new Player(this, spawn.x, spawn.z, spawn.heading);

    this.cash = 0;
    this.time = 0;
    this.state = 'menu'; // menu | playing | paused | busted | wasted
    this.dangers = [];
    this.saveTimer = 0;
    this.proj = new Float32Array(16);
    this.view = new Float32Array(16);
    this.dynGeom = new Geom();
    this.aspect = 16 / 9;

    this.hud.bind(this);
    this.save = loadSave();
    this.hud.showStart(this.save);
    this.hud.setMuted(this.audio.muted);

    window.addEventListener('resize', () => this.resize());
    this.resize();

    // Losing pointer lock mid-game (Esc) pauses, since the browser
    // swallows the Escape keypress itself while locked.
    document.addEventListener('pointerlockchange', () => {
      if (!this.input.locked && this.state === 'playing' && !this.scenario) {
        this.pauseGame();
      }
    });
    // Switching tabs pauses too, so the city never plays on unheard.
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.state === 'playing' && !this.scenario) {
        this.pauseGame();
      }
    });

    // Screenshot mode: skip the menu and arrange the world.
    const params = new URLSearchParams(window.location.search);
    this.scenario = params.get('shot');
    if (this.scenario) {
      this.state = 'playing';
      this.hud.hideOverlays();
      applyScenario(this, this.scenario);
    }

    window.__solmar = this;
    this.lastTime = performance.now();
    requestAnimationFrame((t) => this.loop(t));
  }

  resize() {
    this.aspect = this.renderer.resize(window.innerWidth, window.innerHeight);
  }

  allCars() {
    return [...this.traffic.cars, ...this.police.copCars, ...this.missions.cars];
  }

  get dangerPoints() {
    return this.dangers.filter((d) => d.until > this.time);
  }

  addDanger(x, z, radius, dur) {
    this.dangers.push({ x, z, radius, until: this.time + dur });
    if (this.dangers.length > 12) this.dangers.shift();
  }

  nearestCopDist() {
    let best = Infinity;
    for (const c of this.police.copCars) {
      best = Math.min(best, Math.hypot(c.x - this.player.x, c.z - this.player.z));
    }
    for (const p of this.police.copPeds) {
      best = Math.min(best, Math.hypot(p.x - this.player.x, p.z - this.player.z));
    }
    return best;
  }

  // The ray from the camera through the centre of the screen.
  cameraRay() {
    const e = this.player.eye;
    const t = this.player.target;
    const dx = t.x - e.x;
    const dy = t.y - e.y;
    const dz = t.z - e.z;
    const len = Math.hypot(dx, dy, dz) || 1;
    return {
      origin: { x: e.x, y: e.y, z: e.z },
      dir: { x: dx / len, y: dy / len, z: dz / len },
    };
  }

  addCash(n) {
    this.cash += n;
  }

  startGame(opts = {}) {
    if (opts.fresh) {
      clearSave();
      this.save = null;
      this.resetProgress();
    } else if (this.save) {
      this.applySave(this.save);
    }
    this.state = 'playing';
    this.hud.hideOverlays();
    this.audio.unlock();
    this.input.lock();
  }

  resetProgress() {
    this.cash = 0;
    this.missions.done = 0;
    this.missions.active = null;
    this.missions.goons = [];
    this.missions.cars = [];
    this.police.clearWanted();
    this.police.copCars = [];
    this.police.copPeds = [];
    const spawn = this.city.landmarks.spawn;
    this.player.x = spawn.x;
    this.player.z = spawn.z;
    this.player.heading = spawn.heading;
    this.player.health = 100;
    this.player.car = null;
    this.combat.ammo = this.combat.magSize;
    for (const item of this.pickups.items) item.taken = false;
  }

  applySave(save) {
    this.cash = save.cash || 0;
    this.missions.done = Math.min(save.missionsDone || 0, 4);
    this.player.health = save.health || 100;
    if (typeof save.playerX === 'number') {
      this.player.x = save.playerX;
      this.player.z = save.playerZ;
      this.player.heading = save.playerHeading || 0;
    }
    this.pickups.applySave(save.collectedPickups);
  }

  saveGame() {
    writeSave({
      cash: this.cash,
      missionsDone: this.missions.done,
      health: Math.round(this.player.health),
      playerX: this.player.x,
      playerZ: this.player.z,
      playerHeading: this.player.heading,
      collectedPickups: this.pickups.collectedIds(),
    });
  }

  pauseGame() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.input.unlock();
    this.audio.setEngine(false, 0);
    this.audio.setSiren(false, 0);
    this.audio.suspend();
    this.saveGame();
    this.hud.showPause();
  }

  resumeGame() {
    if (this.state !== 'paused') return;
    this.state = 'playing';
    this.hud.hideOverlays();
    this.audio.unlock();
    this.audio.resume();
    this.input.lock();
  }

  toggleMute() {
    this.audio.setMuted(!this.audio.muted);
    this.hud.setMuted(this.audio.muted);
  }

  restartRun() {
    clearSave();
    window.location.reload();
  }

  leaveCarBehind() {
    if (this.player.car) {
      this.player.car.driver = 'parked';
      this.player.car.speed = 0;
      this.player.car = null;
    }
  }

  busted() {
    if (this.state !== 'playing') return;
    const fine = Math.min(this.cash, 200);
    this.cash -= fine;
    this.leaveCarBehind();
    this.police.clearWanted();
    this.police.copCars = [];
    this.police.copPeds = [];
    this.missions.failMission(this, 'Busted by the police');
    this.audio.busted();
    this.audio.setEngine(false, 0);
    this.audio.setSiren(false, 0);
    this.state = 'busted';
    this.input.unlock();
    this.saveGame();
    this.hud.showBusted(fine);
  }

  afterBusted() {
    const door = this.city.landmarks.policeDoor;
    this.player.x = door.x;
    this.player.z = door.z;
    this.player.heading = Math.PI;
    this.player.health = Math.max(this.player.health, 50);
    this.state = 'playing';
    this.hud.hideOverlays();
    this.input.lock();
  }

  wasted() {
    if (this.state !== 'playing') return;
    const lost = Math.floor(this.cash * 0.1);
    this.cash -= lost;
    this.leaveCarBehind();
    this.police.clearWanted();
    this.police.copCars = [];
    this.police.copPeds = [];
    this.missions.failMission(this, 'You got wasted');
    this.audio.wasted();
    this.audio.setEngine(false, 0);
    this.audio.setSiren(false, 0);
    this.state = 'wasted';
    this.input.unlock();
    this.saveGame();
    this.hud.showWasted(lost);
  }

  afterWasted() {
    const door = this.city.landmarks.hospitalDoor;
    this.player.x = door.x;
    this.player.z = door.z;
    this.player.heading = Math.PI;
    this.player.health = 100;
    this.state = 'playing';
    this.hud.hideOverlays();
    this.input.lock();
  }

  loop(now) {
    requestAnimationFrame((t) => this.loop(t));
    let dt = (now - this.lastTime) / 1000;
    this.lastTime = now;
    dt = Math.min(dt, 0.05);
    if (this.state === 'playing') {
      this.time += dt;
      this.update(dt);
    } else if (this.state === 'menu') {
      // A living backdrop behind the title: traffic rolls, the camera
      // drifts slowly around the plaza.
      this.time += dt;
      this.traffic.update(dt, this);
      this.peds.update(dt, this);
      this.player.camYaw += dt * 0.05;
      this.player.updateCamera(dt, this);
    }
    this.render();
    this.input.endFrame();
    if (!this.readyFlag) {
      this.readyFlag = true;
      window.__solmarReady = true;
    }
  }

  update(dt) {
    const input = this.input;
    if (input.wasPressed('Escape') || input.wasPressed('KeyP')) {
      this.pauseGame();
      return;
    }
    if (input.wasPressed('KeyM')) this.toggleMute();

    // A speeding player car scares nearby pedestrians.
    if (this.player.car && Math.abs(this.player.car.speed) > 9) {
      this.addDanger(this.player.x, this.player.z, 10, 0.3);
    }

    this.player.update(dt, this);
    this.traffic.update(dt, this);
    this.peds.update(dt, this);
    this.police.update(dt, this);
    this.missions.update(dt, this);
    this.combat.update(dt, this);
    this.pickups.update(dt, this);
    if (!this.player.car) this.audio.setEngine(false, 0);

    this.saveTimer -= dt;
    if (this.saveTimer <= 0) {
      this.saveTimer = 20;
      this.saveGame();
    }
    this.hud.update(dt, this);
  }

  render() {
    const player = this.player;
    mat4Perspective(this.proj, 1.05, this.aspect, 0.1, 700);
    mat4LookAt(
      this.view,
      player.eye.x, player.eye.y, player.eye.z,
      player.target.x, player.target.y, player.target.z,
      0, 1, 0,
    );
    const g = this.dynGeom;
    g.clear();
    this.traffic.draw(g, this.time);
    this.police.draw(g, this.time);
    this.missions.draw(g, this.time);
    this.peds.draw(g, this.time);
    this.player.draw(g, this.time);
    this.pickups.draw(g, this.time);
    this.combat.draw(g, this.time, this);
    this.renderer.frame(this.proj, this.view, g);
  }
}

new Game();
