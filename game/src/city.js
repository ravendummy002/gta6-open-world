// Solmar Bay: a procedural sun-soaked coastal city on a road grid. Everything
// is generated from the seeded RNG, so the same seed builds the same city.
// The city is the single source of truth for collisions, roads (traffic AI)
// and the named locations missions use.
import * as THREE from 'three';
import { Rng } from './rng.js';
import { facadeTexture, roofTexture, groundTexture, sandTexture, signTexture, FACADE_COLORS } from './textures.js';

export const PITCH = 60; // block + road, in world units
export const ROAD_HALF = 8; // roads are 16 wide
export const GRID = 4; // road centres at -240..240 step 60 (9 roads each way)
export const CITY_EDGE = 300; // blocks end here; the beach runs east of it
export const BEACH_EDGE = 348; // sand ends, water begins

/** Road centre lines, for traffic and the minimap. */
export const ROADS = [];
for (let k = -GRID; k <= GRID; k++) {
  ROADS.push({ axis: 'x', at: k * PITCH }); // road running along X at z = at
  ROADS.push({ axis: 'z', at: k * PITCH }); // road running along Z at x = at
}

/** Named places missions and the HUD point at. */
export const LOCATIONS = {
  hideout: { x: -30, z: 90, name: "Teo's Hideout" },
  garage: { x: 90, z: -30, name: 'Spray & Go' },
  marina: { x: 322, z: 150, name: 'Solmar Marina' },
  bank: { x: 30, z: -90, name: 'Solmar Bank' },
  beach: { x: 322, z: -150, name: 'Solmar Beach' },
  plaza: { x: -90, z: 30, name: 'Plaza del Sol' },
  club: { x: -150, z: 150, name: "Delia's" },
};

/** The park block (no buildings) and the plaza block. */
const PARK = { bx: -2, bz: -2 };
const PLAZA = { bx: -1, bz: 1 };

/** A block reserved for a tall landmark tower downtown. */
const TOWER = { bx: 0, bz: -1 };

export class City {
  constructor(scene, seed) {
    this.scene = scene;
    this.rng = new Rng(seed);
    /** Building colliders as { minX, maxX, minZ, maxZ }. */
    this.colliders = [];
    /** Facade materials, cached by texture variant. */
    this.facadeMats = [];
    this.roofMat = null;
    this.water = null;
    this.group = new THREE.Group();
    this.group.name = 'city';
    scene.add(this.group);
    this.build();
  }

  build() {
    this.buildGround();
    this.buildFacades();
    this.buildBlocks();
    this.buildPark();
    this.buildPlaza();
    this.buildBeach();
    this.buildStreetlights();
    this.buildSigns();
    // Invisible walls: the city edge, the waterline and the map border.
    const W = 400;
    this.colliders.push(
      { minX: -W - 4, maxX: -W, minZ: -W, maxZ: W },
      { minX: W, maxX: W + 4, minZ: -W, maxZ: W },
      { minX: -W, maxX: W, minZ: -W - 4, maxZ: -W },
      { minX: -W, maxX: W, minZ: W, maxZ: W + 4 },
      { minX: BEACH_EDGE, maxX: BEACH_EDGE + 4, minZ: -W, maxZ: W },
    );
  }

  buildGround() {
    // The ground texture draws roads at the tile edges, so the plane must
    // start on a multiple of PITCH: 840 units = 14 tiles, centred on 0,
    // puts every tile boundary (and every visual road) on a road line.
    const groundTex = groundTexture();
    groundTex.repeat.set(14, 14);
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(840, 840),
      new THREE.MeshLambertMaterial({ map: groundTex }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(0, 0, 0);
    ground.receiveShadow = true;
    this.group.add(ground);
    // Sand strip east of the city.
    const sandTex = sandTexture();
    sandTex.repeat.set(2, 14);
    const sand = new THREE.Mesh(
      new THREE.PlaneGeometry(110, 840),
      new THREE.MeshLambertMaterial({ map: sandTex }),
    );
    sand.rotation.x = -Math.PI / 2;
    sand.position.set(CITY_EDGE + 55, 0.05, 0);
    sand.receiveShadow = true;
    this.group.add(sand);
    // Water: a glossy plane past the sand.
    this.water = new THREE.Mesh(
      new THREE.PlaneGeometry(220, 840),
      new THREE.MeshPhongMaterial({ color: 0x1e7fa8, transparent: true, opacity: 0.88, shininess: 120 }),
    );
    this.water.rotation.x = -Math.PI / 2;
    this.water.position.set(BEACH_EDGE + 110, 0.12, 0);
    this.group.add(this.water);
  }

  buildFacades() {
    // Six facade variants (3/5/8/12 floors, mixed palettes) shared by all buildings.
    const variants = [
      { floors: 3, cols: 4 }, { floors: 5, cols: 5 }, { floors: 8, cols: 6 },
      { floors: 12, cols: 6 }, { floors: 5, cols: 4 }, { floors: 8, cols: 5 },
    ];
    for (const v of variants) {
      const tex = facadeTexture(this.rng, this.rng.pick(FACADE_COLORS), v.floors, v.cols);
      this.facadeMats.push(new THREE.MeshLambertMaterial({ map: tex }));
    }
    this.roofMat = new THREE.MeshLambertMaterial({ map: roofTexture(this.rng) });
  }

  /** Pick the facade variant whose floor count best matches a height. */
  facadeFor(height) {
    const floors = Math.max(1, Math.round(height / 6));
    const counts = [3, 5, 8, 12, 5, 8];
    let best = 0;
    let bestD = Infinity;
    counts.forEach((c, i) => {
      const d = Math.abs(c - floors);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    return this.facadeMats[best];
  }

  addBuilding(cx, cz, w, d, h) {
    const geo = new THREE.BoxGeometry(w, h, d);
    const mats = [this.facadeFor(h), this.facadeFor(h), this.roofMat, this.roofMat, this.facadeFor(h), this.facadeFor(h)];
    const mesh = new THREE.Mesh(geo, mats);
    mesh.position.set(cx, h / 2, cz);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.group.add(mesh);
    this.colliders.push({ minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2 });
    return mesh;
  }

  buildBlocks() {
    for (let bx = -GRID; bx < GRID; bx++) {
      for (let bz = -GRID; bz < GRID; bz++) {
        if (bx === PARK.bx && bz === PARK.bz) continue;
        if (bx === PLAZA.bx && bz === PLAZA.bz) continue;
        const cx = (bx + 0.5) * PITCH;
        const cz = (bz + 0.5) * PITCH;
        if (bx === TOWER.bx && bz === TOWER.bz) {
          // Landmark tower: tall, slim, downtown.
          this.addBuilding(cx, cz, 26, 26, 78);
          continue;
        }
        const kind = this.rng.f();
        if (kind < 0.35) {
          // One big building filling the block.
          this.addBuilding(cx, cz, this.rng.range(34, 42), this.rng.range(34, 42), this.rng.range(12, 42));
        } else if (kind < 0.8) {
          // Two buildings side by side.
          const split = this.rng.chance(0.5) ? 'x' : 'z';
          const off = 11;
          if (split === 'x') {
            this.addBuilding(cx - off, cz, 20, this.rng.range(30, 40), this.rng.range(10, 36));
            this.addBuilding(cx + off, cz, 20, this.rng.range(30, 40), this.rng.range(10, 36));
          } else {
            this.addBuilding(cx, cz - off, this.rng.range(30, 40), 20, this.rng.range(10, 36));
            this.addBuilding(cx, cz + off, this.rng.range(30, 40), 20, this.rng.range(10, 36));
          }
        } else {
          // Four small shops around a courtyard.
          for (const sx of [-11, 11]) {
            for (const sz of [-11, 11]) {
              this.addBuilding(cx + sx, cz + sz, 18, 18, this.rng.range(8, 16));
            }
          }
        }
      }
    }
  }

  buildPark() {
    const cx = (PARK.bx + 0.5) * PITCH;
    const cz = (PARK.bz + 0.5) * PITCH;
    const grass = new THREE.Mesh(
      new THREE.PlaneGeometry(46, 46),
      new THREE.MeshLambertMaterial({ color: 0x5da24a }),
    );
    grass.rotation.x = -Math.PI / 2;
    grass.position.set(cx, 0.06, cz);
    grass.receiveShadow = true;
    this.group.add(grass);
    // Pond.
    const pond = new THREE.Mesh(
      new THREE.CircleGeometry(9, 24),
      new THREE.MeshPhongMaterial({ color: 0x2e8fb0, shininess: 100 }),
    );
    pond.rotation.x = -Math.PI / 2;
    pond.position.set(cx + 8, 0.1, cz - 6);
    this.group.add(pond);
    // Trees: instanced trunks + canopies.
    const spots = [];
    for (let i = 0; i < 14; i++) {
      const x = cx + this.rng.range(-20, 20);
      const z = cz + this.rng.range(-20, 20);
      if (Math.hypot(x - (cx + 8), z - (cz - 6)) < 11) continue;
      spots.push([x, z, this.rng.range(0.8, 1.3)]);
    }
    this.addTrees(spots);
  }

  buildPlaza() {
    const cx = (PLAZA.bx + 0.5) * PITCH;
    const cz = (PLAZA.bz + 0.5) * PITCH;
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(46, 46),
      new THREE.MeshLambertMaterial({ color: 0xd8cdb2 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(cx, 0.06, cz);
    floor.receiveShadow = true;
    this.group.add(floor);
    // Fountain: basin + centre column + water disc.
    const basin = new THREE.Mesh(
      new THREE.CylinderGeometry(7, 7.6, 1.1, 24),
      new THREE.MeshLambertMaterial({ color: 0x9a938a }),
    );
    basin.position.set(cx, 0.55, cz);
    basin.castShadow = true;
    this.group.add(basin);
    const waterDisc = new THREE.Mesh(
      new THREE.CircleGeometry(6.4, 24),
      new THREE.MeshPhongMaterial({ color: 0x3aa7c9, shininess: 140 }),
    );
    waterDisc.rotation.x = -Math.PI / 2;
    waterDisc.position.set(cx, 1.05, cz);
    this.group.add(waterDisc);
    const column = new THREE.Mesh(
      new THREE.CylinderGeometry(0.7, 1.1, 4.5, 10),
      new THREE.MeshLambertMaterial({ color: 0xcfc8ba }),
    );
    column.position.set(cx, 3, cz);
    column.castShadow = true;
    this.group.add(column);
    this.colliders.push({ minX: cx - 7.6, maxX: cx + 7.6, minZ: cz - 7.6, maxZ: cz + 7.6 });
    // Benches and a few palms around the plaza.
    const palmSpots = [];
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      palmSpots.push([cx + Math.cos(a) * 19, cz + Math.sin(a) * 19, 1]);
    }
    this.addPalms(palmSpots);
  }

  buildBeach() {
    // Palms along the sand.
    const spots = [];
    for (let z = -280; z <= 280; z += 28) {
      spots.push([CITY_EDGE + this.rng.range(14, 30), z + this.rng.range(-8, 8), this.rng.range(0.9, 1.4)]);
      if (this.rng.chance(0.5)) spots.push([CITY_EDGE + this.rng.range(34, 44), z + this.rng.range(-8, 8), this.rng.range(0.8, 1.2)]);
    }
    this.addPalms(spots);
    // Boardwalk huts near the marina and the beach party spot.
    for (const [hx, hz, label] of [
      [312, 138, 'MARINA'], [312, -138, 'BEACH BAR'],
    ]) {
      const hut = new THREE.Mesh(
        new THREE.BoxGeometry(10, 4, 7),
        new THREE.MeshLambertMaterial({ color: 0xe8dcc0 }),
      );
      hut.position.set(hx, 2, hz);
      hut.castShadow = true;
      this.group.add(hut);
      const roof = new THREE.Mesh(
        new THREE.ConeGeometry(7.5, 3, 4),
        new THREE.MeshLambertMaterial({ color: 0xc96f4a }),
      );
      roof.position.set(hx, 5.4, hz);
      roof.rotation.y = Math.PI / 4;
      this.group.add(roof);
      this.colliders.push({ minX: hx - 5, maxX: hx + 5, minZ: hz - 3.5, maxZ: hz + 3.5 });
      const sign = new THREE.Mesh(
        new THREE.PlaneGeometry(9, 2.2),
        new THREE.MeshBasicMaterial({ map: signTexture(label, '#20303c', '#ffd76a') }),
      );
      sign.position.set(hx - 5.1, 3.4, hz);
      sign.rotation.y = -Math.PI / 2;
      this.group.add(sign);
    }
  }

  /** Instanced round-canopy trees at [x, z, scale] spots. */
  addTrees(spots) {
    if (!spots.length) return;
    const trunkGeo = new THREE.CylinderGeometry(0.35, 0.5, 3.2, 6);
    const trunkMat = new THREE.MeshLambertMaterial({ color: 0x6b4a2f });
    const crownGeo = new THREE.SphereGeometry(2.6, 8, 6);
    const crownMat = new THREE.MeshLambertMaterial({ color: 0x3f7d33 });
    const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, spots.length);
    const crowns = new THREE.InstancedMesh(crownGeo, crownMat, spots.length);
    const m = new THREE.Matrix4();
    spots.forEach(([x, z, s], i) => {
      m.makeScale(s, s, s);
      m.setPosition(x, 1.6 * s, z);
      trunks.setMatrixAt(i, m);
      m.makeScale(s, s * 0.9, s);
      m.setPosition(x, (3.2 + 2.2) * s, z);
      crowns.setMatrixAt(i, m);
    });
    trunks.castShadow = true;
    crowns.castShadow = true;
    this.group.add(trunks, crowns);
  }

  /** Instanced palms: a leaning trunk and a cone canopy. */
  addPalms(spots) {
    if (!spots.length) return;
    const trunkGeo = new THREE.CylinderGeometry(0.28, 0.42, 6.5, 6);
    const trunkMat = new THREE.MeshLambertMaterial({ color: 0x7a5a38 });
    const crownGeo = new THREE.ConeGeometry(3.4, 3.4, 7);
    const crownMat = new THREE.MeshLambertMaterial({ color: 0x2f8f4e });
    const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, spots.length);
    const crowns = new THREE.InstancedMesh(crownGeo, crownMat, spots.length);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    spots.forEach(([x, z, s], i) => {
      e.set(this.rng.range(-0.12, 0.12), 0, this.rng.range(-0.12, 0.12));
      q.setFromEuler(e);
      m.compose(new THREE.Vector3(x, 3.25 * s, z), q, new THREE.Vector3(s, s, s));
      trunks.setMatrixAt(i, m);
      m.compose(new THREE.Vector3(x, 7.6 * s, z), new THREE.Quaternion(), new THREE.Vector3(s, s, s));
      crowns.setMatrixAt(i, m);
    });
    trunks.castShadow = true;
    crowns.castShadow = true;
    this.group.add(trunks, crowns);
  }

  buildStreetlights() {
    const spots = [];
    for (let k = -GRID; k <= GRID; k++) {
      for (let j = -GRID; j < GRID; j++) {
        spots.push([k * PITCH + 9.5, (j + 0.5) * PITCH]);
        spots.push([(j + 0.5) * PITCH, k * PITCH + 9.5]);
      }
    }
    const poleGeo = new THREE.CylinderGeometry(0.14, 0.2, 7, 6);
    const poleMat = new THREE.MeshLambertMaterial({ color: 0x3c4147 });
    const lampGeo = new THREE.SphereGeometry(0.42, 8, 6);
    const lampMat = new THREE.MeshBasicMaterial({ color: 0xfff2b0 });
    const poles = new THREE.InstancedMesh(poleGeo, poleMat, spots.length);
    const lamps = new THREE.InstancedMesh(lampGeo, lampMat, spots.length);
    const m = new THREE.Matrix4();
    spots.forEach(([x, z], i) => {
      m.makeTranslation(x, 3.5, z);
      poles.setMatrixAt(i, m);
      m.makeTranslation(x, 7.1, z);
      lamps.setMatrixAt(i, m);
    });
    this.group.add(poles, lamps);
  }

  buildSigns() {
    // A few named shop signs on downtown building fronts.
    const signs = [
      { text: 'SOLMAR BANK', x: 30, z: -90, y: 9, ry: Math.PI },
      { text: "DELIA'S", x: -150, z: 150, y: 8, ry: 0 },
      { text: 'TACO SOL', x: 150, z: 90, y: 7, ry: Math.PI / 2 },
      { text: 'SPRAY & GO', x: 90, z: -30, y: 7, ry: -Math.PI / 2 },
      { text: 'SOLMAR HOTEL', x: -30, z: -150, y: 14, ry: 0 },
    ];
    for (const s of signs) {
      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(13, 3.2),
        new THREE.MeshBasicMaterial({ map: signTexture(s.text, '#1d2b36', '#ffd76a') }),
      );
      mesh.position.set(s.x, s.y, s.z);
      mesh.rotation.y = s.ry;
      // Push slightly off the wall so it does not z-fight.
      mesh.translateZ(0.4);
      this.group.add(mesh);
    }
  }

  /** Gentle water shimmer; call every frame. */
  update(t) {
    if (this.water) this.water.position.y = 0.12 + Math.sin(t * 0.6) * 0.05;
  }

  /**
   * Push a circle (x, z, radius) out of every building it overlaps.
   * Returns the corrected position as [x, z].
   */
  resolveCircle(x, z, r) {
    for (const b of this.colliders) {
      const cx = Math.max(b.minX, Math.min(x, b.maxX));
      const cz = Math.max(b.minZ, Math.min(z, b.maxZ));
      const dx = x - cx;
      const dz = z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 < r * r) {
        if (d2 > 1e-6) {
          const d = Math.sqrt(d2);
          x = cx + (dx / d) * r;
          z = cz + (dz / d) * r;
        } else {
          // Centre inside the box: push out along the smallest penetration.
          const pl = x - b.minX;
          const pr = b.maxX - x;
          const pt = z - b.minZ;
          const pb = b.maxZ - z;
          const m = Math.min(pl, pr, pt, pb);
          if (m === pl) x = b.minX - r;
          else if (m === pr) x = b.maxX + r;
          else if (m === pt) z = b.minZ - r;
          else z = b.maxZ + r;
        }
      }
    }
    return [x, z];
  }

  /** True when a circle overlaps any building. */
  hitsBuilding(x, z, r) {
    for (const b of this.colliders) {
      const cx = Math.max(b.minX, Math.min(x, b.maxX));
      const cz = Math.max(b.minZ, Math.min(z, b.maxZ));
      const dx = x - cx;
      const dz = z - cz;
      if (dx * dx + dz * dz < r * r) return true;
    }
    return false;
  }

  /** A random point on a road, for spawning traffic and pedestrians. */
  randomRoadPoint(rng) {
    const road = rng.pick(ROADS);
    const along = rng.range(-240, 240);
    const lane = rng.pick([-4, 4]);
    // Right-hand traffic: on an X-road the +Z lane goes +X; on a Z-road
    // the -X lane goes +Z. Heading 0 faces +Z, PI/2 faces +X.
    return road.axis === 'x'
      ? { x: along, z: road.at + lane, heading: lane < 0 ? -Math.PI / 2 : Math.PI / 2 }
      : { x: road.at + lane, z: along, heading: lane < 0 ? 0 : Math.PI };
  }
}
