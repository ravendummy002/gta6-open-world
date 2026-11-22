// Pickups scattered around Solmar: street cash ($50 a bundle) and
// first-aid kits near the hospital, the plaza and the pier. They spin
// and bob so they read from a distance, and stay collected in the save.

export class Pickups {
  constructor(city, rng) {
    this.items = [];
    for (let k = 0; k < 10; k++) {
      const pt = city.randomSidewalkPoint(rng);
      this.items.push({ id: 'cash' + k, kind: 'cash', x: pt.x, z: pt.z, value: 50, taken: false });
    }
    const healthSpots = [
      { x: 60, z: -8 },
      { x: -23, z: -40 },
      { x: 115, z: 100 },
      { x: 0, z: 214 },
    ];
    healthSpots.forEach((s, k) => {
      this.items.push({ id: 'health' + k, kind: 'health', x: s.x, z: s.z, value: 40, taken: false });
    });
  }

  applySave(collectedIds) {
    if (!Array.isArray(collectedIds)) return;
    for (const item of this.items) {
      if (collectedIds.includes(item.id)) item.taken = true;
    }
  }

  collectedIds() {
    return this.items.filter((i) => i.taken).map((i) => i.id);
  }

  update(dt, game) {
    const p = game.player;
    for (const item of this.items) {
      // A pickup collected this session grows back after 90 seconds,
      // so the city keeps rewarding a long roam. Pickups that came
      // back with the save stay collected.
      if (item.taken) {
        if (item.sessionTaken && game.time - item.takenAt > 90) {
          item.taken = false;
          item.sessionTaken = false;
        }
        continue;
      }
      const dx = item.x - p.x;
      const dz = item.z - p.z;
      if (dx * dx + dz * dz < 1.8 * 1.8) {
        item.taken = true;
        item.sessionTaken = true;
        item.takenAt = game.time;
        if (item.kind === 'cash') {
          game.addCash(item.value);
          game.hud.toast(`+$${item.value} street cash`);
          game.combat.burst(item.x, 1, item.z, [0.3, 1, 0.4], 10, 3);
        } else {
          p.health = Math.min(100, p.health + item.value);
          game.hud.toast(`Health +${item.value}`);
          game.combat.burst(item.x, 1, item.z, [1, 0.4, 0.4], 10, 3);
        }
        game.audio.pickup();
      }
    }
  }

  draw(geom, time) {
    for (const item of this.items) {
      if (item.taken) continue;
      const bob = 0.9 + Math.sin(time * 2 + item.x) * 0.15;
      const spin = time * 1.5 + item.z;
      if (item.kind === 'cash') {
        geom.box(item.x, bob, item.z, 0.7, 0.5, 0.3, [0.2, 0.85, 0.35], spin);
        geom.box(item.x, bob, item.z, 0.74, 0.18, 0.34, [1, 0.85, 0.3], spin);
      } else {
        geom.box(item.x, bob, item.z, 0.7, 0.7, 0.7, [0.95, 0.95, 0.95], spin);
        geom.box(item.x, bob, item.z, 0.5, 0.2, 0.74, [0.9, 0.15, 0.15], spin);
        geom.box(item.x, bob, item.z, 0.2, 0.5, 0.74, [0.9, 0.15, 0.15], spin);
      }
      const glow = item.kind === 'cash' ? [0.2, 0.85, 0.35, 0.35] : [1, 0.4, 0.4, 0.35];
      geom.flatQuad(item.x, item.z, 0.05, 1.5, 1.5, glow, 0);
    }
  }
}
