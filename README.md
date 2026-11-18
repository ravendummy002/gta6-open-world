# gta6-open-world

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/ravendummy002/gta6-open-world/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/ravendummy002/gta6-open-world/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

**Solmar — Streets of Solmar**: an original open-world crime game built from scratch for the
make.fun gta6-01 bounty ("Make GTA 6"). Teo Reyes, a wheelman fresh out of lockup,
works four story missions for fixer Delia Voss across Solmar Bay — a seeded procedural coastal
city with wide avenues, a marina, a plaza, a park, and a beach bar that never closes.

Everything in the game is original: the city, the characters, the vehicles, the story, the art
(all procedural — canvas-drawn textures, box-built cars and people), and the sound (fully
synthesised WebAudio, no audio files). No borrowed names, logos, characters, maps or assets
from any other game appear anywhere.

## What's in the city

- **A city to explore on foot and by car** — third-person orbit camera on foot, chase camera
  behind the wheel, arcade driving with handbrake drifts
- **Traffic and pedestrians** — cars cruise the road grid and turn at intersections; walkers
  stroll the sidewalks and flee from gunfire and fast cars
- **Stealing cars** — press F near any car to take it (the cops notice if they see you)
- **A wanted system** — 0–5 stars for theft, violence and cop kills; foot cops chase and try
  to bust you, pursuit cars ram you; lose the heat by hiding, or pay $100 for a respray at
  Spray & Go
- **Four story missions** — First Fare, Hot Wheels, Beach Party Crashers, and The Big Score,
  with objective markers, a minimap, and cash rewards
- **Combat** — pistol with tracer fire, muzzle flash, and gang members who shoot back
- **HUD with a live minimap** — wanted stars, money, health, speedometer, objective banner
- **Start screen, pause, and saves** — progress autosaves to localStorage
- **Synthesised sound** — engine hum, gunfire, sirens, horn, and a slow synth loop (M to mute)

## Run it

```sh
node serve.ts
```

Then open http://localhost:8080. No build step, no network requests — the game is static
files under `game/` (three.js is vendored under `game/vendor/`).

Controls: **WASD** move/drive · **Mouse** look (click to lock) · **Shift** run ·
**Space** jump/handbrake · **Click** shoot/horn · **F** enter/exit car ·
**E** start mission · **P** pause · **M** mute.

Screenshots: `shots.json` lists the four `?shot=` scenes (`start`, `drive`, `foot`, `chase`).

---

<sub>Entered on [make.fun](https://make.fun/?ref=r16q3s2q&utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards</sub>
