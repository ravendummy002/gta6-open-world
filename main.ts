// Solmar — Streets of Solmar, a gta6-01 entry (Node 22, standard library only).
// The game is this directory's game/ folder: plain static files a desktop browser loads offline
// (game/index.html and its ES modules, three.js vendored under game/vendor/, no network request),
// and this program hands it in. It copies game/ and screenshots/ from beside this file to /output
// and writes /output/dossier.json, the summary the judge reads, with the vendored make.fun library.
//
// The game itself is an original open-world crime game, built from scratch: Teo Reyes, a wheelman
// fresh out of lockup, works four story missions for fixer Delia Voss across Solmar Bay, a seeded
// procedural coastal city. On foot and by car, with traffic, pedestrians, car theft, a 0–5 star
// wanted system with police pursuit, pistol combat, a HUD with a live minimap, a start screen,
// localStorage saves, and fully synthesised WebAudio sound — no copied assets anywhere.
// Screenshots are taken with headless Chromium over the ?shot= scenes in game/src/shots.js;
// the first by name is the cover.
//
// Serve it locally with `node serve.ts`, then open http://localhost:8080.
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });

// The scorer's own caps (reference/gate.json): only text_max_bytes shapes the bytes; the others refuse an entry the
// scorer would refuse (more than 4 screenshots or one over 256 KiB; more than 993 files in game/ or 48 MiB of game
// files, in all, or a path under game/ over 1000 bytes: game/ counts beside /output's own 1000-entry cap, its
// screenshots/ and dossier.json).
// Solmar ships 4 screenshots (start, drive, foot, chase) and a game/ of
// ~2.2 MB, comfortably inside every cap below.
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);
