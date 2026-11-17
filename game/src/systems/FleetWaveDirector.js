// GRAVITAS FORGE — systems/FleetWaveDirector.js
// One job: spawn asymmetric asteroid swarms, shield-cruisers and gravity-leech
// capital ships along hyperbolic entry vectors, plus the boss dreadnought
// THE VOID MAW on the final wave. Also runs the title-screen demo trickle.

import { STAR_X, STAR_Y } from '../core/SimulationEngine.js';

// Enemy kinds. behavior: 'star' dives at the Forge-Star, 'leech' drains energy,
// 'boss' is the dreadnought. shielded kinds take 75% less from the front.
export const ENEMIES = {
  asteroid: { name: 'Asteroid', hp: 32, speed: 85, radius: 13, dmg: 10, score: 10, ore: 2, color: '#b08968', behavior: 'star', desc: 'dives at the Forge' },
  cruiser: { name: 'Shield-Cruiser', hp: 95, speed: 48, radius: 18, dmg: 12, score: 25, ore: 5, color: '#4cc9f0', behavior: 'star', desc: 'armored front — flank it' },
  leech: { name: 'Gravity Leech', hp: 55, speed: 60, radius: 12, dmg: 8, score: 20, ore: 4, color: '#f72585', behavior: 'leech', desc: 'drains energy flow' },
  comet: { name: 'Comet', hp: 12, speed: 85, radius: 11, dmg: 0, score: 5, ore: 0, color: '#7df9ff', behavior: 'harvest', desc: 'shoot to harvest plasma' },
  dreadnought: { name: 'THE VOID MAW', hp: 1700, speed: 40, radius: 64, dmg: 30, score: 500, ore: 60, color: '#2b0a3d', behavior: 'boss', desc: 'eats stars, spawns leeches' },
};

// [kind, count, gapSeconds] per wave. Wave 7 is the boss plus a trickle.
export const WAVES = {
  1: [['asteroid', 16, 0.8]],
  2: [['asteroid', 10, 0.9], ['cruiser', 6, 1.5], ['comet', 4, 2.2]],
  3: [['asteroid', 14, 0.8], ['cruiser', 7, 1.3], ['leech', 4, 1.9], ['comet', 5, 2.0]],
  4: [['asteroid', 16, 0.55], ['cruiser', 8, 1.0], ['leech', 5, 1.4], ['comet', 6, 1.5]],
  5: [['asteroid', 18, 0.55], ['cruiser', 12, 0.9], ['leech', 7, 1.2], ['comet', 6, 1.3]],
  6: [['asteroid', 20, 0.5], ['cruiser', 12, 0.8], ['leech', 8, 1.1], ['comet', 8, 1.2]],
  7: [['cruiser', 5, 1.9], ['leech', 4, 2.2], ['asteroid', 6, 1.1]],
};

export const TOTAL_WAVES = 7;

export class FleetWaveDirector {
  constructor(world) {
    this.world = world;
    this.waveActive = false;
    this.spawnQueue = [];
    this.spawnTimer = 0;
    this.demoTimer = 0;
  }

  startWave(n) {
    const w = this.world;
    w.wave = n;
    this.waveActive = true;
    this.spawnQueue = [];
    for (const [kind, count, gap] of WAVES[n] || []) {
      for (let i = 0; i < count; i++) this.spawnQueue.push({ kind, gap });
    }
    this.spawnTimer = 0.5;
    if (n === 7) this.spawnBoss();
  }

  spawnBoss() {
    const w = this.world;
    const def = ENEMIES.dreadnought;
    const boss = this.makeEnemy('dreadnought', def, -80, STAR_Y - 180);
    boss.vx = 24;
    boss.vy = 10;
    w.enemies.push(boss);
    w.boss = boss;
    w.engine.addShake(10);
  }

  // A spawn point on a random edge, with a velocity toward the star plus a
  // tangential component — a hyperbolic entry vector, not a straight line.
  entryPoint() {
    const side = Math.floor(Math.random() * 4);
    let x;
    let y;
    if (side === 0) { x = -40; y = Math.random() * 720; }
    else if (side === 1) { x = 1320; y = Math.random() * 720; }
    else if (side === 2) { x = Math.random() * 1280; y = -40; }
    else { x = Math.random() * 1280; y = 760; }
    return { x, y };
  }

  makeEnemy(kind, def, x, y) {
    const dx = STAR_X - x;
    const dy = STAR_Y - y;
    const d = Math.hypot(dx, dy) || 1;
    // Tangential offset bends the approach into a hyperbola.
    const tx = -dy / d;
    const ty = dx / d;
    const tang = (Math.random() - 0.5) * 0.7;
    const vx = (dx / d) * def.speed + tx * def.speed * tang;
    const vy = (dy / d) * def.speed + ty * def.speed * tang;
    return {
      kind, name: def.name, hp: def.hp, maxHp: def.hp,
      speed: def.speed, radius: def.radius, dmg: def.dmg,
      score: def.score, ore: def.ore, color: def.color,
      behavior: def.behavior, desc: def.desc,
      x, y, vx, vy, angle: Math.random() * Math.PI * 2,
      spin: (Math.random() - 0.5) * 1.2,
      thrust: def.speed * 0.55,
      slowed: false, drainTimer: 0,
    };
  }

  spawn(kind) {
    const w = this.world;
    if (kind === 'comet') {
      const p = this.entryPoint();
      const dx = STAR_X - p.x;
      const dy = STAR_Y - p.y;
      const d = Math.hypot(dx, dy) || 1;
      const def = ENEMIES.comet;
      w.comets.push({
        kind: 'comet', x: p.x, y: p.y,
        vx: (dx / d) * def.speed, vy: (dy / d) * def.speed,
        radius: def.radius, hp: def.hp, life: 26, color: def.color,
      });
      return;
    }
    const def = ENEMIES[kind];
    const p = this.entryPoint();
    w.enemies.push(this.makeEnemy(kind, def, p.x, p.y));
  }

  update(dt) {
    const w = this.world;
    if (!this.waveActive) return;
    if (this.spawnQueue.length) {
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0) {
        const next = this.spawnQueue.shift();
        this.spawn(next.kind);
        this.spawnTimer = next.gap;
      }
    }
    // The dreadnought spawns leeches while it lives.
    if (w.boss && w.boss.hp > 0 && Math.random() < dt * 0.12) {
      const def = ENEMIES.leech;
      const a = Math.random() * Math.PI * 2;
      w.enemies.push(this.makeEnemy('leech', def, w.boss.x + Math.cos(a) * 80, w.boss.y + Math.sin(a) * 80));
    }
    // Leeches near the star slow the structures they cling to.
    for (const s of w.structures) s.slowed = false;
    for (const e of w.enemies) {
      if (e.kind !== 'leech') continue;
      const d = Math.hypot(e.x - STAR_X, e.y - STAR_Y);
      if (d < 320) {
        for (const s of w.structures) {
          if (Math.hypot(s.x - e.x, s.y - e.y) < 120) s.slowed = true;
        }
      }
    }
  }

  // Title-screen demo: a gentle trickle the AI defense chews through forever.
  demoUpdate(dt) {
    const w = this.world;
    this.demoTimer -= dt;
    if (this.demoTimer <= 0) {
      this.demoTimer = 0.9;
      const kinds = ['asteroid', 'asteroid', 'cruiser', 'comet'];
      const kind = kinds[Math.floor(Math.random() * kinds.length)];
      if (w.enemies.length < 12) this.spawn(kind);
      else if (w.comets.length < 3) this.spawn('comet');
    }
    if (w.enemies.length > 16) w.enemies.splice(0, w.enemies.length - 16);
  }
}
