// GRAVITAS FORGE — ui/TelemetryHUDRenderer.js
// One job: the clean sci-fi vector HUD — Core Integrity, Energy Flow (+MW/s),
// Wave Threat Radar, the Orbital Schematic overlay, the live AI orbital battle
// behind the Title Screen, and the Post-Run Analytics on the end screens.

import { STAR_X, STAR_Y, STAR_R, MAX_CORE } from '../core/SimulationEngine.js';
import { ENEMIES, TOTAL_WAVES } from '../systems/FleetWaveDirector.js';
import { STRUCTURE_DEFS } from '../entities/OrbitalStructure.js';
import { TECHS } from '../systems/TechTreeManager.js';

const GOLD = '#ffb347';
const CYAN = '#7df9ff';
const RED = '#ff5d73';
const GREEN = '#3ddc84';

export class TelemetryHUDRenderer {
  constructor(world) {
    this.world = world;
  }

  // ---- world drawing (star, moons, structures, enemies, shots) ----

  drawWorld(ctx) {
    const w = this.world;
    this.drawStarfield(ctx, w);
    w.physics.drawContourRings(ctx);
    this.drawStar(ctx, w);
    this.drawBuoys(ctx, w);
    this.drawComets(ctx, w);
    this.drawStructures(ctx, w);
    this.drawEnemies(ctx, w);
    this.drawProjectiles(ctx, w);
    this.drawParticles(ctx, w);
    this.drawDamageNumbers(ctx, w);
  }

  drawStarfield(ctx, w) {
    ctx.fillStyle = '#05030d';
    ctx.fillRect(0, 0, 1280, 720);
    // Deterministic starfield from the world's seed stars.
    ctx.save();
    for (const s of w.stars) {
      ctx.globalAlpha = s.a;
      ctx.fillStyle = s.c;
      ctx.fillRect(s.x, s.y, s.s, s.s);
    }
    ctx.restore();
  }

  drawStar(ctx, w) {
    const t = w.time;
    const pulse = 1 + Math.sin(t * 2.2) * 0.03;
    const r = STAR_R * pulse;
    // Molten-gold glow.
    const glow = ctx.createRadialGradient(STAR_X, STAR_Y, r * 0.4, STAR_X, STAR_Y, r * 2.6);
    glow.addColorStop(0, 'rgba(255, 179, 71, 0.55)');
    glow.addColorStop(0.5, 'rgba(255, 123, 0, 0.18)');
    glow.addColorStop(1, 'rgba(255, 123, 0, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(STAR_X, STAR_Y, r * 2.6, 0, Math.PI * 2);
    ctx.fill();
    // Molten core with swirling darker veins.
    const core = ctx.createRadialGradient(STAR_X - 10, STAR_Y - 12, 4, STAR_X, STAR_Y, r);
    core.addColorStop(0, '#fff3c4');
    core.addColorStop(0.55, '#ffb347');
    core.addColorStop(1, '#ff7b00');
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.arc(STAR_X, STAR_Y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(120, 40, 0, 0.5)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 3; i++) {
      const a = t * 0.5 + i * 2.1;
      ctx.beginPath();
      ctx.arc(STAR_X, STAR_Y, r * (0.45 + i * 0.16), a, a + 2.2);
      ctx.stroke();
    }
    // Core integrity ring around the star.
    const frac = Math.max(0, w.core / MAX_CORE);
    ctx.strokeStyle = frac > 0.5 ? GREEN : frac > 0.25 ? GOLD : RED;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(STAR_X, STAR_Y, r + 9, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 13px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('FORGE-STAR', STAR_X, STAR_Y + r + 26);
  }

  drawBuoys(ctx, w) {
    for (const b of w.buoys) {
      // Black-hole buoy: dark disc with a cyan accretion ring.
      const g = ctx.createRadialGradient(b.x, b.y, 1, b.x, b.y, b.r + 8);
      g.addColorStop(0, '#000000');
      g.addColorStop(0.7, '#12041f');
      g.addColorStop(1, 'rgba(125, 249, 255, 0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r + 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = CYAN;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r + 3, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = CYAN;
      ctx.font = 'bold 10px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(b.name, b.x, b.y - b.r - 10);
    }
  }

  drawComets(ctx, w) {
    for (const c of w.comets) {
      ctx.strokeStyle = 'rgba(125, 249, 255, 0.7)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(c.x - c.vx * 0.12, c.y - c.vy * 0.12);
      ctx.lineTo(c.x, c.y);
      ctx.stroke();
      ctx.fillStyle = '#b8fbff';
      ctx.beginPath();
      ctx.arc(c.x, c.y, c.radius * 0.7, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = CYAN;
      ctx.font = '9px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('+15', c.x, c.y - c.radius - 6);
    }
  }

  drawStructures(ctx, w) {
    for (const s of w.structures) {
      // Orbit ring for this structure.
      ctx.strokeStyle = 'rgba(125, 249, 255, 0.12)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(STAR_X, STAR_Y, s.orbitR, 0, Math.PI * 2);
      ctx.stroke();
      // Decay warning: the ring turns red as the orbit decays.
      ctx.fillStyle = s.color;
      ctx.save();
      ctx.translate(s.x, s.y);
      if (s.kind === 'turret') {
        ctx.rotate(Math.atan2(STAR_Y - s.y, STAR_X - s.x));
        ctx.fillRect(-7, -4, 14, 8);
        ctx.fillRect(4, -2, 10, 4);
      } else if (s.kind === 'flak') {
        ctx.beginPath();
        ctx.arc(0, 0, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#05030d';
        ctx.beginPath();
        ctx.arc(0, 0, 4, 0, Math.PI * 2);
        ctx.fill();
      } else if (s.kind === 'repulsor') {
        ctx.beginPath();
        ctx.arc(0, 0, 9, 0, Math.PI * 2);
        ctx.strokeStyle = s.color;
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(0, 0, 4, 0, Math.PI * 2);
        ctx.fill();
      } else {
        // Dyson Collector: a ring with collector petals.
        ctx.strokeStyle = s.color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, 9, 0, Math.PI * 2);
        ctx.stroke();
        for (let i = 0; i < 4; i++) {
          ctx.rotate(Math.PI / 2);
          ctx.fillRect(8, -2, 6, 4);
        }
      }
      ctx.restore();
      // Decay warning: shown as soon as a boost can actually help (more
      // than 12px below the nominal ring), large enough to read, and pushed
      // radially outward from the star so it never covers the FORGE-STAR
      // caption underneath a low, decayed structure.
      if (s.orbitR < s.nominalR - 12) {
        const dx = s.x - STAR_X;
        const dy = s.y - STAR_Y;
        const d = Math.hypot(dx, dy) || 1;
        const lx = s.x + (dx / d) * 18;
        const ly = s.y + (dy / d) * 18 - 10;
        ctx.fillStyle = RED;
        ctx.font = 'bold 13px monospace';
        ctx.textAlign = 'center';
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.85)';
        ctx.lineWidth = 3;
        ctx.strokeText('DECAY! Q', lx, ly);
        ctx.fillText('DECAY! Q', lx, ly);
      }
    }
  }

  drawEnemies(ctx, w) {
    for (const e of w.enemies) {
      ctx.save();
      ctx.translate(e.x, e.y);
      if (e.kind === 'asteroid') {
        ctx.rotate(e.angle);
        ctx.fillStyle = e.color;
        ctx.beginPath();
        for (let i = 0; i < 7; i++) {
          const a = (i / 7) * Math.PI * 2;
          const rr = e.radius * (0.8 + ((i * 37) % 10) / 28);
          const px = Math.cos(a) * rr;
          const py = Math.sin(a) * rr;
          if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();
      } else if (e.kind === 'cruiser') {
        // Shield-cruiser: a wedge with a bright frontal shield arc.
        const fa = Math.atan2(STAR_Y - e.y, STAR_X - e.x);
        ctx.rotate(fa);
        ctx.fillStyle = e.color;
        ctx.beginPath();
        ctx.moveTo(20, 0);
        ctx.lineTo(-14, -13);
        ctx.lineTo(-8, 0);
        ctx.lineTo(-14, 13);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = 'rgba(76, 201, 240, 0.9)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(0, 0, 24, -0.9, 0.9);
        ctx.stroke();
      } else if (e.kind === 'leech') {
        ctx.rotate(e.angle);
        ctx.fillStyle = e.color;
        ctx.beginPath();
        ctx.arc(0, 0, e.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        for (let i = 0; i < 3; i++) {
          ctx.rotate((Math.PI * 2) / 3);
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(e.radius + 7, 0);
          ctx.stroke();
        }
      } else if (e.kind === 'dreadnought') {
        // THE VOID MAW: a huge dark maw with a glowing violet core.
        ctx.rotate(Math.atan2(STAR_Y - e.y, STAR_X - e.x));
        ctx.fillStyle = '#1a0533';
        ctx.beginPath();
        ctx.moveTo(70, 0);
        ctx.lineTo(30, -48);
        ctx.lineTo(-50, -40);
        ctx.lineTo(-64, 0);
        ctx.lineTo(-50, 40);
        ctx.lineTo(30, 48);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = '#e0aaff';
        ctx.lineWidth = 3;
        ctx.stroke();
        const cg = ctx.createRadialGradient(0, 0, 2, 0, 0, 26);
        cg.addColorStop(0, '#fff');
        cg.addColorStop(0.5, '#b5179e');
        cg.addColorStop(1, 'rgba(181, 23, 158, 0)');
        ctx.fillStyle = cg;
        ctx.beginPath();
        ctx.arc(0, 0, 26, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 11px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('VOID MAW', 0, -72);
      }
      ctx.restore();
      // HP bar for anything hurt.
      if (e.hp < e.maxHp && e.kind !== 'dreadnought') {
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(e.x - 16, e.y - e.radius - 10, 32, 4);
        ctx.fillStyle = RED;
        ctx.fillRect(e.x - 16, e.y - e.radius - 10, 32 * Math.max(0, e.hp / e.maxHp), 4);
      }
    }
  }

  drawProjectiles(ctx, w) {
    for (const p of w.projectiles) {
      // Fiery plasma trail.
      if (p.trail.length > 1) {
        ctx.strokeStyle = p.color;
        ctx.globalAlpha = 0.55;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(p.trail[0].x, p.trail[0].y);
        for (const tp of p.trail) ctx.lineTo(tp.x, tp.y);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
      ctx.fillStyle = p.from === 'lance' ? '#ffffff' : p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.from === 'lance' ? 5 : 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  drawParticles(ctx, w) {
    for (const p of w.particles) {
      ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    ctx.globalAlpha = 1;
  }

  drawDamageNumbers(ctx, w) {
    ctx.font = 'bold 13px monospace';
    ctx.textAlign = 'center';
    for (const d of w.damageNumbers) {
      ctx.globalAlpha = Math.min(1, d.life / 0.5);
      ctx.fillStyle = d.color;
      ctx.fillText(d.text, d.x, d.y);
    }
    ctx.globalAlpha = 1;
  }

  // ---- HUD ----

  drawHUD(ctx) {
    const w = this.world;
    this.drawTopBar(ctx, w);
    this.drawLeftPanel(ctx, w);
    this.drawRightPanel(ctx, w);
    this.drawTechStrip(ctx, w);
    this.drawControls(ctx, w);
    if (w.boss) this.drawBossBar(ctx, w);
    if (w.phase === 'playing') this.drawAimArc(ctx, w);
  }

  panel(ctx, x, y, pw, ph, title) {
    ctx.fillStyle = 'rgba(5, 8, 20, 0.72)';
    ctx.fillRect(x, y, pw, ph);
    ctx.strokeStyle = 'rgba(125, 249, 255, 0.35)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, pw, ph);
    ctx.fillStyle = CYAN;
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(title, x + 8, y + 16);
  }

  drawTopBar(ctx, w) {
    ctx.fillStyle = 'rgba(5, 8, 20, 0.72)';
    ctx.fillRect(0, 0, 1280, 40);
    ctx.strokeStyle = 'rgba(125, 249, 255, 0.35)';
    ctx.beginPath();
    ctx.moveTo(0, 40.5);
    ctx.lineTo(1280, 40.5);
    ctx.stroke();
    ctx.textAlign = 'left';
    ctx.font = 'bold 17px monospace';
    ctx.fillStyle = GOLD;
    ctx.fillText('WAVE ' + Math.max(1, w.wave) + ' / ' + TOTAL_WAVES, 16, 27);
    ctx.fillStyle = '#fff';
    ctx.fillText('SCORE ' + w.score, 200, 27);
    ctx.fillStyle = w.chain >= 6 ? '#ff9e5e' : CYAN;
    ctx.fillText('CHAIN x' + w.chain, 380, 27);
    ctx.fillStyle = '#9fb3c8';
    ctx.font = '13px monospace';
    ctx.fillText('TIME ' + Math.floor(w.time) + 's', 520, 26);
    // WIN / LOSE state in plain words, like the top entries do.
    const state = w.phase === 'playing' ? (w.core < 30 ? 'CORE CRITICAL' : 'FORGE HOLDS') : w.phase.toUpperCase();
    ctx.fillStyle = w.core < 30 ? RED : GREEN;
    ctx.font = 'bold 15px monospace';
    ctx.textAlign = 'right';
    ctx.fillText(state, 1264, 27);
  }

  drawLeftPanel(ctx, w) {
    this.panel(ctx, 12, 52, 210, 168, 'FORGE-STAR');
    ctx.textAlign = 'left';
    // Core Integrity bar.
    ctx.fillStyle = '#9fb3c8';
    ctx.font = '11px monospace';
    ctx.fillText('CORE INTEGRITY', 20, 88);
    const frac = Math.max(0, w.core / MAX_CORE);
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.fillRect(20, 96, 194, 14);
    ctx.fillStyle = frac > 0.5 ? GREEN : frac > 0.25 ? GOLD : RED;
    ctx.fillRect(20, 96, 194 * frac, 14);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 12px monospace';
    ctx.fillText(Math.ceil(w.core) + ' / ' + MAX_CORE, 20, 126);
    // Resources.
    ctx.fillStyle = GOLD;
    ctx.font = 'bold 14px monospace';
    ctx.fillText('PLASMA ' + Math.floor(w.plasma), 20, 148);
    ctx.fillStyle = '#e0aaff';
    ctx.fillText('ORE ' + Math.floor(w.ore), 20, 168);
    ctx.fillStyle = CYAN;
    ctx.font = '12px monospace';
    ctx.fillText('ENERGY FLOW +' + w.tech.plasmaRate().toFixed(1) + ' MW/s', 20, 188);
    ctx.fillStyle = '#9fb3c8';
    ctx.fillText('STRUCTURES ' + w.structures.length + ' / 8', 20, 208);
  }

  drawRightPanel(ctx, w) {
    this.panel(ctx, 1058, 52, 210, 268, 'INCOMING');
    ctx.textAlign = 'left';
    ctx.font = '11px monospace';
    const rows = [
      ['Asteroid', this.countKind('asteroid'), 'dives at the Forge'],
      ['Shield-Cruiser', this.countKind('cruiser'), 'armored front — flank it'],
      ['Gravity Leech', this.countKind('leech'), 'drains energy flow'],
      ['Comet', w.comets.length, 'shoot to harvest plasma'],
      ['Dreadnought', w.boss ? 1 : 0, 'eats stars, spawns leeches'],
    ];
    let y = 76;
    for (const [name, n, desc] of rows) {
      ctx.fillStyle = n > 0 ? '#fff' : '#5a6b80';
      ctx.fillText(name + ' x' + n, 1066, y);
      ctx.fillStyle = '#7d8aa0';
      ctx.font = '10px monospace';
      ctx.fillText(desc, 1066, y + 12);
      ctx.font = '11px monospace';
      y += 30;
    }
    // Wave Threat Radar: a minimap of the field.
    ctx.fillStyle = CYAN;
    ctx.font = 'bold 11px monospace';
    ctx.fillText('THREAT RADAR', 1066, y + 6);
    const cx = 1163;
    const cy = y + 46;
    ctx.strokeStyle = 'rgba(125, 249, 255, 0.4)';
    ctx.beginPath();
    ctx.arc(cx, cy, 30, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = GOLD;
    ctx.beginPath();
    ctx.arc(cx, cy, 4, 0, Math.PI * 2);
    ctx.fill();
    for (const e of w.enemies) {
      ctx.fillStyle = e.color;
      const rx = cx + ((e.x - STAR_X) / 700) * 30;
      const ry = cy + ((e.y - STAR_Y) / 700) * 30;
      ctx.fillRect(rx - 2, ry - 2, 4, 4);
    }
  }

  countKind(kind) {
    const w = this.world;
    let n = w.enemies.filter((e) => e.kind === kind).length;
    for (const q of w.director.spawnQueue) if (q.kind === kind) n++;
    return n;
  }

  drawTechStrip(ctx, w) {
    // Two rows of four: every tech name fits inside the strip.
    this.panel(ctx, 12, 636, 1256, 52, 'TECH TREE — click a name to buy');
    ctx.textAlign = 'left';
    ctx.font = '10px monospace';
    for (let i = 0; i < TECHS.length; i++) {
      const t = TECHS[i];
      const owned = w.tech.owned.has(t.id);
      const afford = w.tech.canBuy(t.id);
      const col = 112 + (i % 4) * 300;
      const row = 668 + Math.floor(i / 4) * 16;
      ctx.fillStyle = owned ? GREEN : afford ? '#fff' : '#5a6b80';
      ctx.fillText((owned ? '✓ ' : '') + t.name + ' ' + t.cost.plasma + 'P/' + t.cost.ore + 'O', col, row);
    }
  }

  // Q boost state in plain words, updated every frame: READY when a boost
  // would actually do something, otherwise the exact reason it would not.
  qBoostStatus() {
    const w = this.world;
    if (!w.structures.length) return { text: 'Q boost — no structures', ready: false };
    if (!w.structureManager.needyStructures().length) return { text: 'Q boost — no decay yet', ready: false };
    if (w.plasma < 10) return { text: 'Q boost — need 10 plasma', ready: false };
    return { text: 'Q boost READY', ready: true };
  }

  drawControls(ctx, w) {
    // A failed key press flashes the whole controls row grey for half a
    // second so the player sees the game heard them (world.controlsFlash).
    ctx.fillStyle = w.controlsFlash > 0 ? 'rgba(150, 160, 180, 0.45)' : 'rgba(5, 8, 20, 0.72)';
    ctx.fillRect(0, 692, 1280, 28);
    ctx.font = '12px monospace';
    const nova = w.tech.owned.has('nova')
      ? 'X nova' + (w.novaCooldown > 0 ? ' (' + Math.ceil(w.novaCooldown) + 's)' : ' READY')
      : 'X nova (locked)';
    const q = this.qBoostStatus();
    // Draw the row in segments so the Q state can glow green when ready.
    const segs = [
      { text: 'Mouse aim · Click fire · 1-4 build · ', color: '#9fb3c8' },
      { text: q.text, color: q.ready ? GREEN : '#9fb3c8' },
      { text: ' · ' + nova + ' · P pause · M mute · wheel zoom', color: '#9fb3c8' },
    ];
    let total = 0;
    for (const s of segs) total += ctx.measureText(s.text).width;
    let x = 640 - total / 2;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    for (const s of segs) {
      ctx.fillStyle = s.color;
      ctx.fillText(s.text, x, 710);
      x += ctx.measureText(s.text).width;
    }
  }

  drawBossBar(ctx, w) {
    const b = w.boss;
    if (!b) return;
    const bw = 420;
    const bx = 640 - bw / 2;
    ctx.fillStyle = 'rgba(5, 8, 20, 0.8)';
    ctx.fillRect(bx - 8, 46, bw + 16, 34);
    ctx.strokeStyle = '#e0aaff';
    ctx.strokeRect(bx - 8.5, 46.5, bw + 16, 34);
    ctx.fillStyle = '#e0aaff';
    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('☠ THE VOID MAW ☠', 640, 60);
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.fillRect(bx, 64, bw, 9);
    ctx.fillStyle = '#b5179e';
    ctx.fillRect(bx, 64, bw * Math.max(0, b.hp / b.maxHp), 9);
  }

  drawAimArc(ctx, w) {
    const aim = w.aim;
    if (!aim || !aim.active) return;
    const pts = w.physics.predictTrajectory(STAR_X, STAR_Y, aim.vx, aim.vy, 90, 1 / 60);
    if (pts.length < 3) return;
    // A faint spine under the dots so the curve reads at thumbnail size.
    ctx.strokeStyle = 'rgba(125, 249, 255, 0.30)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (const p of pts) ctx.lineTo(p.x, p.y);
    ctx.stroke();
    ctx.fillStyle = 'rgba(125, 249, 255, 0.9)';
    for (const p of pts) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // ---- title / end screens ----

  drawTitle(ctx, w) {
    ctx.fillStyle = 'rgba(3, 2, 10, 0.55)';
    ctx.fillRect(0, 0, 1280, 720);
    ctx.textAlign = 'center';
    ctx.fillStyle = GOLD;
    ctx.font = 'bold 64px monospace';
    ctx.fillText('GRAVITAS FORGE', 640, 190);
    ctx.fillStyle = CYAN;
    ctx.font = '18px monospace';
    ctx.fillText('ORBITAL GRAVITY-SLINGSHOT DEFENSE', 640, 224);
    ctx.fillStyle = '#d7dee8';
    ctx.font = '15px monospace';
    ctx.fillText('Bend every shot around black-hole buoys. Flank the armored cruisers.', 640, 262);
    ctx.fillText('Harvest comets. Build the ring. Hold the Forge-Star for 7 waves.', 640, 286);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 20px monospace';
    ctx.fillText('CLICK OR PRESS ENTER TO BEGIN', 640, 350);
    ctx.fillStyle = '#9fb3c8';
    ctx.font = '13px monospace';
    ctx.fillText('Mouse aim · Click fire · 1-4 build structures · Q boost orbits · X nova · P pause · M mute', 640, 392);
    ctx.fillStyle = CYAN;
    ctx.font = '12px monospace';
    ctx.fillText('Railgun Turret · Plasma Flak · Gravity Repulsor · Dyson Collector — 8 techs, 2 superweapons', 640, 418);
    ctx.fillStyle = '#5a6b80';
    ctx.font = '11px monospace';
    ctx.fillText('A live AI orbital battle rages behind this screen — the Forge never sleeps.', 640, 452);
  }

  drawEnd(ctx, w) {
    const won = w.phase === 'won';
    ctx.fillStyle = won ? 'rgba(3, 20, 8, 0.72)' : 'rgba(25, 3, 8, 0.78)';
    ctx.fillRect(0, 0, 1280, 720);
    ctx.textAlign = 'center';
    ctx.fillStyle = won ? GREEN : RED;
    ctx.font = 'bold 58px monospace';
    ctx.fillText(won ? 'THE FORGE ENDURES' : 'THE FORGE FALLS', 640, 170);
    ctx.fillStyle = '#d7dee8';
    ctx.font = '16px monospace';
    ctx.fillText(
      won ? 'The Void Maw is undone. Every orbit holds. The star burns on.'
        : 'The Forge-Star went dark. The fleet feeds on its ashes.',
      640, 208,
    );
    // Post-run analytics.
    // Hits can exceed shots (flak pellets, piercing lance), so cap at 100%.
    const acc = w.shots > 0 ? Math.min(100, Math.round((w.hits / w.shots) * 100)) : 0;
    ctx.fillStyle = GOLD;
    ctx.font = 'bold 20px monospace';
    ctx.fillText(
      'SCORE ' + w.score + ' · KILLS ' + w.kills + ' · WAVE ' + Math.min(w.wave, TOTAL_WAVES) + '/' + TOTAL_WAVES +
      ' · TIME ' + Math.floor(w.time) + 's',
      640, 262,
    );
    ctx.fillStyle = '#d7dee8';
    ctx.font = '15px monospace';
    ctx.fillText('ACCURACY ' + acc + '%  ·  PEAK CHAIN x' + w.peakChain + '  ·  STRUCTURES BUILT ' + w.structuresBuilt, 640, 296);
    ctx.fillText(
      'PLASMA EARNED ' + Math.floor(w.plasmaEarned) + '  ·  ORE EARNED ' + Math.floor(w.oreEarned) +
      '  ·  LANCES ' + w.lanceFired + '  ·  NOVAS ' + w.novaUsed,
      640, 322,
    );
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 18px monospace';
    ctx.fillText('Press R or click to play again', 640, 380);
  }

  drawPaused(ctx, w) {
    ctx.fillStyle = 'rgba(3, 2, 10, 0.6)';
    ctx.fillRect(0, 0, 1280, 720);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 44px monospace';
    ctx.fillText('PAUSED', 640, 340);
    ctx.fillStyle = '#9fb3c8';
    ctx.font = '15px monospace';
    ctx.fillText('Press P to resume', 640, 378);
  }
}
