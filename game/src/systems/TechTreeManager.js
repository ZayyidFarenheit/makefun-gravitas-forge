// GRAVITAS FORGE — systems/TechTreeManager.js
// One job: the real-time resource economy (Solar Plasma & Starlight Ore) and
// the 8-node tech tree that unlocks orbital upgrades and two superweapons:
// the auto-firing Singularity Lance and the player-triggered Nova Burst.

import { STAR_X, STAR_Y } from '../core/SimulationEngine.js';

export const TECHS = [
  { id: 'overcharge', name: 'Overcharged Rails', cost: { plasma: 60, ore: 20 }, desc: '+25% structure damage' },
  { id: 'rapid', name: 'Rapid Cycling', cost: { plasma: 60, ore: 20 }, desc: '+25% structure fire rate' },
  { id: 'siphon', name: 'Plasma Siphon', cost: { plasma: 50, ore: 30 }, desc: '+50% plasma income' },
  { id: 'reinforced', name: 'Reinforced Core', cost: { plasma: 40, ore: 40 }, desc: '+40 max Core, heal 40' },
  { id: 'lens', name: 'Gravity Lens', cost: { plasma: 80, ore: 40 }, desc: 'shots bend 2x, full flank dmg' },
  { id: 'burst', name: 'Flak Burst', cost: { plasma: 70, ore: 30 }, desc: 'flak fires 5 pellets' },
  { id: 'lance', name: 'Singularity Lance', cost: { plasma: 100, ore: 60 }, desc: 'auto piercing lance, 120 dmg' },
  { id: 'nova', name: 'Nova Burst', cost: { plasma: 100, ore: 60 }, desc: 'X: 60 dmg blast, 20s cooldown' },
];

export class TechTreeManager {
  constructor(world) {
    this.world = world;
    this.owned = new Set();
  }

  reset() {
    this.owned = new Set();
  }

  canBuy(id) {
    const w = this.world;
    const t = TECHS.find((x) => x.id === id);
    if (!t || this.owned.has(id)) return false;
    return w.plasma >= t.cost.plasma && w.ore >= t.cost.ore;
  }

  buy(id) {
    const w = this.world;
    const t = TECHS.find((x) => x.id === id);
    if (!t || !this.canBuy(id)) return false;
    w.plasma -= t.cost.plasma;
    w.ore -= t.cost.ore;
    this.owned.add(id);
    if (id === 'reinforced') {
      w.core = Math.min(w.core + 40, 140);
    }
    w.engine.burst(STAR_X, STAR_Y, 18, '#7df9ff', 150);
    return true;
  }

  // Plasma income per second: Dyson Collectors plus the base solar trickle.
  // Gravity leeches alive near the star cut the flow.
  plasmaRate() {
    const w = this.world;
    const dysons = w.structures.filter((s) => s.kind === 'dyson').length;
    let rate = 2 + dysons * 6;
    if (this.owned.has('siphon')) rate *= 1.5;
    const leeches = w.enemies.filter((e) => e.kind === 'leech').length;
    rate = Math.max(0, rate - leeches * 1.5);
    return rate;
  }

  // The Singularity Lance auto-fires a piercing shot across the field.
  update(dt) {
    const w = this.world;
    w.plasma = Math.min(999, w.plasma + this.plasmaRate() * dt);
    w.plasmaEarned += this.plasmaRate() * dt;
    if (!this.owned.has('lance')) return;
    w.lanceTimer -= dt;
    if (w.lanceTimer > 0) return;
    w.lanceTimer = 12;
    // Aim at the toughest enemy alive (boss first, then nearest cruiser).
    let target = w.boss || null;
    if (!target) {
      let bestD = Infinity;
      for (const e of w.enemies) {
        const d = Math.hypot(e.x - STAR_X, e.y - STAR_Y);
        if (e.kind === 'cruiser' && d < bestD) { target = e; bestD = d; }
      }
    }
    if (!target && w.enemies.length) target = w.enemies[0];
    if (!target) return;
    const a = Math.atan2(target.y - STAR_Y, target.x - STAR_X);
    w.projectiles.push({
      x: STAR_X, y: STAR_Y,
      vx: Math.cos(a) * 640, vy: Math.sin(a) * 640,
      dmg: 120, life: 2.5, pierce: 6, trail: [], from: 'lance',
      color: '#e0aaff',
    });
    w.lanceFired++;
    w.engine.addShake(3);
  }

  // Nova Burst: a shockwave that damages every enemy within 300 of the star.
  fireNova() {
    const w = this.world;
    if (!this.owned.has('nova')) return false;
    if (w.novaCooldown > 0) return false;
    w.novaCooldown = 20;
    w.novaUsed++;
    w.engine.burst(STAR_X, STAR_Y, 60, '#ff9e5e', 320);
    w.engine.addShake(9);
    for (let i = w.enemies.length - 1; i >= 0; i--) {
      const e = w.enemies[i];
      const d = Math.hypot(e.x - STAR_X, e.y - STAR_Y);
      if (d < 300) {
        w.engine.addDamageNumber(e.x, e.y - e.radius - 6, '-60', '#ff9e5e');
        e.hp -= 60;
        if (e.hp <= 0) {
          w.engine.burst(e.x, e.y, 20, e.color, 170);
          w.engine.registerKill(e);
          w.enemies.splice(i, 1);
          if (e.kind === 'dreadnought') { w.boss = null; w.bossDefeated = true; }
        }
      }
    }
    return true;
  }
}
