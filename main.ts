// Solmar — Streets of Solmar: entry program for make.fun bounty gta6-01.
// Node 22, standard library only. It hands the game in by copying the
// static game/ folder and the screenshots/ folder into the output
// directory, then writing the dossier the judge reads.
//
// The grader runs this twice in a fresh container with no network and
// requires both runs to write identical bytes, so everything here is a
// plain copy plus the deterministic dossier builder from the kit's
// vendored library. Outside the grader, MAKEFUN_OUTPUT_DIR stands in
// for /output:
//
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const repoRoot = fileURLToPath(new URL('.', import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

function copyTree(from, to) {
  if (existsSync(from)) {
    cpSync(from, to, { recursive: true });
  }
}

if (!existsSync(join(repoRoot, 'game', 'index.html'))) {
  throw new Error('game/index.html is missing: nothing to hand in');
}

mkdirSync(outDir, { recursive: true });
copyTree(join(repoRoot, 'game'), join(outDir, 'game'));
mkdirSync(join(outDir, 'screenshots'), { recursive: true });
copyTree(join(repoRoot, 'screenshots'), join(outDir, 'screenshots'));

// The dossier caps mirror the gate's own limits: at most 4 screenshots
// of 256 KiB each, game/ under 993 entries and 48 MiB, and the dossier
// text held to 160 KiB so the judge's outline stays readable.
const dossier = buildDossier(outDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
});
writeFileSync(join(outDir, 'dossier.json'), dossier);
console.log(`Solmar entry written to ${outDir} (dossier ${dossier.length} bytes)`);
