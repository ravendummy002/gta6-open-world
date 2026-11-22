// The HUD: wanted stars, cash, health, ammo, speed, mission objective,
// subtitles, banners, toasts, and the live minimap. All DOM except the
// minimap, which is a small 2D canvas redrawn every frame.

import { STREET_LINES } from './city.js';
import { dist } from './rng.js';

const MINIMAP_WORLD = 430; // world units across the minimap

export class HUD {
  constructor() {
    this.el = {};
    this.mapCtx = null;
    this.subtitleQueue = [];
    this.subtitleTimer = 0;
    this.subtitleShown = '';
    this.bannerTimer = 0;
    this.toastTimer = 0;
    this.damageTimer = 0;
    this.game = null;
  }

  bind(game) {
    this.game = game;
    const $ = (id) => document.getElementById(id);
    for (const id of [
      'hud', 'hud-stars', 'hud-cash', 'hud-mission-title', 'hud-objective',
      'hud-distance', 'hud-health-fill', 'hud-ammo', 'hud-speed',
      'hud-crosshair', 'hud-prompt', 'hud-hint', 'hud-subtitles',
      'hud-subtitle-who', 'hud-subtitle-text', 'hud-banner',
      'hud-banner-title', 'hud-banner-sub', 'hud-toast', 'hud-damage',
      'hud-minimap', 'overlay-start', 'overlay-pause', 'overlay-busted',
      'overlay-wasted', 'overlay-complete', 'btn-play', 'btn-continue',
      'btn-resume', 'btn-restart', 'btn-mute', 'btn-pause-mute',
      'btn-busted-ok', 'btn-wasted-ok', 'btn-complete-ok',
      'start-save-info', 'busted-text', 'wasted-text', 'mute-label',
      'pause-mute-label',
    ]) {
      this.el[id] = $(id);
    }
    const mapCanvas = this.el['hud-minimap'];
    if (mapCanvas) this.mapCtx = mapCanvas.getContext('2d');

    this.el['btn-play'].addEventListener('click', () => {
      game.audio.click();
      game.startGame({ fresh: true });
    });
    this.el['btn-continue'].addEventListener('click', () => {
      game.audio.click();
      game.startGame({ fresh: false });
    });
    this.el['btn-resume'].addEventListener('click', () => {
      game.audio.click();
      game.resumeGame();
    });
    this.el['btn-restart'].addEventListener('click', () => {
      game.audio.click();
      game.restartRun();
    });
    const mute = () => game.toggleMute();
    this.el['btn-mute'].addEventListener('click', mute);
    this.el['btn-pause-mute'].addEventListener('click', mute);
    this.el['btn-busted-ok'].addEventListener('click', () => {
      game.audio.click();
      game.afterBusted();
    });
    this.el['btn-wasted-ok'].addEventListener('click', () => {
      game.audio.click();
      game.afterWasted();
    });
    this.el['btn-complete-ok'].addEventListener('click', () => {
      game.audio.click();
      this.el['overlay-complete'].classList.add('hidden');
      game.resumeGame();
    });
  }

  hideOverlays() {
    for (const id of ['overlay-start', 'overlay-pause', 'overlay-busted', 'overlay-wasted', 'overlay-complete']) {
      this.el[id].classList.add('hidden');
    }
    this.el['hud'].classList.remove('hidden');
  }

  showStart(save) {
    this.el['overlay-start'].classList.remove('hidden');
    this.el['hud'].classList.add('hidden');
    if (save) {
      const date = new Date(save.savedAt).toLocaleString();
      this.el['start-save-info'].textContent = `Save found — $${save.cash}, ${save.missionsDone} mission${save.missionsDone === 1 ? '' : 's'} done, ${date}`;
      this.el['btn-continue'].classList.remove('hidden');
    } else {
      this.el['start-save-info'].textContent = 'No save yet — a fresh start in Solmar Bay.';
      this.el['btn-continue'].classList.add('hidden');
    }
  }

  showPause() {
    this.el['overlay-pause'].classList.remove('hidden');
  }

  showBusted(fine) {
    this.el['busted-text'].textContent = `The Solmar Bay police took you in. Fine: $${fine}.`;
    this.el['overlay-busted'].classList.remove('hidden');
  }

  showWasted(lost) {
    this.el['wasted-text'].textContent = `You went down in Solmar Bay. The hospital bill was $${lost}.`;
    this.el['overlay-wasted'].classList.remove('hidden');
  }

  showComplete() {
    this.el['overlay-complete'].classList.remove('hidden');
  }

  banner(title, sub, dur) {
    this.el['hud-banner-title'].textContent = title;
    this.el['hud-banner-sub'].textContent = sub || '';
    this.el['hud-banner'].classList.remove('hidden');
    this.bannerTimer = dur || 3;
  }

  toast(text, dur) {
    this.el['hud-toast'].textContent = text;
    this.el['hud-toast'].classList.remove('hidden');
    this.toastTimer = dur || 2.5;
  }

  say(who, text) {
    this.subtitleQueue.push({ who, text });
  }

  damageFlash() {
    this.damageTimer = 0.6;
  }

  setMuted(muted) {
    const label = muted ? 'Sound: Off (M)' : 'Sound: On (M)';
    this.el['mute-label'].textContent = label;
    this.el['pause-mute-label'].textContent = label;
  }

  update(dt, game) {
    const el = this.el;
    const player = game.player;
    const police = game.police;

    // Wanted stars — they blink while the player is losing the heat.
    const stars = '★'.repeat(police.wanted) + '☆'.repeat(5 - police.wanted);
    el['hud-stars'].textContent = stars;
    el['hud-stars'].classList.toggle('evading', police.evading && police.wanted > 0);
    el['hud-stars'].classList.toggle('hot', police.wanted >= 3);
    el['hud-cash'].textContent = '$' + game.cash.toLocaleString('en-US');

    // Health bar.
    const hp = Math.max(0, Math.round(player.health));
    el['hud-health-fill'].style.width = hp + '%';
    el['hud-health-fill'].classList.toggle('low', hp < 30);

    // Ammo on foot, speed in a car.
    if (player.car) {
      el['hud-ammo'].classList.add('hidden');
      const kmh = Math.round(Math.abs(player.car.speed) * 3.6);
      el['hud-speed'].textContent = kmh + ' km/h';
      el['hud-speed'].classList.remove('hidden');
    } else {
      el['hud-speed'].classList.add('hidden');
      const reloading = game.combat.reloadTimer > 0;
      el['hud-ammo'].textContent = reloading ? 'RELOADING…' : `AMMO ${game.combat.ammo} / ${game.combat.magSize}`;
      el['hud-ammo'].classList.remove('hidden');
    }

    // Mission objective and distance to the marker.
    const missions = game.missions;
    el['hud-mission-title'].textContent = missions.active
      ? missions.active.def.title
      : missions.storyComplete
        ? 'Solmar Bay'
        : 'Next job';
    el['hud-objective'].textContent = missions.objectiveText;
    if (missions.marker) {
      const d = Math.round(dist(player.x, player.z, missions.marker.x, missions.marker.z));
      el['hud-distance'].textContent = d + 'm';
    } else {
      el['hud-distance'].textContent = '';
    }

    // Interaction prompt.
    let prompt = '';
    if (player.car) {
      prompt = 'E — Exit car · Space — Handbrake · H — Horn';
    } else {
      const nearCar = game.allCars().some((c) => {
        const dx = c.x - player.x;
        const dz = c.z - player.z;
        return dx * dx + dz * dz < 3.6 * 3.6;
      });
      if (nearCar) prompt = 'E — Enter car';
      else if (!missions.active && !missions.storyComplete) prompt = 'Follow the yellow marker to your next job';
      else prompt = 'LMB / F — Shoot · R — Reload · Shift — Sprint';
    }
    el['hud-prompt'].textContent = prompt;

    // Control hints for the first half-minute of play.
    el['hud-hint'].classList.toggle('hidden', game.time > 30 || game.state !== 'playing');

    // Crosshair only on foot.
    el['hud-crosshair'].classList.toggle('hidden', !!player.car);

    // Subtitles: one line at a time, typed out.
    if (this.subtitleTimer <= 0 && this.subtitleQueue.length > 0) {
      const line = this.subtitleQueue.shift();
      this.el['hud-subtitle-who'].textContent = line.who;
      this.el['hud-subtitle-text'].textContent = '';
      this.subtitleShown = line.text;
      this.subtitleTimer = 3.6;
      this.el['hud-subtitles'].classList.remove('hidden');
    }
    if (this.subtitleTimer > 0) {
      this.subtitleTimer -= dt;
      const total = this.subtitleShown.length;
      const shown = Math.min(total, Math.ceil(((3.6 - this.subtitleTimer) / 0.9) * total));
      this.el['hud-subtitle-text'].textContent = this.subtitleShown.slice(0, shown);
      if (this.subtitleTimer <= 0) {
        this.el['hud-subtitles'].classList.add('hidden');
      }
    }

    if (this.bannerTimer > 0) {
      this.bannerTimer -= dt;
      if (this.bannerTimer <= 0) this.el['hud-banner'].classList.add('hidden');
    }
    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) this.el['hud-toast'].classList.add('hidden');
    }

    // Damage vignette: flashes on a hit, throbs at low health.
    this.damageTimer = Math.max(0, this.damageTimer - dt);
    let vignette = this.damageTimer * 1.2;
    if (hp < 30 && hp > 0) vignette = Math.max(vignette, 0.3 + Math.sin(game.time * 4) * 0.12);
    el['hud-damage'].style.opacity = Math.min(0.85, vignette).toFixed(2);

    this.drawMinimap(game);
  }

  drawMinimap(game) {
    const ctx = this.mapCtx;
    if (!ctx) return;
    const S = 170;
    const scale = S / MINIMAP_WORLD;
    const toMap = (x, z) => [(x + MINIMAP_WORLD / 2) * scale, (z + MINIMAP_WORLD / 2) * scale];

    ctx.fillStyle = '#1d3038';
    ctx.fillRect(0, 0, S, S);
    // Sea along the bottom edge.
    const [, waterY] = toMap(0, 232);
    ctx.fillStyle = '#2a9ec4';
    ctx.fillRect(0, waterY, S, S - waterY);
    // Sand strip.
    const [, sandY] = toMap(0, 196);
    ctx.fillStyle = '#cbb37a';
    ctx.fillRect(0, sandY, S, waterY - sandY);
    // Roads.
    ctx.strokeStyle = '#6b7a86';
    ctx.lineWidth = 3;
    for (const line of STREET_LINES) {
      const [x] = toMap(line, 0);
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, S);
      ctx.stroke();
      const [, y] = toMap(0, line);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(S, y);
      ctx.stroke();
    }
    // The pier.
    const [pierX, pierY] = toMap(0, 232);
    ctx.fillStyle = '#a9825a';
    ctx.fillRect(pierX - 2, pierY, 4, S - pierY);

    const dot = (x, z, r, color) => {
      const [mx, my] = toMap(x, z);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(mx, my, r, 0, Math.PI * 2);
      ctx.fill();
    };

    // Pickups, traffic, police, goons.
    for (const item of game.pickups.items) {
      if (!item.taken) dot(item.x, item.z, 2, '#37d67a');
    }
    for (const car of game.traffic.cars) {
      if (car.driver === 'traffic') dot(car.x, car.z, 2, '#f2c230');
    }
    const flash = Math.floor(game.time * 2.4) % 2 === 0;
    for (const car of game.police.copCars) {
      dot(car.x, car.z, 3, flash ? '#ff4444' : '#4488ff');
    }
    for (const ped of game.police.copPeds) dot(ped.x, ped.z, 2, '#4488ff');
    for (const goon of game.missions.goons) {
      if (goon.state !== 'dead') dot(goon.x, goon.z, 3, '#ff2222');
    }

    // Mission marker: a pulsing yellow diamond.
    const marker = game.missions.marker;
    if (marker) {
      const [mx, my] = toMap(marker.x, marker.z);
      const r = 5 + Math.sin(game.time * 4) * 1.5;
      ctx.fillStyle = '#ffd23f';
      ctx.beginPath();
      ctx.moveTo(mx, my - r);
      ctx.lineTo(mx + r, my);
      ctx.lineTo(mx, my + r);
      ctx.lineTo(mx - r, my);
      ctx.closePath();
      ctx.fill();
    }

    // The player: a white arrow pointing where they face.
    const player = game.player;
    const [px, py] = toMap(player.x, player.z);
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(Math.atan2(Math.sin(player.heading), -Math.cos(player.heading)));
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#111111';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(5, 5);
    ctx.lineTo(0, 2);
    ctx.lineTo(-5, 5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // North.
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 11px sans-serif';
    ctx.fillText('N', S - 14, 14);
  }
}
