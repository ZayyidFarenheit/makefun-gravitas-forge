// GRAVITAS FORGE — systems/OrbitalPhysicsEngine.js
// One job: real-time gravitational attraction (the star + orbiting moons bend
// every projectile), orbital velocity stabilization, and the multi-step
// predictive trajectory curve the player aims with (dotted arcs).

import { STAR_X, STAR_Y, STAR_R } from '../core/SimulationEngine.js';

// Gravity constants, tuned so a slug bends visibly around a moon but still
// flies straight enough to feel fair.
export const G_STAR = 26000;
export const G_MOON = 9000;

export class OrbitalPhysicsEngine {
  constructor(world) {
    this.world = world;
  }

  // Net gravitational acceleration at a point, from the star and every moon.
  gravityAt(x, y) {
    let ax = 0;
    let ay = 0;
    const dxs = STAR_X - x;
    const dys = STAR_Y - y;
    const ds2 = dxs * dxs + dys * dys + 900;
    const ds = Math.sqrt(ds2);
    const gs = G_STAR / ds2;
    ax += (dxs / ds) * gs;
    ay += (dys / ds) * gs;
    for (const b of this.world.buoys) {
      const dx = b.x - x;
      const dy = b.y - y;
      const d2 = dx * dx + dy * dy + 400;
      const d = Math.sqrt(d2);
      const g = G_MOON * (b.mass / 2600) / d2;
      ax += (dx / d) * g;
      ay += (dy / d) * g;
    }
    return { ax, ay };
  }

  // Circular orbit speed at radius r around the star (for structure placement).
  circularOrbitVelocity(r) {
    return Math.sqrt(G_STAR / Math.max(60, r));
  }

  // One fixed step: move projectiles under gravity, resolve hits, move enemies
  // (they home on the star with a slight gravity bend), resolve star impacts.
  step(dt) {
    const w = this.world;
    this.stepProjectiles(dt, w);
    this.stepEnemies(dt, w);
    this.stepComets(dt, w);
  }

  stepProjectiles(dt, w) {
    for (let i = w.projectiles.length - 1; i >= 0; i--) {
      const p = w.projectiles[i];
      p.life -= dt;
      if (p.life <= 0) { w.projectiles.splice(i, 1); continue; }
      // Gravity bends the slug; stronger when the Gravity Lens tech is owned.
      const bend = w.tech.owned.has('lens') ? 1.9 : 1;
      const g = this.gravityAt(p.x, p.y);
      p.vx += g.ax * bend * dt;
      p.vy += g.ay * bend * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.trail.push({ x: p.x, y: p.y });
      if (p.trail.length > 14) p.trail.shift();
      // Fell into the star: a wasted shot, a small flare.
      const dxs = p.x - STAR_X;
      const dys = p.y - STAR_Y;
      if (dxs * dxs + dys * dys < (STAR_R - 6) * (STAR_R - 6)) {
        w.projectiles.splice(i, 1);
        continue;
      }
      if (p.x < -60 || p.x > 1340 || p.y < -60 || p.y > 780) {
        w.projectiles.splice(i, 1);
        continue;
      }
      this.resolveProjectileHits(p, i, w);
    }
  }

  resolveProjectileHits(p, i, w) {
    // Enemy hits: shield-cruisers take 75% less from the front (shots fired
    // straight out of the star) and full damage from the flank or rear, which
    // is what the gravity bend is for.
    for (let j = w.enemies.length - 1; j >= 0; j--) {
      const e = w.enemies[j];
      const dx = p.x - e.x;
      const dy = p.y - e.y;
      const rr = e.radius + 4;
      if (dx * dx + dy * dy > rr * rr) continue;
      let dmg = p.dmg;
      // The Singularity Lance pierces shields entirely.
      if (p.from !== 'lance' && (e.kind === 'cruiser' || e.kind === 'dreadnought')) {
        // Facing: the cruiser's nose points at the star. A projectile whose
        // velocity points away from the star hits the armored flank/rear.
        const toStarX = STAR_X - e.x;
        const toStarY = STAR_Y - e.y;
        const toStarLen = Math.hypot(toStarX, toStarY) || 1;
        const velLen = Math.hypot(p.vx, p.vy) || 1;
        const facing = (p.vx * toStarX + p.vy * toStarY) / (velLen * toStarLen);
        // Cruisers: 75% less from the front. The dreadnought's maw is thicker
        // in front but its hide is thinner overall: 50% less from the front.
        const frontMul = e.kind === 'dreadnought' ? 0.5 : 0.25;
        if (facing > 0.25) dmg = Math.max(1, Math.round(dmg * frontMul));
      }
      w.hits++;
      this.damageEnemy(e, dmg, w, j);
      if (p.pierce) {
        p.pierce--;
        if (p.pierce <= 0) { w.projectiles.splice(i, 1); return; }
      } else {
        w.projectiles.splice(i, 1);
        return;
      }
    }
    // Comet harvest: shooting a comet cracks it open for Solar Plasma.
    for (let j = w.comets.length - 1; j >= 0; j--) {
      const c = w.comets[j];
      const dx = p.x - c.x;
      const dy = p.y - c.y;
      if (dx * dx + dy * dy > (c.radius + 4) * (c.radius + 4)) continue;
      w.hits++;
      c.hp -= p.dmg;
      w.projectiles.splice(i, 1);
      if (c.hp <= 0) {
        w.plasma += 15;
        w.plasmaEarned += 15;
        w.score += 5;
        w.engine.burst(c.x, c.y, 14, '#7df9ff', 130);
        w.engine.addDamageNumber(c.x, c.y - 10, '+15 PLASMA', '#7df9ff');
        w.comets.splice(j, 1);
      }
      return;
    }
  }

  damageEnemy(e, dmg, w, index) {
    e.hp -= dmg;
    w.engine.addDamageNumber(e.x, e.y - e.radius - 6, '-' + dmg, '#ffd166');
    w.engine.burst(e.x, e.y, 4, '#ffb347', 90);
    if (e.hp <= 0) {
      w.engine.burst(e.x, e.y, e.kind === 'dreadnought' ? 80 : 22, e.color, 190);
      w.engine.addShake(e.kind === 'dreadnought' ? 12 : 3);
      w.engine.registerKill(e);
      w.enemies.splice(index, 1);
      if (e.kind === 'dreadnought') {
        w.boss = null;
        w.bossDefeated = true;
      }
    }
  }

  stepEnemies(dt, w) {
    for (const e of w.enemies) {
      // Home on the star with a slight gravity bend (hyperbolic flavor).
      const dx = STAR_X - e.x;
      const dy = STAR_Y - e.y;
      const d = Math.hypot(dx, dy) || 1;
      const g = this.gravityAt(e.x, e.y);
      e.vx += ((dx / d) * e.thrust + g.ax * 0.35) * dt;
      e.vy += ((dy / d) * e.thrust + g.ay * 0.35) * dt;
      const sp = Math.hypot(e.vx, e.vy) || 1;
      const maxSp = e.speed * (e.slowed ? 0.55 : 1);
      if (sp > maxSp) {
        e.vx = (e.vx / sp) * maxSp;
        e.vy = (e.vy / sp) * maxSp;
      }
      e.x += e.vx * dt;
      e.y += e.vy * dt;
      e.angle += (e.spin || 0) * dt;
      // Gravity leeches drain the Forge's energy flow while they live.
      if (e.kind === 'leech') e.drainTimer = (e.drainTimer || 0) + dt;
      // Impact on the Forge-Star.
      if (d < STAR_R + e.radius * 0.6) {
        w.core -= e.dmg;
        w.chain = 0;
        w.engine.burst(e.x, e.y, 18, '#ff5d73', 170);
        w.engine.addShake(6);
        w.engine.addDamageNumber(STAR_X, STAR_Y - STAR_R - 14, '-' + e.dmg + ' CORE', '#ff5d73');
        if (e.kind === 'dreadnought') {
          // The maw does not die on impact: it tears a chunk out of the
          // Forge and swings back out for another pass until it is killed.
          const bx = (e.x - STAR_X) / d;
          const by = (e.y - STAR_Y) / d;
          e.x = STAR_X + bx * (STAR_R + e.radius + 12);
          e.y = STAR_Y + by * (STAR_R + e.radius + 12);
          e.vx = bx * e.speed * 1.6;
          e.vy = by * e.speed * 1.6;
          return;
        }
        const idx = w.enemies.indexOf(e);
        if (idx >= 0) w.enemies.splice(idx, 1);
      }
    }
  }

  stepComets(dt, w) {
    for (let i = w.comets.length - 1; i >= 0; i--) {
      const c = w.comets[i];
      c.x += c.vx * dt;
      c.y += c.vy * dt;
      c.life -= dt;
      if (c.life <= 0 || c.x < -40 || c.x > 1320 || c.y < -40 || c.y > 760) {
        w.comets.splice(i, 1);
      }
    }
  }

  // Simulate a slug's flight under gravity and return the dotted arc points
  // the HUD draws so the player can see the bend before firing.
  predictTrajectory(x, y, vx, vy, steps, stepDt) {
    const pts = [];
    let px = x;
    let py = y;
    let pvx = vx;
    let pvy = vy;
    const bend = this.world.tech.owned.has('lens') ? 1.9 : 1;
    for (let s = 0; s < steps; s++) {
      const g = this.gravityAt(px, py);
      pvx += g.ax * bend * stepDt;
      pvy += g.ay * bend * stepDt;
      px += pvx * stepDt;
      py += pvy * stepDt;
      if (s % 2 === 0) pts.push({ x: px, y: py });
      const dxs = px - STAR_X;
      const dys = py - STAR_Y;
      if (dxs * dxs + dys * dys < (STAR_R - 4) * (STAR_R - 4)) break;
      if (px < -40 || px > 1320 || py < -40 || py > 760) break;
    }
    return pts;
  }

  // Neon-cyan gravitational contour rings around the star and each moon,
  // drawn faint so the field the player bends shots around stays readable.
  drawContourRings(ctx) {
    ctx.save();
    ctx.strokeStyle = 'rgba(125, 249, 255, 0.10)';
    ctx.lineWidth = 1;
    for (const r of [120, 180, 240, 300, 360]) {
      ctx.beginPath();
      ctx.arc(STAR_X, STAR_Y, r, 0, Math.PI * 2);
      ctx.stroke();
    }
    for (const b of this.world.buoys) {
      ctx.strokeStyle = 'rgba(125, 249, 255, 0.22)';
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r + 14, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r + 26, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(125, 249, 255, 0.08)';
      ctx.stroke();
    }
    ctx.restore();
  }
}
