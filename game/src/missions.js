// Missions for Solmar: four story jobs for fixer Delia Voss, in order.
// Each mission is a list of steps — go somewhere, enter a car, clear out
// hostiles, or survive the heat — with a marker showing the current goal.
import * as THREE from 'three';
import { dist2D } from './rng.js';
import { LOCATIONS } from './city.js';
import { Ped } from './peds.js';
import { Car } from './vehicles.js';

const MISSION_DEFS = [
  {
    id: 'first-fare',
    name: 'First Fare',
    reward: 500,
    intro: 'Delia: "Teo, welcome home. Marcus is waiting at the plaza — take him to the marina. Drive smooth, no heat."',
    steps: [
      { type: 'goto', at: LOCATIONS.plaza, radius: 10, text: 'Pick up Marcus at the plaza' },
      { type: 'goto', at: LOCATIONS.marina, radius: 10, text: 'Drop Marcus at the marina' },
    ],
  },
  {
    id: 'hot-wheels',
    name: 'Hot Wheels',
    reward: 800,
    intro: 'Delia: "A gold coupe is parked by the garage district. It is not theirs anymore. Bring it to Spray & Go — and expect company."',
    steps: [
      { type: 'enter', text: 'Steal the gold coupe' },
      { type: 'goto', at: LOCATIONS.garage, radius: 10, text: 'Deliver the coupe to Spray & Go' },
    ],
  },
  {
    id: 'beach-party',
    name: 'Beach Party Crashers',
    reward: 1200,
    intro: 'Delia: "The Breakers took the beach bar and they are not paying rent. Go clear them out. Bring the pistol."',
    steps: [
      { type: 'kill', count: 4, at: LOCATIONS.beach, text: 'Clear the Breakers from the beach bar' },
    ],
  },
  {
    id: 'big-score',
    name: 'The Big Score',
    reward: 2500,
    intro: 'Delia: "The bank job. Pick up the crew, hit the bank, then lose the heat and get home. This is the one, Teo."',
    steps: [
      { type: 'goto', at: LOCATIONS.club, radius: 10, text: 'Pick up the crew at the club' },
      { type: 'goto', at: LOCATIONS.bank, radius: 10, text: 'Get to Solmar Bank' },
      { type: 'survive', seconds: 60, text: 'Survive the chase — 60 seconds' },
      { type: 'goto', at: LOCATIONS.hideout, radius: 10, text: 'Escape to the hideout' },
    ],
  },
];

export class Missions {
  constructor(scene, city, rng, hooks) {
    this.scene = scene;
    this.city = city;
    this.rng = rng;
    this.hooks = hooks; // { message, reward, setWanted, audio }
    this.completed = new Set();
    this.current = null; // { def, stepIndex, timer, hostiles, targetCar, contact }
    this.marker = this.buildMarker();
    this.marker.visible = false;
    scene.add(this.marker);
    // The "D" start marker at the hideout.
    this.startMarker = this.buildMarker(0x2ecc71);
    this.startMarker.position.set(LOCATIONS.hideout.x, 0, LOCATIONS.hideout.z);
    scene.add(this.startMarker);
  }

  buildMarker(color = 0xffd54a) {
    const g = new THREE.Group();
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.7, 0.7, 26, 12, 1, true),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false }),
    );
    beam.position.y = 13;
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(2.2, 3.2, 24),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.7, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.15;
    g.add(beam, ring);
    g.userData.ring = ring;
    return g;
  }

  get nextMission() {
    return MISSION_DEFS.find((m) => !this.completed.has(m.id)) || null;
  }

  get currentStep() {
    return this.current ? this.current.def.steps[this.current.stepIndex] : null;
  }

  /** Where the current objective is (for the HUD + minimap). */
  get objective() {
    if (!this.current) return null;
    const step = this.currentStep;
    if (!step) return null;
    if (step.type === 'enter' && this.current.targetCar) {
      return { x: this.current.targetCar.x, z: this.current.targetCar.z, text: step.text };
    }
    if (step.at) return { x: step.at.x, z: step.at.z, text: step.text };
    return { x: LOCATIONS.hideout.x, z: LOCATIONS.hideout.z, text: step.text };
  }

  start() {
    const def = this.nextMission;
    if (!def || this.current) return false;
    this.current = { def, stepIndex: 0, timer: 0, hostiles: [], targetCar: null, contact: null };
    this.hooks.message(def.intro, 'mission');
    this.hooks.audio?.missionStart();
    this.setupStep();
    return true;
  }

  setupStep() {
    const step = this.currentStep;
    if (!step) return;
    if (step.type === 'enter') {
      // The gold coupe, parked by the garage district. It joins the parked
      // cars so the player can actually get into it.
      const car = new Car(this.scene, LOCATIONS.garage.x - 18, LOCATIONS.garage.z + 6, Math.PI / 2, 0xffd700, { driver: 'parked' });
      this.current.targetCar = car;
      this.hooks.traffic?.parked.push(car);
    }
    if (step.type === 'kill') {
      for (let i = 0; i < step.count; i++) {
        const a = (i / step.count) * Math.PI * 2;
        const ped = new Ped(this.scene, step.at.x + Math.cos(a) * 12, step.at.z + Math.sin(a) * 12, a, this.rng, {
          hostile: true,
          hp: 100,
          shirt: 0x8b1e1e,
          pants: 0x222222,
        });
        this.current.hostiles.push(ped);
      }
    }
    if (step.type === 'survive') {
      this.current.timer = step.seconds;
      this.hooks.setWanted(3, 'The bank job');
    }
    if (step.type === 'goto' && this.current.def.id === 'first-fare' && this.current.stepIndex === 0) {
      // Marcus waits at the plaza.
      this.current.contact = new Ped(this.scene, step.at.x, step.at.z, 0, this.rng, { shirt: 0x3a7d44, pants: 0x2c3e50 });
    }
    this.moveMarker();
  }

  moveMarker() {
    const obj = this.objective;
    if (!obj) {
      this.marker.visible = false;
      return;
    }
    this.marker.visible = true;
    this.marker.position.set(obj.x, 0, obj.z);
  }

  advance() {
    const step = this.currentStep;
    if (step?.type === 'goto' && this.current.contact) {
      // Marcus gets in (or out) — he walks off and is gone.
      this.current.contact.remove();
      this.current.contact = null;
    }
    this.current.stepIndex++;
    if (this.current.stepIndex >= this.current.def.steps.length) {
      this.complete();
    } else {
      this.hooks.message(this.currentStep.text, 'objective');
      this.setupStep();
    }
  }

  complete() {
    const def = this.current.def;
    this.completed.add(def.id);
    this.hooks.reward(def.reward);
    this.hooks.message(`Mission passed: ${def.name} — $${def.reward}`, 'success');
    this.hooks.audio?.missionPass();
    this.cleanup();
  }

  fail(reason) {
    if (!this.current) return;
    this.hooks.message(`Mission failed: ${reason}`, 'fail');
    this.hooks.audio?.missionFail();
    this.cleanup();
  }

  cleanup() {
    for (const h of this.current?.hostiles ?? []) h.remove();
    if (this.current?.contact) this.current.contact.remove();
    // The gold coupe stays in the world as a normal car.
    this.current = null;
    this.marker.visible = false;
    this.startMarker.visible = !!this.nextMission;
  }

  update(dt, player, world) {
    // Spin the markers.
    const t = performance.now() / 1000;
    this.marker.userData.ring.rotation.z = t * 0.8;
    this.startMarker.userData.ring.rotation.z = -t * 0.6;
    if (!this.current) return;
    const step = this.currentStep;
    // Hostile gang members fight the player.
    for (let i = this.current.hostiles.length - 1; i >= 0; i--) {
      const h = this.current.hostiles[i];
      const alive = h.update(dt, this.city, player.pos, (shooter) => {
        const d = dist2D(shooter.x, shooter.z, player.pos.x, player.pos.z);
        if (this.rng.chance(0.4)) {
          player.damage(this.rng.range(6, 11));
          if (world.audio) world.audio.hit();
        }
        if (world.audio) world.audio.gunshotFar();
      });
      if (!alive) {
        h.remove();
        this.current.hostiles.splice(i, 1);
      }
    }
    if (step.type === 'goto') {
      if (dist2D(player.pos.x, player.pos.z, step.at.x, step.at.z) < step.radius) this.advance();
    } else if (step.type === 'enter') {
      const car = this.current.targetCar;
      if (car.wrecked) {
        this.fail('the coupe was wrecked');
      } else if (player.mode === 'car' && player.car === car) {
        this.hooks.setWanted(2, 'Stolen coupe');
        this.hooks.message('The coupe is yours — now lose the heat and deliver it', 'objective');
        this.advance();
      }
    } else if (step.type === 'kill') {
      if (this.current.hostiles.length === 0) this.advance();
    } else if (step.type === 'survive') {
      this.current.timer -= dt;
      if (this.current.timer <= 0) this.advance();
    }
  }
}
