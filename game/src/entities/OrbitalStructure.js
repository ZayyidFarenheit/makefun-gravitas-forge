// GRAVITAS FORGE — entities/OrbitalStructure.js
// One job: player-built satellites (Railgun Turret, Gravity Repulsor, Dyson
// Collector, Plasma Flak) with orbital decay/boost controls. Each structure
// rides an orbit ring around the Forge-Star, fires or harvests on its own,
// and slowly decays inward unless the player boosts it back out.

import { STAR_X, STAR_Y, SLUG_LEAD_SPEED } from '../core/SimulationEngine.js';

export const STRUCTURE_DEFS = {
  // Turret 18, flak 9 (were 9 and 5): with the geometric flank hook, a
  // turret slug fired from the star side at a cruiser's front deals only
  // a quarter damage (5 / 2), so the base damage has to carry the front
  // hits; flank hits deal the full amount. Pass 3 rebalance, step 5.
  turret: { name: 'Railgun Turret', key: '1', cost: { plasma: 40, ore: 0 }, orbitR: 150, dmg: 18, rate: 1.4, range: 330, color: '#ffd166', desc: 'shoots nearest foe' },
  flak: { name: 'Plasma Flak', key: '2', cost: { plasma: 60, ore: 10 }, orbitR: 210, dmg: 9, rate: 1.0, range: 260, color: '#ff7b00', desc: '3-pellet burst, AoE' },
  repulsor: { name: 'Gravity Repulsor', key: '3', cost: { plasma: 50, ore: 20 }, orbitR: 180, dmg: 0, rate: 0, range: 170, color: '#7df9ff', desc: 'pushes foes away' },
  dyson: { name: 'Dyson Collector', key: '4', cost: { plasma: 30, ore: 0 }, orbitR: 260, dmg: 0, rate: 0, range: 0, color: '#f72585', desc: '+4 MW/s plasma' },
};

export const MAX_STRUCTURES = 8;

export class OrbitalStructure {
  constructor(kind, world) {
    const def = STRUCTURE_DEFS[kind];
    this.kind = kind;
    this.name = def.name;
    this.world = world;
    this.orbitR = def.orbitR;
    this.nominalR = def.orbitR;
    // Spread structures evenly around the ring they are built on.
    const siblings = world.structures.filter((s) => s.orbitR === def.orbitR).length;
    this.angle = (siblings * Math.PI * 2) / 3 + Math.random() * 0.4;
    this.orbitSpeed = 0.35 + Math.random() * 0.1;
    this.x = STAR_X + Math.cos(this.angle) * this.orbitR;
    this.y = STAR_Y + Math.sin(this.angle) * this.orbitR;
    this.cooldown = 0;
    this.slowed = false;
    this.decayRate = 0.55; // orbit radius lost per second unless boosted
    this.color = def.color;
  }

  // Push the structure back to its nominal orbit (costs plasma, see main.js).
  boost() {
    this.orbitR = this.nominalR;
  }

  update(dt) {
    const w = this.world;
    // Orbit decay: the ring pulls inward; below 110 the structure burns up.
    // Ith's Grasp relic: decay runs at 60% speed.
    this.orbitR -= this.decayRate * w.relics.decayMul() * dt;
    if (this.orbitR < 110) {
      w.engine.burst(this.x, this.y, 16, '#ff5d73', 140);
      const idx = w.structures.indexOf(this);
      if (idx >= 0) w.structures.splice(idx, 1);
      return;
    }
    this.angle += this.orbitSpeed * dt;
    this.x = STAR_X + Math.cos(this.angle) * this.orbitR;
    this.y = STAR_Y + Math.sin(this.angle) * this.orbitR;
    if (this.cooldown > 0) this.cooldown -= dt;
    const def = STRUCTURE_DEFS[this.kind];
    // Rapid Orbit relic: structures fire 10% faster.
    const rateMul = (w.tech.owned.has('rapid') ? 1.25 : 1) * w.relics.fireRateMul();
    // Vey's Edge relic: structures deal +15% damage.
    const dmgMul = (w.tech.owned.has('overcharge') ? 1.25 : 1) * w.relics.damageMul();
    if (this.kind === 'repulsor') {
      // Push enemies away from the star inside the repulsor field.
      // The dreadnought is too massive to move.
      for (const e of w.enemies) {
        if (e.kind === 'dreadnought') continue;
        const dx = e.x - STAR_X;
        const dy = e.y - STAR_Y;
        const d = Math.hypot(dx, dy) || 1;
        if (d < def.range + 40) {
          e.vx += (dx / d) * 130 * dt;
          e.vy += (dy / d) * 130 * dt;
        }
      }
      return;
    }
    if (this.kind === 'dyson') return; // income is handled by the tech manager
    if (this.cooldown > 0 || this.slowed) return;
    // Fire at the nearest enemy in range.
    let best = null;
    let bestD = Infinity;
    for (const e of w.enemies) {
      const d = Math.hypot(e.x - this.x, e.y - this.y);
      if (d < def.range && d < bestD) { best = e; bestD = d; }
    }
    if (!best) return;
    this.cooldown = 1 / (def.rate * rateMul);
    // Flak Burst relic: +1 pellet on every flak volley.
    const pellets = this.kind === 'flak' ? 3 + (w.tech.owned.has('burst') ? 2 : 0) + w.relics.flakBonus() : 1;
    for (let i = 0; i < pellets; i++) {
      // Lead by the slug's average flight speed (SLUG_LEAD_SPEED): star
      // gravity slows every slug down along the way.
      const lead = bestD / SLUG_LEAD_SPEED;
      const tx = best.x + best.vx * lead;
      const ty = best.y + best.vy * lead;
      const a = Math.atan2(ty - this.y, tx - this.x) + (pellets > 1 ? (i - (pellets - 1) / 2) * 0.14 : 0);
      w.projectiles.push({
        x: this.x, y: this.y,
        vx: Math.cos(a) * 520, vy: Math.sin(a) * 520,
        dmg: Math.round(def.dmg * dmgMul),
        life: 2.2, pierce: 0, trail: [], from: this.kind,
        color: this.kind === 'flak' ? '#ff9e5e' : '#ffe08a',
      });
    }
  }
}

// All player-built structures, updated once per fixed step.
export class StructureManager {
  constructor(world) {
    this.world = world;
  }

  update(dt) {
    for (let i = this.world.structures.length - 1; i >= 0; i--) {
      this.world.structures[i].update(dt);
    }
  }

  // Build a structure if the player can afford it and a slot is free.
  // Orbital Foundry (workshop): each owned level adds one slot above the
  // base 8. The 'rapid' relic is earned on the first structure built.
  build(kind) {
    const w = this.world;
    const def = STRUCTURE_DEFS[kind];
    if (!def) return false;
    const maxSlots = MAX_STRUCTURES + w.workshop.slotsBonus();
    if (w.structures.length >= maxSlots) return false;
    if (w.plasma < def.cost.plasma || w.ore < def.cost.ore) return false;
    w.plasma -= def.cost.plasma;
    w.ore -= def.cost.ore;
    w.structures.push(new OrbitalStructure(kind, w));
    w.structuresBuilt++;
    w.relics.grant('rapid');
    w.engine.burst(STAR_X, STAR_Y, 10, def.color, 100);
    return true;
  }

  // Structures whose orbit has decayed far enough that a boost helps:
  // more than 12px below their nominal ring (about 22 seconds of decay).
  needyStructures() {
    return this.world.structures.filter((s) => s.orbitR < s.nominalR - 12);
  }

  // Boost every decaying structure back to its nominal orbit.
  boostAll() {
    const w = this.world;
    const needy = this.needyStructures();
    if (!needy.length) return false;
    if (w.plasma < 10) return false;
    w.plasma -= 10;
    for (const s of needy) s.boost();
    return true;
  }
}
