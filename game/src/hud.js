// HUD for Solmar: wanted stars, money, health, speed, the minimap, the
// message feed, and the start / pause / wasted overlays. All DOM lives in
// index.html; this module only updates it.
import { ROADS, LOCATIONS } from './city.js';

const $ = (id) => document.getElementById(id);

export class HUD {
  constructor() {
    this.starsEl = $('stars');
    this.moneyEl = $('money');
    this.healthEl = $('health-fill');
    this.speedEl = $('speed');
    this.speedBox = $('speed-box');
    this.objectiveEl = $('objective');
    this.hintEl = $('hint');
    this.feedEl = $('feed');
    this.crosshairEl = $('crosshair');
    this.startEl = $('start-screen');
    this.pauseEl = $('pause-screen');
    this.endEl = $('end-screen');
    this.endTitle = $('end-title');
    this.endText = $('end-text');
    this.bannerEl = $('banner');
    this.vignetteEl = $('damage-vignette');
    this.minimap = $('minimap');
    this.mm = this.minimap.getContext('2d');
    this._bannerTimer = null;
  }

  setWanted(n) {
    this.starsEl.textContent = '★'.repeat(n) + '☆'.repeat(5 - n);
    this.starsEl.classList.toggle('hot', n > 0);
  }

  setMoney(n) {
    this.moneyEl.textContent = '$' + n.toLocaleString('en-US');
  }

  setHealth(hp) {
    this.healthEl.style.width = Math.max(0, hp) + '%';
    this.healthEl.classList.toggle('low', hp < 30);
  }

  setSpeed(kmh, driving) {
    this.speedBox.style.display = driving ? 'block' : 'none';
    this.speedEl.textContent = Math.round(kmh);
  }

  setObjective(text) {
    this.objectiveEl.textContent = text || '';
    this.objectiveEl.style.display = text ? 'block' : 'none';
  }

  setHint(text) {
    this.hintEl.textContent = text || '';
    this.hintEl.style.display = text ? 'block' : 'none';
  }

  setCrosshair(on) {
    this.crosshairEl.style.display = on ? 'block' : 'none';
  }

  /** A line in the message feed; kind colours it (mission/success/fail/info). */
  message(text, kind = 'info') {
    const div = document.createElement('div');
    div.className = 'feed-line ' + kind;
    div.textContent = text;
    this.feedEl.appendChild(div);
    while (this.feedEl.children.length > 4) this.feedEl.removeChild(this.feedEl.firstChild);
    setTimeout(() => {
      div.classList.add('fade');
      setTimeout(() => div.remove(), 800);
    }, 5000);
  }

  /** Big centre banner, e.g. "MISSION PASSED". */
  banner(text, ms = 2600) {
    this.bannerEl.textContent = text;
    this.bannerEl.classList.add('show');
    clearTimeout(this._bannerTimer);
    this._bannerTimer = setTimeout(() => this.bannerEl.classList.remove('show'), ms);
  }

  flashDamage() {
    this.vignetteEl.classList.remove('flash');
    // Force a reflow so the animation restarts.
    void this.vignetteEl.offsetWidth;
    this.vignetteEl.classList.add('flash');
  }

  showStart() { this.startEl.style.display = 'flex'; }
  hideStart() { this.startEl.style.display = 'none'; }
  showPause() { this.pauseEl.style.display = 'flex'; }
  hidePause() { this.pauseEl.style.display = 'none'; }
  showEnd(title, text) {
    this.endTitle.textContent = title;
    this.endText.textContent = text;
    this.endEl.style.display = 'flex';
  }
  hideEnd() { this.endEl.style.display = 'none'; }

  /** Draw the minimap: roads, blocks, water, player, cops, objective. */
  drawMinimap(world) {
    const ctx = this.mm;
    const S = this.minimap.width; // 180
    const W = 720; // world units shown (-360..360)
    const px = (x) => ((x + 360) / W) * S;
    const pz = (z) => ((z + 360) / W) * S;
    ctx.clearRect(0, 0, S, S);
    // Ground + water + beach.
    ctx.fillStyle = '#1d2b1d';
    ctx.fillRect(0, 0, S, S);
    ctx.fillStyle = '#1a5a8a';
    ctx.fillRect(px(348), 0, S - px(348), S);
    ctx.fillStyle = '#c9b18a';
    ctx.fillRect(px(300), 0, px(348) - px(300), S);
    // Roads.
    ctx.strokeStyle = '#3a3f45';
    ctx.lineWidth = 4;
    for (const r of ROADS) {
      ctx.beginPath();
      if (r.axis === 'x') {
        ctx.moveTo(px(-260), pz(r.at));
        ctx.lineTo(px(300), pz(r.at));
      } else {
        ctx.moveTo(px(r.at), pz(-260));
        ctx.lineTo(px(r.at), pz(260));
      }
      ctx.stroke();
    }
    // Buildings.
    ctx.fillStyle = '#5a625f';
    for (const b of world.city.colliders) {
      if (b.minX < -320 || b.minX > 340) continue;
      ctx.fillRect(px(b.minX), pz(b.minZ), Math.max(1, px(b.maxX) - px(b.minX)), Math.max(1, pz(b.maxZ) - pz(b.minZ)));
    }
    // Mission start marker (green D).
    if (world.missions.nextMission && !world.missions.current) {
      ctx.fillStyle = '#2ecc71';
      ctx.beginPath();
      ctx.arc(px(LOCATIONS.hideout.x), pz(LOCATIONS.hideout.z), 4, 0, Math.PI * 2);
      ctx.fill();
    }
    // Current objective: a pulsing yellow diamond.
    const obj = world.missions.objective;
    if (obj) {
      ctx.fillStyle = '#ffd54a';
      const ox = px(obj.x);
      const oz = pz(obj.z);
      const r = 5 + Math.sin(performance.now() / 250) * 1.5;
      ctx.beginPath();
      ctx.moveTo(ox, oz - r - 1);
      ctx.lineTo(ox + r, oz);
      ctx.lineTo(ox, oz + r + 1);
      ctx.lineTo(ox - r, oz);
      ctx.closePath();
      ctx.fill();
    }
    // Cops (blue) and pursuit cars (blue squares).
    ctx.fillStyle = '#4aa3ff';
    for (const c of world.police.cops) {
      if (c.state === 'dead') continue;
      ctx.beginPath();
      ctx.arc(px(c.x), pz(c.z), 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const car of world.police.cars) {
      ctx.fillRect(px(car.x) - 2, pz(car.z) - 2, 4, 4);
    }
    // Player arrow.
    const p = world.player;
    const heading = p.mode === 'car' && p.car ? p.car.heading : p.heading;
    ctx.save();
    ctx.translate(px(p.pos.x), pz(p.pos.z));
    ctx.rotate(heading);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(4.5, 5);
    ctx.lineTo(-4.5, 5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}
