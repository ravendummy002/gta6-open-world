// Solmar — Streets of Solmar. Boot, game loop, save/load, and the wiring
// between the city, traffic, crowd, police, missions, HUD and audio.
import * as THREE from 'three';
import { Rng, dist2D } from './rng.js';
import { City, LOCATIONS } from './city.js';
import { Traffic } from './vehicles.js';
import { Crowd } from './peds.js';
import { Player } from './player.js';
import { Police } from './police.js';
import { Missions } from './missions.js';
import { HUD } from './hud.js';
import { Audio } from './audio.js';
import { Input } from './input.js';
import { setupShot, autopilot } from './shots.js';

const SAVE_KEY = 'solmar-save-v1';
const START_MONEY = 250;

const params = new URLSearchParams(window.location.search);
const SEED = parseInt(params.get('seed') || '', 10) || (Date.now() % 100000);
const SHOT = params.get('shot') || null;

class Game {
  constructor() {
    this.rng = new Rng(SEED);
    this.state = 'menu'; // menu | playing | paused | wasted | busted
    this.money = START_MONEY;
    this.shotMode = SHOT;
    this.saveTimer = 0;
    this.respawnTimer = 0;
    this.sprayCooldown = 0;
    this.frames = 0;
    this.readyReported = false;

    // Renderer + scene.
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    document.getElementById('game-root').appendChild(this.renderer.domElement);
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x87b5dd);
    this.scene.fog = new THREE.Fog(0x9fc3e0, 220, 750);
    this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1200);
    this.camera.position.set(0, 120, 260);

    // Sun + sky light. The sun's shadow camera follows the player.
    this.sun = new THREE.DirectionalLight(0xfff2d8, 2.2);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.camera.left = -160;
    this.sun.shadow.camera.right = 160;
    this.sun.shadow.camera.top = 160;
    this.sun.shadow.camera.bottom = -160;
    this.sun.shadow.camera.far = 600;
    this.sun.shadow.bias = -0.0004;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);
    this.scene.add(new THREE.HemisphereLight(0xbfd9ff, 0x8a7a5a, 1.1));

    // World systems.
    this.city = new City(this.scene, SEED);
    this.traffic = new Traffic(this.scene, this.city, this.rng);
    this.crowd = new Crowd(this.scene, this.city, this.rng);
    this.player = new Player(this.scene, this.city, LOCATIONS.hideout.x, LOCATIONS.hideout.z);
    this.police = new Police(this.scene, this.city, this.rng);
    this.hud = new HUD();
    this.audio = new Audio();
    this.input = new Input(this.renderer.domElement);
    this.missions = new Missions(this.scene, this.city, this.rng, {
      message: (t, k) => this.hud.message(t, k),
      reward: (n) => this.addMoney(n),
      setWanted: (n, reason) => this.police.addWanted(n, reason),
      audio: this.audio,
      traffic: this.traffic,
    });
    this.police.onWantedChange = (n, reason) => {
      this.hud.setWanted(n);
      if (reason && reason !== 'heat off' && reason !== 'clear') this.hud.message(`${n} star${n === 1 ? '' : 's'} — ${reason}`, 'fail');
      if (n === 0 && reason === 'heat off') this.hud.message('You lost the cops', 'success');
    };
    this.police.onBusted = () => this.busted();
    this.input.onPauseKey = () => this.togglePause();

    // Buttons.
    document.getElementById('play-btn').addEventListener('click', () => this.startGame());
    document.getElementById('resume-btn').addEventListener('click', () => this.togglePause());
    document.getElementById('restart-btn').addEventListener('click', () => this.restart());
    this.input.onAnyKey = (code) => {
      if (this.state === 'menu' && code === 'Enter') this.startGame();
    };

    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });

    // Load a save if one exists.
    this.loadSave();
    this.hud.setMoney(this.money);
    this.hud.setWanted(0);
    this.hud.setHealth(100);

    // Screenshot mode: set the scene up immediately.
    if (this.shotMode) {
      setupShot(this, this.shotMode);
    }
    this.clock = new THREE.Clock();
    this.renderer.setAnimationLoop(() => this.frame());
  }

  addMoney(n) {
    this.money += n;
    this.hud.setMoney(this.money);
    if (n > 0) this.audio.cash();
    this.save();
  }

  startGame() {
    if (this.state !== 'menu') return;
    this.state = 'playing';
    this.audio.unlock();
    this.audio.uiClick();
    this.hud.hideStart();
    this.hud.message('Welcome to Solmar Bay, Teo. Head to the green D to work for Delia.', 'mission');
    if (this.missions.nextMission) {
      this.hud.setObjective('Go to the green D marker to start: ' + this.missions.nextMission.name);
    }
  }

  togglePause() {
    if (this.state === 'playing') {
      this.state = 'paused';
      this.hud.showPause();
      this.save();
      document.exitPointerLock?.();
    } else if (this.state === 'paused') {
      this.state = 'playing';
      this.hud.hidePause();
    }
  }

  restart() {
    try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* storage unavailable */ }
    window.location.reload();
  }

  busted() {
    if (this.state !== 'playing') return;
    this.state = 'busted';
    this.money = Math.max(0, this.money - 200);
    this.hud.setMoney(this.money);
    this.police.clearWanted();
    this.hud.showEnd('BUSTED', 'The Solmar PD caught you. $200 bail, and Delia is not happy.');
    this.audio.missionFail();
    this.respawnTimer = 3;
  }

  wasted() {
    if (this.state !== 'playing') return;
    this.state = 'wasted';
    this.money = Math.max(0, this.money - 100);
    this.hud.setMoney(this.money);
    if (this.missions.current) this.missions.fail('Teo went down');
    this.hud.showEnd('WASTED', 'You woke up at Solmar General. $100 hospital bill.');
    this.audio.missionFail();
    this.respawnTimer = 3;
  }

  respawn() {
    this.hud.hideEnd();
    this.player.teleport(LOCATIONS.plaza.x, LOCATIONS.plaza.z);
    this.state = 'playing';
  }

  save() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        money: this.money,
        completed: [...this.missions.completed],
        x: this.player.pos.x,
        z: this.player.pos.z,
      }));
    } catch (e) { /* storage unavailable */ }
  }

  loadSave() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return;
      const s = JSON.parse(raw);
      if (typeof s.money === 'number') this.money = s.money;
      if (Array.isArray(s.completed)) this.missions.completed = new Set(s.completed);
      if (typeof s.x === 'number' && typeof s.z === 'number') {
        this.player.teleport(s.x, s.z);
      }
    } catch (e) { /* corrupt or unavailable save */ }
  }

  /** The world object handed to the player/police/missions each frame. */
  worldView() {
    return {
      scene: this.scene,
      camera: this.camera,
      city: this.city,
      player: this.player,
      traffic: this.traffic,
      crowd: this.crowd,
      police: this.police,
      missions: this.missions,
      hud: this.hud,
      audio: this.audio,
      onPedKilled: (ped, isCop) => {
        if (ped.hostile) return; // gang members don't count as crimes
        this.police.addWanted(isCop ? 2 : 1, isCop ? 'Cop down' : 'Pedestrian killed');
      },
      onCarStolen: () => {
        if (this.police.witnessed(this.player.pos.x, this.player.pos.z, 50)) {
          this.police.addWanted(1, 'Car theft');
        } else {
          this.hud.message('Car stolen — nobody saw a thing', 'info');
        }
      },
    };
  }

  frame() {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    this.frames++;
    if (this.state === 'menu') {
      // Slow orbit over the city behind the start screen.
      const t = performance.now() / 1000;
      const a = t * 0.03;
      this.camera.position.set(Math.cos(a) * 260, 130, Math.sin(a) * 260);
      this.camera.lookAt(0, 0, 0);
      this.city.update(performance.now() / 1000);
      this.traffic.update(dt, null);
      this.crowd.update(dt, null, null);
      this.hud.drawMinimap(this.worldView());
    } else if (this.state === 'playing') {
      this.update(dt);
    } else if (this.state === 'wasted' || this.state === 'busted') {
      this.respawnTimer -= dt;
      if (this.respawnTimer <= 0) this.respawn();
    }
    this.renderer.render(this.scene, this.camera);
    // Screenshot readiness: the shot script waits for this flag. 45 frames
    // is enough for the scene to settle even at software-render frame rates.
    if (!this.readyReported && this.frames > 45) {
      this.readyReported = true;
      window.__solmarReady = true;
    }
  }

  update(dt) {
    const world = this.worldView();
    const p = this.player;
    // Shot autopilot drives the player's car; real input otherwise. F still
    // exits the car in shot mode, and once on foot the normal controls run.
    if ((this.shotMode === 'drive' || this.shotMode === 'chase') && p.mode === 'car' && p.car) {
      const auto = autopilot(this, dt);
      p.car.drive(dt, auto.throttle, auto.steer, auto.handbrake, this.city);
      p.currentSpeed = Math.abs(p.car.speed);
      p.updateCamera(dt, this.camera);
      if (this.input.pressed('KeyF')) p.exitCar();
    } else {
      p.update(dt, this.input, world);
    }
    // Death / bust handling.
    if (p.dead && this.state === 'playing') {
      if (this.shotMode) {
        // Screenshot scenes never kill the player.
        p.hp = 100;
        p.dead = false;
      } else {
        this.wasted();
        this.input.endFrame();
        return;
      }
    }
    // Mission start: E near the green D.
    if (this.input.pressed('KeyE') && !this.missions.current && this.missions.nextMission) {
      if (dist2D(p.pos.x, p.pos.z, LOCATIONS.hideout.x, LOCATIONS.hideout.z) < 12) {
        this.missions.start();
      }
    }
    if (this.input.pressed('KeyM')) {
      const muted = this.audio.toggleMute();
      this.hud.message(muted ? 'Sound off' : 'Sound on', 'info');
    }
    this.input.endFrame();
    // Spray & Go: respray clears the heat for $100.
    this.sprayCooldown -= dt;
    if (this.police.wanted > 0 && p.mode === 'car' && this.money >= 100 && this.sprayCooldown <= 0) {
      if (dist2D(p.pos.x, p.pos.z, LOCATIONS.garage.x, LOCATIONS.garage.z) < 11) {
        this.money -= 100;
        this.hud.setMoney(this.money);
        this.police.clearWanted();
        this.hud.message('Respray at Spray & Go — heat is off ($100)', 'success');
        this.sprayCooldown = 10;
      }
    }
    this.traffic.update(dt, p.pos);
    this.crowd.update(dt, p.pos, null);
    this.police.update(dt, p, world);
    this.missions.update(dt, p, world);
    this.city.update(performance.now() / 1000);
    // Sun follows the player so shadows stay crisp.
    this.sun.position.set(p.pos.x + 120, 200, p.pos.z + 60);
    this.sun.target.position.set(p.pos.x, 0, p.pos.z);
    // Audio beds.
    this.audio.setEngine(p.mode === 'car' && p.car ? p.car.speed : 0, p.mode === 'car');
    this.audio.setSiren(this.police.wanted > 0);
    // HUD.
    this.hud.setHealth(p.hp);
    this.hud.setSpeed(p.mode === 'car' && p.car ? Math.abs(p.car.speed) * 3.6 : 0, p.mode === 'car');
    this.hud.setCrosshair(p.mode === 'foot');
    const step = this.missions.currentStep;
    if (step) {
      let text = step.text;
      if (step.type === 'survive') text += ` — ${Math.max(0, Math.ceil(this.missions.current.timer))}s`;
      this.hud.setObjective(text);
    } else if (this.missions.nextMission) {
      this.hud.setObjective('Go to the green D marker to start: ' + this.missions.nextMission.name);
    } else {
      this.hud.setObjective('All missions complete — Solmar is yours. Free roam!');
    }
    // Context hint.
    let hint = '';
    if (p.mode === 'foot') {
      let nearCar = false;
      for (const car of [...this.traffic.all(), ...this.police.cars]) {
        if (!car.wrecked && dist2D(p.x, p.z, car.x, car.z) < 5) { nearCar = true; break; }
      }
      if (!this.missions.current && this.missions.nextMission &&
        dist2D(p.pos.x, p.pos.z, LOCATIONS.hideout.x, LOCATIONS.hideout.z) < 12) {
        hint = `Press E — start mission: ${this.missions.nextMission.name}`;
      } else if (nearCar) {
        hint = 'Press F — enter car';
      }
    } else if (p.mode === 'car') {
      hint = 'F — exit car · Click — horn · Space — handbrake';
    }
    this.hud.setHint(hint);
    this.hud.drawMinimap(world);
    // Periodic autosave.
    this.saveTimer += dt;
    if (this.saveTimer > 30) {
      this.saveTimer = 0;
      this.save();
    }
  }
}

new Game();
