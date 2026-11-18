// GRAVITAS FORGE — core/SimulationEngine.js
// One job: the fixed-timestep physics accumulator, the zoomable tactical camera,
// screen shake, and the game state controller (title -> playing -> won/lost).
// It owns the world object and drives every system once per fixed step.

export const VIEW_W = 1280;
export const VIEW_H = 720;
export const STAR_X = 640;
export const STAR_Y = 360;
export const STAR_R = 52;
export const FIXED_DT = 1 / 60;
export const MAX_CORE = 100;
// Slug lead speed: the muzzle velocity is 520 px/s, but the star's strong
// gravity decelerates a slug along its whole flight, so the AVERAGE speed
// over a typical 300-500px shot is only ~350 px/s. Aim lead (autoplay and
// turrets) divides by this, not by the muzzle velocity, or shots fall
// behind moving targets. Measured: a radial slug covers ~300px in its
// first second under G_STAR.
export const SLUG_LEAD_SPEED = 350;

// Score scale (Pass 6): every score award is multiplied by this ONE
// constant, so a won run reads ~50,000-60,000 next to the top entries'
// 63,660-1,623,030 instead of ~5,500. Damage, economy and waves are
// untouched — only the displayed score is scaled.
export const SCORE_SCALE = 10;

export class SimulationEngine {
  constructor(world) {
    this.world = world;
    this.accumulator = 0;
    this.lastTime = 0;
    this.camera = { zoom: 1, targetZoom: 1, shake: 0, shakeX: 0, shakeY: 0 };
  }

  // Start a fresh run: clear the field, reset the economy, open wave 1.
  startRun() {
    const w = this.world;
    w.phase = 'playing';
    w.paused = false;
    w.time = 0;
    w.wave = 0;
    w.score = 0;
    w.chain = 0;
    w.chainTimer = 0;
    // Starting economy (Pass 6): all four structure types are affordable
    // at run start — turret 40 + flak 60 + repulsor 50 + dyson 30 = 180
    // plasma, 30 ore — so the opening is about building the ring, not
    // waiting for it. Workshop Deep Reserves adds on top.
    w.plasma = 200 + w.workshop.startPlasmaBonus();
    w.ore = 40;
    w.core = MAX_CORE;
    // Permanent workshop bonus: Reinforced Hull raises the core ceiling.
    w.maxCore = MAX_CORE + w.workshop.maxCoreBonus();
    w.salvageBanked = false;
    w.salvageEarned = 0;
    w.kills = 0;
    w.shots = 0;
    w.hits = 0;
    w.playerHits = 0;
    w.plasmaEarned = 0;
    w.oreEarned = 0;
    w.structuresBuilt = 0;
    w.novaUsed = 0;
    w.lanceFired = 0;
    w.peakChain = 0;
    w.enemies = [];
    w.projectiles = [];
    w.particles = [];
    w.damageNumbers = [];
    w.structures = [];
    w.comets = [];
    w.boss = null;
    w.waveClear = false;
    w.waveBreakTimer = 0;
    w.novaCooldown = 0;
    w.controlsFlash = 0;
    w.flankHits = 0;
    w.phaseBanner = null;
    w.lanceTimer = 12;
    w.threat = 0;
    w.bossDefeated = false;
    // Two pre-placed gravity moons orbit the star and bend every shot.
    w.buoys = [
      { x: STAR_X + 330, y: STAR_Y, r: 16, mass: 2600, angle: 0, orbitR: 330, orbitSpeed: 0.12, kind: 'moon', name: 'Vey' },
      { x: STAR_X - 300, y: STAR_Y, r: 13, mass: 2000, angle: Math.PI, orbitR: 300, orbitSpeed: -0.16, kind: 'moon', name: 'Ith' },
    ];
    w.tech.reset();
    w.relics.reset();
    w.director.startWave(1);
  }

  // Fixed-step driver: called every animation frame with the frame time.
  // Returns false when the run should stop advancing (title demo handles itself).
  frame(now, stepFn) {
    if (!this.lastTime) this.lastTime = now;
    let frameDt = (now - this.lastTime) / 1000;
    this.lastTime = now;
    if (frameDt > 0.25) frameDt = 0.25; // tab-switch guard
    this.accumulator += frameDt;
    let steps = 0;
    while (this.accumulator >= FIXED_DT && steps < 5) {
      stepFn(FIXED_DT);
      this.accumulator -= FIXED_DT;
      steps++;
    }
    if (steps === 5) this.accumulator = 0;
    this.updateCamera(FIXED_DT);
  }

  // One fixed step of the whole world (playing phase only).
  step(dt, systems) {
    const w = this.world;
    if (w.phase !== 'playing' || w.paused) return;
    w.time += dt;
    if (w.novaCooldown > 0) w.novaCooldown -= dt;
    if (w.controlsFlash > 0) w.controlsFlash -= dt;
    if (w.phaseBanner) {
      w.phaseBanner.timer -= dt;
      if (w.phaseBanner.timer <= 0) w.phaseBanner = null;
    }
    if (w.chainTimer > 0) {
      w.chainTimer -= dt;
      if (w.chainTimer <= 0) w.chain = 0;
    }
    // Ember Heart relic: the core slowly regenerates while playing.
    if (w.relics.coreRegen() > 0 && w.core > 0 && w.core < w.maxCore) {
      w.core = Math.min(w.maxCore, w.core + w.relics.coreRegen() * dt);
    }
    // Moons orbit the star; their gravity bends projectiles.
    for (const b of w.buoys) {
      b.angle += b.orbitSpeed * dt;
      b.x = STAR_X + Math.cos(b.angle) * b.orbitR;
      b.y = STAR_Y + Math.sin(b.angle) * b.orbitR;
    }
    systems.physics.step(dt);
    systems.director.update(dt);
    systems.structures.update(dt);
    systems.tech.update(dt);
    this.updateParticles(dt);
    this.updateDamageNumbers(dt);
    this.checkWaveClear(dt);
    this.checkEnd(dt);
  }

  // Title-screen demo: a living AI battle runs behind the title card.
  demoStep(dt, systems) {
    const w = this.world;
    if (w.phase !== 'title') return;
    w.time += dt;
    for (const b of w.buoys) {
      b.angle += b.orbitSpeed * dt;
      b.x = STAR_X + Math.cos(b.angle) * b.orbitR;
      b.y = STAR_Y + Math.sin(b.angle) * b.orbitR;
    }
    systems.physics.step(dt);
    systems.director.demoUpdate(dt);
    systems.structures.update(dt);
    this.updateParticles(dt);
    this.updateDamageNumbers(dt);
  }

  updateParticles(dt) {
    const w = this.world;
    for (let i = w.particles.length - 1; i >= 0; i--) {
      const p = w.particles[i];
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.98;
      p.vy *= 0.98;
      if (p.life <= 0) w.particles.splice(i, 1);
    }
  }

  updateDamageNumbers(dt) {
    const w = this.world;
    for (let i = w.damageNumbers.length - 1; i >= 0; i--) {
      const d = w.damageNumbers[i];
      d.life -= dt;
      d.y -= 34 * dt;
      if (d.life <= 0) w.damageNumbers.splice(i, 1);
    }
  }

  addDamageNumber(x, y, text, color, size) {
    const w = this.world;
    if (w.damageNumbers.length > 60) w.damageNumbers.shift();
    w.damageNumbers.push({ x, y, text, color, size: size || 13, life: 0.9 });
  }

  burst(x, y, count, color, speed) {
    const w = this.world;
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = (speed || 120) * (0.4 + Math.random() * 0.8);
      w.particles.push({
        x, y,
        vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life: 0.4 + Math.random() * 0.5,
        maxLife: 0.9,
        color, size: 1.5 + Math.random() * 2.5,
      });
    }
    if (w.particles.length > 420) w.particles.splice(0, w.particles.length - 420);
  }

  addShake(amount) {
    this.camera.shake = Math.min(14, this.camera.shake + amount);
  }

  updateCamera(dt) {
    const c = this.camera;
    c.zoom += (c.targetZoom - c.zoom) * Math.min(1, dt * 6);
    if (c.shake > 0.2) {
      c.shakeX = (Math.random() - 0.5) * c.shake;
      c.shakeY = (Math.random() - 0.5) * c.shake;
      c.shake *= Math.pow(0.02, dt);
    } else {
      c.shake = 0;
      c.shakeX = 0;
      c.shakeY = 0;
    }
  }

  zoomAt(factor) {
    this.camera.targetZoom = Math.max(0.6, Math.min(1.7, this.camera.targetZoom * factor));
  }

  // Apply a screen-space transform: zoom about the star, then shake.
  applyCamera(ctx) {
    const c = this.camera;
    ctx.translate(STAR_X + c.shakeX, STAR_Y + c.shakeY);
    ctx.scale(c.zoom, c.zoom);
    ctx.translate(-STAR_X, -STAR_Y);
  }

  checkWaveClear(dt) {
    const w = this.world;
    if (w.waveClear) {
      w.waveBreakTimer -= dt;
      if (w.waveBreakTimer <= 0) {
        w.waveClear = false;
        if (w.wave < 7) w.director.startWave(w.wave + 1);
      }
      return;
    }
    if (w.director.waveActive && w.enemies.length === 0 && !w.director.spawnQueue.length && !w.boss) {
      w.waveClear = true;
      w.waveBreakTimer = 3;
      w.plasma += 25 + w.wave * 5;
      w.ore += 10 + w.wave * 3;
      w.plasmaEarned += 25 + w.wave * 5;
      w.oreEarned += 10 + w.wave * 3;
    }
  }

  // Bank Salvage once, at run end: 1 per kill, win or lose.
  bankSalvage() {
    const w = this.world;
    if (w.salvageBanked) return;
    w.salvageBanked = true;
    w.salvageEarned = w.kills;
    w.workshop.bankSalvage(w.kills);
  }

  checkEnd(dt) {
    const w = this.world;
    if (w.core <= 0) {
      w.core = 0;
      w.phase = 'lost';
      this.bankSalvage();
      this.burst(STAR_X, STAR_Y, 90, '#ffb347', 260);
      this.addShake(14);
      return;
    }
    if (w.bossDefeated && w.enemies.length === 0 && !w.director.spawnQueue.length) {
      w.phase = 'won';
      this.bankSalvage();
    }
  }

  // A kill feeds score, chain, ore and the analytics counters.
  registerKill(enemy) {
    const w = this.world;
    w.kills++;
    w.chain++;
    // Chain Resonator relic: the chain window stretches to 3.5s.
    w.chainTimer = w.relics.chainWindow();
    if (w.chain > w.peakChain) w.peakChain = w.chain;
    // Lance Overdrive relic: first time the chain reaches x10.
    if (w.chain === 10) w.relics.grant('lance');
    const mult = 1 + Math.min(w.chain, 12) * 0.1;
    const gained = Math.round(enemy.score * mult * SCORE_SCALE);
    w.score += gained;
    w.ore += enemy.ore;
    w.oreEarned += enemy.ore;
  }
}
