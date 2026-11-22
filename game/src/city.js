// Solmar Bay: a procedural sun-soaked coastal city, generated from one
// fixed seed. A street grid of nine avenues each way, 64 blocks, a
// beach and a pier on the south edge, and a hazy skyline beyond the
// playable bounds. Everything static is baked into one geometry batch.

import { Geom, hexColor, shade } from './geometry.js';
import { hash2, mulberry32, pick, randRange, TAU } from './rng.js';

export const CITY_SEED = 20261122;
export const STREET_PITCH = 46;
export const STREET_WIDTH = 10;
export const BLOCK_SIZE = 36;
export const BOUND = 205;
export const BEACH_Z = 196;
export const WATER_Z = 232;

export const STREET_LINES = [-184, -138, -92, -46, 0, 46, 92, 138, 184];
const BLOCK_CENTRES = [-161, -115, -69, -23, 23, 69, 115, 161];

// Special blocks, keyed by grid indices "i,j" over BLOCK_CENTRES.
const SPECIAL_BLOCKS = {
  '3,3': 'plaza',
  '5,2': 'park',
  '2,5': 'park',
  '6,3': 'parking',
  '4,4': 'bank',
  '1,6': 'garage',
  '6,6': 'safehouse',
  '3,5': 'police',
  '5,3': 'hospital',
};

const BUILDING_COLORS = [
  '#f5ead6', '#f2d5b8', '#e8b4a0', '#d9e6dd', '#bcd8e8',
  '#f7d774', '#e8a2a2', '#cbb7e0', '#f0f0e8', '#e0cfa8',
];
const ROOF_COLORS = ['#b8a88e', '#9aa5ad', '#c98f6d', '#8fa8a0'];
const PALM_GREENS = ['#3f9e4d', '#4cab58', '#2f8f46', '#57b25e'];
const UMBRELLA_COLORS = ['#ff5a5a', '#ffd23f', '#3fa7ff', '#ff8fd1', '#7fe0a3'];

function addPalm(geom, colliders, x, z, h, rng) {
  const trunk = hexColor('#8a6a4a');
  geom.cylinder(x, 0, z, 0.16, 0.3, h, 5, trunk);
  const green = hexColor(pick(rng, PALM_GREENS));
  const topY = h;
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU + rng() * 0.4;
    const cx = x + Math.cos(a) * 1.25;
    const cz = z + Math.sin(a) * 1.25;
    geom.box(cx, topY - 0.45, cz, 2.9, 0.09, 0.55, green, -a, 0, -0.5);
  }
  geom.box(x, topY + 0.1, z, 0.7, 0.5, 0.7, shade(green, 0.8));
  colliders.push({ x, z, r: 0.45 });
}

function addLamp(geom, colliders, x, z) {
  const pole = hexColor('#3c4147');
  geom.cylinder(x, 0, z, 0.09, 0.13, 5.6, 5, pole);
  geom.box(x + 0.7, 5.6, z, 1.5, 0.14, 0.14, pole);
  geom.box(x + 1.3, 5.5, z, 0.7, 0.18, 0.3, hexColor('#fff7c0'));
  colliders.push({ x, z, r: 0.3 });
}

function addRoundTree(geom, colliders, x, z, rng) {
  const h = randRange(rng, 2.4, 3.2);
  geom.cylinder(x, 0, z, 0.18, 0.28, h, 5, hexColor('#7a5a3c'));
  const green = hexColor(pick(rng, PALM_GREENS));
  geom.box(x, h + 0.9, z, 2.6, 1.8, 2.6, green, rng() * TAU);
  geom.box(x + 0.7, h + 1.9, z - 0.4, 1.7, 1.2, 1.7, shade(green, 1.15), rng() * TAU);
  colliders.push({ x, z, r: 0.5 });
}

// Window grids on all four faces of a building. A few windows glow
// warm, as if someone is home.
function addWindows(geom, cx, cz, w, d, h, salt) {
  const dark = hexColor('#33475c');
  const lit = hexColor('#ffd98a');
  const faces = [
    { at: cz + d / 2 + 0.08, ry: 0, span: w, fixed: 'z' },
    { at: cz - d / 2 - 0.08, ry: Math.PI, span: w, fixed: 'z' },
    { at: cx + w / 2 + 0.08, ry: Math.PI / 2, span: d, fixed: 'x' },
    { at: cx - w / 2 - 0.08, ry: -Math.PI / 2, span: d, fixed: 'x' },
  ];
  for (const face of faces) {
    const cols = Math.max(1, Math.floor((face.span - 3) / 4.2));
    const rows = Math.max(1, Math.floor((h - 4.5) / 3.4));
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const along = -((cols - 1) / 2) * 4.2 + c * 4.2;
        const y = 3.4 + r * 3.4;
        const warm = hash2(c * 7 + salt, r * 13 + salt, 5) < 0.16;
        const color = warm ? lit : shade(dark, 0.85 + hash2(c, r, salt) * 0.4);
        if (face.fixed === 'z') {
          geom.wallQuad(cx + along, y, face.at, 1.7, 1.9, color, face.ry);
        } else {
          geom.wallQuad(face.at, y, cz + along, 1.7, 1.9, color, face.ry);
        }
      }
    }
  }
}

function addBuilding(geom, solids, cx, cz, w, d, h, colorHex, rng, salt) {
  const color = hexColor(colorHex);
  geom.box(cx, h / 2, cz, w, h, d, color);
  // Roof lip and rooftop plant.
  geom.box(cx, h + 0.25, cz, w + 0.7, 0.5, d + 0.7, shade(color, 0.82));
  const roof = hexColor(pick(rng, ROOF_COLORS));
  geom.box(cx - w / 5, h + 0.9, cz - d / 5, 2.2, 1.1, 1.8, roof);
  if (hash2(salt, 3) > 0.4) {
    geom.box(cx + w / 5, h + 0.8, cz + d / 6, 1.4, 0.9, 1.4, roof);
  }
  // Door on the south face.
  geom.box(cx, 1.3, cz + d / 2 + 0.06, 1.8, 2.6, 0.14, hexColor('#2e3a44'));
  addWindows(geom, cx, cz, w, d, h, salt);
  // The height is kept so the combat raycast can test against the box.
  solids.push({ minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2, h });
}

function buildNormalBlock(geom, solids, colliders, bx, bz, i, j, rng) {
  const distCentre = Math.hypot(bx, bz);
  const centreBonus = Math.max(0, 26 - distCentre * 0.11);
  const pattern = hash2(i, j, 11);
  const salt = i * 31 + j * 17;
  if (pattern < 0.34) {
    // One tower, taller toward downtown.
    const w = randRange(rng, 20, 27);
    const d = randRange(rng, 20, 27);
    const h = 9 + hash2(i, j, 21) * 13 + centreBonus;
    addBuilding(geom, solids, bx, bz, w, d, Math.min(46, h), pick(rng, BUILDING_COLORS), rng, salt);
  } else if (pattern < 0.62) {
    // Four small blocks around a courtyard.
    for (const [ox, oz] of [[-9, -9], [9, -9], [-9, 9], [9, 9]]) {
      const h = 7 + hash2(i + ox, j + oz, 31) * 8 + centreBonus * 0.3;
      addBuilding(geom, solids, bx + ox, bz + oz, 12.5, 12.5, h, pick(rng, BUILDING_COLORS), rng, salt + ox);
    }
  } else if (pattern < 0.85) {
    // A row of two slabs.
    for (const ox of [-9.5, 9.5]) {
      const h = 9 + hash2(i + ox, j, 41) * 9 + centreBonus * 0.4;
      addBuilding(geom, solids, bx + ox, bz, 14, 24, h, pick(rng, BUILDING_COLORS), rng, salt + ox);
    }
  } else {
    // One low wide slab with a bright awning stripe.
    const h = 6 + hash2(i, j, 51) * 4;
    addBuilding(geom, solids, bx, bz, 30, 17, h, pick(rng, BUILDING_COLORS), rng, salt);
    const awning = hexColor(pick(rng, ['#ff5a5a', '#ffd23f', '#3fa7ff', '#7fe0a3']));
    geom.box(bx, h - 0.6, bz + 17 / 2 + 0.35, 26, 0.35, 1.1, awning);
  }
  // A palm or two on the block's corners.
  if (hash2(i, j, 61) > 0.45) {
    addPalm(geom, colliders, bx - 15, bz - 15, randRange(rng, 5.5, 7), rng);
  }
  if (hash2(i, j, 71) > 0.55) {
    addPalm(geom, colliders, bx + 15, bz + 15, randRange(rng, 5.5, 7), rng);
  }
}

function buildPlaza(geom, colliders, bx, bz, rng) {
  const stone = hexColor('#e6ddc8');
  geom.flatQuad(bx, bz, 0.03, 34, 34, stone);
  // Fountain: basin, water, column.
  geom.cylinder(bx, 0.03, bz, 4.4, 4.6, 0.9, 12, hexColor('#cfc4a8'));
  geom.cylinder(bx, 0.75, bz, 3.9, 3.9, 0.12, 12, hexColor('#4db8d8'));
  geom.cylinder(bx, 0.8, bz, 0.5, 0.7, 2.4, 8, hexColor('#e8e0cc'));
  geom.cylinder(bx, 3.2, bz, 1.4, 0.2, 0.5, 8, hexColor('#e8e0cc'));
  colliders.push({ x: bx, z: bz, r: 4.6 });
  for (const [ox, oz] of [[-13, -13], [13, -13], [-13, 13], [13, 13]]) {
    addPalm(geom, colliders, bx + ox, bz + oz, randRange(rng, 6, 7.5), rng);
  }
  // Benches facing the fountain.
  for (const [ox, oz, ry] of [[-8, 0, 0], [8, 0, Math.PI], [0, -8, Math.PI / 2], [0, 8, -Math.PI / 2]]) {
    geom.box(bx + ox, 0.5, bz + oz, 2.4, 0.18, 0.7, hexColor('#a9825a'), ry);
    geom.box(bx + ox, 0.25, bz + oz, 0.18, 0.5, 0.6, hexColor('#5a4a38'), ry);
  }
}

function buildPark(geom, colliders, bx, bz, rng) {
  geom.flatQuad(bx, bz, 0.03, 34, 34, hexColor('#8fc98a'));
  for (let k = 0; k < 6; k++) {
    const x = bx + randRange(rng, -14, 14);
    const z = bz + randRange(rng, -14, 14);
    addRoundTree(geom, colliders, x, z, rng);
  }
  addPalm(geom, colliders, bx - 14, bz + 14, 6.5, rng);
  addPalm(geom, colliders, bx + 14, bz - 14, 6, rng);
  geom.box(bx - 6, 0.5, bz + 4, 2.4, 0.18, 0.7, hexColor('#a9825a'));
  geom.box(bx + 7, 0.5, bz - 5, 2.4, 0.18, 0.7, hexColor('#a9825a'), Math.PI / 2);
}

function buildParking(geom, bx, bz) {
  geom.flatQuad(bx, bz, 0.03, 34, 34, hexColor('#4a4f55'));
  for (let k = 0; k < 8; k++) {
    const x = bx - 12 + k * 3.4;
    geom.flatQuad(x, bz - 8, 0.05, 0.25, 5, hexColor('#e8e4d8'));
    geom.flatQuad(x, bz + 8, 0.05, 0.25, 5, hexColor('#e8e4d8'));
  }
}

function buildBank(geom, solids, bx, bz, rng) {
  addBuilding(geom, solids, bx, bz, 26, 24, 40, '#f2e8c8', rng, 991);
  // Gold trim band and entrance columns.
  const gold = hexColor('#d9a441');
  geom.box(bx, 12.5, bz, 26.6, 0.8, 24.6, gold);
  geom.box(bx, 38.5, bz, 26.6, 0.8, 24.6, gold);
  for (const ox of [-9, -3, 3, 9]) {
    geom.cylinder(bx + ox, 0, bz + 13.5, 0.55, 0.65, 9, 8, hexColor('#f7f2e2'));
  }
  geom.box(bx, 9.4, bz + 13.5, 22, 0.7, 2.4, hexColor('#f7f2e2'));
  geom.box(bx, 0.35, bz + 15.5, 20, 0.7, 5, hexColor('#d8d2c0'));
}

function buildGarage(geom, solids, bx, bz, rng) {
  addBuilding(geom, solids, bx, bz, 30, 15, 7, '#e8b4a0', rng, 992);
  // Open workshop bay on the north face, and a yellow sign on the roof.
  geom.box(bx, 2.6, bz - 15 / 2 - 0.05, 12, 5.2, 0.3, hexColor('#22262b'));
  geom.box(bx, 7.9, bz, 14, 1.6, 1.2, hexColor('#ffd23f'));
  geom.box(bx + 9, 2.6, bz - 15 / 2 - 0.05, 3.4, 5.2, 0.3, hexColor('#3a3f44'));
}

function buildSafehouse(geom, solids, bx, bz, rng) {
  addBuilding(geom, solids, bx, bz, 12, 10, 5.5, '#f5ead6', rng, 993);
  // Pyramid roof.
  geom.cylinder(bx, 5.5, bz, 0.1, 9.2, 3.4, 4, hexColor('#c96f4a'), Math.PI / 4);
  geom.flatQuad(bx, bz + 9, 0.04, 10, 6, hexColor('#8fc98a'));
}

function buildPoliceStation(geom, solids, bx, bz, rng) {
  addBuilding(geom, solids, bx, bz, 24, 17, 12, '#eef2f5', rng, 994);
  geom.box(bx, 8.6, bz, 24.4, 1.4, 17.4, hexColor('#2f6fd0'));
  // Flag pole with a blue flag.
  geom.cylinder(bx - 10, 0, bz + 11, 0.08, 0.1, 9, 5, hexColor('#888888'));
  geom.box(bx - 8.9, 8.2, bz + 11, 2.1, 1.1, 0.06, hexColor('#2f6fd0'));
}

function buildHospital(geom, solids, bx, bz, rng) {
  addBuilding(geom, solids, bx, bz, 26, 19, 14, '#f4f7f7', rng, 995);
  // Red cross on the roof.
  const red = hexColor('#e23b3b');
  geom.box(bx, 14.6, bz, 5.4, 0.5, 1.8, red);
  geom.box(bx, 14.6, bz, 1.8, 0.5, 5.4, red);
  geom.box(bx, 3.6, bz + 11.5, 8, 0.4, 3.4, hexColor('#d8d2c0'));
}

function buildPier(geom, colliders) {
  const wood = hexColor('#a9825a');
  const woodDark = hexColor('#8a6c46');
  // Deck from the beach out into the bay. The slab is thin and low so
  // feet walk on it rather than through it; rails run along the sides.
  geom.box(0, 0.02, 255, 8, 0.25, 92, wood);
  for (const side of [-3.9, 3.9]) {
    geom.box(side, 1.0, 255, 0.25, 0.8, 92, woodDark);
    for (let z = 214; z <= 296; z += 10) {
      geom.box(side, 0.6, z, 0.25, 1.2, 0.25, woodDark);
    }
  }
  for (let z = 214; z <= 296; z += 11.7) {
    geom.cylinder(-3.4, -1.5, z, 0.3, 0.35, 2.6, 5, woodDark);
    geom.cylinder(3.4, -1.5, z, 0.3, 0.35, 2.6, 5, woodDark);
  }
  // End platform with a hut, crates and lamps.
  geom.box(0, 0.02, 298, 15, 0.25, 8, wood);
  geom.box(-4.5, 2.05, 298, 5, 3.8, 4.5, hexColor('#e8dcc0'));
  geom.box(-4.5, 4.25, 298, 5.8, 0.4, 5.2, hexColor('#c96f4a'));
  geom.box(3.5, 0.75, 296, 1.2, 1.2, 1.2, hexColor('#b08954'));
  geom.box(4.8, 0.75, 298.5, 1.2, 1.2, 1.2, hexColor('#b08954'));
  geom.box(4.1, 1.95, 297.2, 1.1, 1.1, 1.1, hexColor('#9a7a48'));
  colliders.push({ x: -4.5, z: 298, r: 3.4 });
  for (const z of [230, 260, 290]) {
    addLamp(geom, colliders, -3.2, z);
  }
}

function buildBeach(geom, colliders, rng) {
  // Sand, towels and umbrellas along the shore.
  for (let k = 0; k < 10; k++) {
    const x = -170 + k * 38 + randRange(rng, -8, 8);
    const z = randRange(rng, 202, 222);
    geom.cylinder(x, 0, z, 0.06, 0.06, 2.3, 4, hexColor('#dddddd'));
    geom.cylinder(x, 2.3, z, 0.1, 1.9, 0.75, 8, hexColor(pick(rng, UMBRELLA_COLORS)));
    colliders.push({ x, z, r: 0.3 });
    geom.flatQuad(x + 2.2, z + 1.5, 0.06, 1.1, 2.1, hexColor(pick(rng, UMBRELLA_COLORS)), rng() * TAU);
  }
  // Lifeguard tower.
  const tx = 36;
  const tz = 214;
  for (const [ox, oz] of [[-1.2, -1.2], [1.2, -1.2], [-1.2, 1.2], [1.2, 1.2]]) {
    geom.box(tx + ox, 1.5, tz + oz, 0.25, 3, 0.25, hexColor('#e8e4d8'));
  }
  geom.box(tx, 3.9, tz, 3.4, 2.2, 3, hexColor('#ff5a5a'));
  geom.box(tx, 5.2, tz, 4, 0.3, 3.6, hexColor('#f7f2e2'));
  geom.box(tx, 4.4, tz + 1.6, 2.2, 1, 0.15, hexColor('#33475c'));
  colliders.push({ x: tx, z: tz, r: 1.9 });
  // Palm row along the sand.
  for (let x = -180; x <= 180; x += 26) {
    if (Math.abs(x) < 10) continue; // keep the pier approach clear
    addPalm(geom, colliders, x + randRange(rng, -4, 4), 200 + randRange(rng, -2, 2), randRange(rng, 6, 8), rng);
  }
}

function buildSkyline(geom, rng) {
  // Distant towers beyond the playable bounds, faded by fog.
  const tones = ['#8fa8bd', '#7d97ad', '#9db4c6', '#6f8ba3'];
  for (let k = 0; k < 26; k++) {
    const side = k % 3; // north, west, east
    let x;
    let z;
    if (side === 0) {
      x = randRange(rng, -260, 260);
      z = randRange(rng, -280, -225);
    } else if (side === 1) {
      x = randRange(rng, -280, -225);
      z = randRange(rng, -240, 200);
    } else {
      x = randRange(rng, 225, 280);
      z = randRange(rng, -240, 200);
    }
    const w = randRange(rng, 18, 34);
    const h = randRange(rng, 28, 72);
    geom.box(x, h / 2, z, w, h, w, hexColor(pick(rng, tones)));
  }
}

export function buildCity() {
  const rng = mulberry32(CITY_SEED);
  const geom = new Geom();
  const colliders = [];
  const solids = [];
  const blocks = [];
  const parkingSpots = [];

  // Ground, sand and sea.
  geom.flatQuad(0, -14, 0, 520, 492, hexColor('#c9c2ae'));
  geom.flatQuad(0, 214, 0.02, 520, 36, hexColor('#ecd9a8'));
  geom.flatQuad(0, 466, -0.25, 1100, 470, hexColor('#2a9ec4'));
  geom.flatQuad(0, 300, -0.2, 1100, 140, hexColor('#37b3d6'));

  // Roads and their centre dashes.
  const asphalt = hexColor('#3a3f44');
  const dash = hexColor('#e8e4d8');
  for (const line of STREET_LINES) {
    geom.flatQuad(line, -14, 0.01, STREET_WIDTH, 492, asphalt);
    geom.flatQuad(0, line, 0.01, 520, STREET_WIDTH, asphalt);
  }
  for (const line of STREET_LINES) {
    for (let s = -196; s <= 196; s += 8) {
      const nearCrossing = STREET_LINES.some((c) => Math.abs(s - c) < 7);
      if (nearCrossing) continue;
      geom.flatQuad(line, s, 0.03, 0.35, 2.4, dash);
      geom.flatQuad(s, line, 0.03, 2.4, 0.35, dash);
    }
  }

  // Blocks.
  for (let i = 0; i < 8; i++) {
    for (let j = 0; j < 8; j++) {
      const bx = BLOCK_CENTRES[i];
      const bz = BLOCK_CENTRES[j];
      const kind = SPECIAL_BLOCKS[`${i},${j}`] || 'buildings';
      blocks.push({ cx: bx, cz: bz, kind });
      // Sidewalk slab under every block.
      geom.flatQuad(bx, bz, 0.02, 42, 42, hexColor('#d8d2c0'));
      if (kind === 'buildings') buildNormalBlock(geom, solids, colliders, bx, bz, i, j, rng);
      else if (kind === 'plaza') buildPlaza(geom, colliders, bx, bz, rng);
      else if (kind === 'park') buildPark(geom, colliders, bx, bz, rng);
      else if (kind === 'parking') {
        buildParking(geom, bx, bz);
        for (let k = 0; k < 4; k++) {
          parkingSpots.push({ x: bx - 10 + k * 7, z: bz - 8, heading: 0 });
          parkingSpots.push({ x: bx - 10 + k * 7, z: bz + 8, heading: Math.PI });
        }
      } else if (kind === 'bank') buildBank(geom, solids, bx, bz, rng);
      else if (kind === 'garage') buildGarage(geom, solids, bx, bz, rng);
      else if (kind === 'safehouse') buildSafehouse(geom, solids, bx, bz, rng);
      else if (kind === 'police') buildPoliceStation(geom, solids, bx, bz, rng);
      else if (kind === 'hospital') buildHospital(geom, solids, bx, bz, rng);
    }
  }

  // Palms and lamps along the streets.
  for (const line of STREET_LINES) {
    for (let s = -190; s <= 190; s += 30) {
      const nearCrossing = STREET_LINES.some((c) => Math.abs(s - c) < 9);
      if (nearCrossing) continue;
      const side = hash2(line, s, 3) > 0.5 ? 6.9 : -6.9;
      if (hash2(line, s, 7) > 0.3) {
        addPalm(geom, colliders, line + side, s, randRange(rng, 5.5, 7.5), rng);
        addPalm(geom, colliders, s, line - side, randRange(rng, 5.5, 7.5), rng);
      }
    }
    for (const cross of STREET_LINES) {
      addLamp(geom, colliders, line + 6.5, cross + 6.5);
    }
  }

  buildPier(geom, colliders);
  buildBeach(geom, colliders, rng);
  buildSkyline(geom, rng);

  const landmarks = {
    spawn: { x: -23, z: -6, heading: Math.PI },
    plaza: { x: -23, z: -23 },
    pierStart: { x: 0, z: 214 },
    pierEnd: { x: 0, z: 292 },
    bank: { x: 23, z: 23 },
    bankDoor: { x: 23, z: 42 },
    garage: { x: -115, z: 115 },
    garageDoor: { x: -115, z: 96 },
    safehouse: { x: 115, z: 115 },
    safehouseDoor: { x: 115, z: 100 },
    police: { x: -23, z: 69 },
    policeDoor: { x: -23, z: 54 },
    hospital: { x: 69, z: -23 },
    hospitalDoor: { x: 69, z: -8 },
    missionCarSpot: { x: -10, z: -40, heading: Math.PI / 2 },
    dropPoint: { x: 161, z: -161 },
  };

  function isOnPier(x, z) {
    return Math.abs(x) <= 4.2 && z > WATER_Z - 4 && z < 301;
  }

  function isOnRoad(x, z) {
    for (const line of STREET_LINES) {
      if (Math.abs(x - line) < STREET_WIDTH / 2) return true;
      if (Math.abs(z - line) < STREET_WIDTH / 2) return true;
    }
    return false;
  }

  // Push a circle out of buildings, props, the map edge and the sea.
  // Returns the corrected position.
  function collideCircle(x, z, r) {
    for (let pass = 0; pass < 2; pass++) {
      for (const s of solids) {
        const cx = Math.max(s.minX, Math.min(x, s.maxX));
        const cz = Math.max(s.minZ, Math.min(z, s.maxZ));
        const dx = x - cx;
        const dz = z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 < r * r) {
          if (d2 > 1e-6) {
            const d = Math.sqrt(d2);
            x = cx + (dx / d) * r;
            z = cz + (dz / d) * r;
          } else {
            // Centre inside the box: push out along the smallest overlap.
            const pushL = x - s.minX + r;
            const pushR = s.maxX - x + r;
            const pushU = z - s.minZ + r;
            const pushD = s.maxZ - z + r;
            const m = Math.min(pushL, pushR, pushU, pushD);
            if (m === pushL) x = s.minX - r;
            else if (m === pushR) x = s.maxX + r;
            else if (m === pushU) z = s.minZ - r;
            else z = s.maxZ + r;
          }
        }
      }
      for (const c of colliders) {
        const dx = x - c.x;
        const dz = z - c.z;
        const rr = r + c.r;
        const d2 = dx * dx + dz * dz;
        if (d2 < rr * rr && d2 > 1e-6) {
          const d = Math.sqrt(d2);
          x = c.x + (dx / d) * rr;
          z = c.z + (dz / d) * rr;
        }
      }
    }
    x = Math.max(-BOUND, Math.min(BOUND, x));
    // North edge is the map bound; the south edge is the sea, and only
    // the pier crosses it — so z is never clamped to BOUND down here,
    // or the beach and the pier would be unreachable.
    z = Math.max(-BOUND, z);
    if (z > WATER_Z - 2) {
      if (Math.abs(x) <= 4.2 && z < 300) {
        x = Math.max(-3.7, Math.min(3.7, x));
        z = Math.min(z, 298);
      } else {
        z = WATER_Z - 2;
      }
    }
    return { x, z };
  }

  function randomRoadPoint(rngInstance) {
    const vertical = rngInstance() > 0.5;
    const line = pick(rngInstance, STREET_LINES);
    const s = randRange(rngInstance, -185, 185);
    return vertical ? { x: line, z: s } : { x: s, z: line };
  }

  function randomSidewalkPoint(rngInstance) {
    const vertical = rngInstance() > 0.5;
    const line = pick(rngInstance, STREET_LINES);
    const side = rngInstance() > 0.5 ? 6.9 : -6.9;
    const s = randRange(rngInstance, -185, 185);
    return vertical ? { x: line + side, z: s } : { x: s, z: line + side };
  }

  return {
    geom,
    colliders,
    solids,
    blocks,
    parkingSpots,
    landmarks,
    collideCircle,
    isOnRoad,
    isOnPier,
    randomRoadPoint,
    randomSidewalkPoint,
  };
}
