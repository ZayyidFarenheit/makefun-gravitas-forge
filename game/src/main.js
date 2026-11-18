// GRAVITAS FORGE — game/src/main.js
// The entrypoint: wires the seven modules, owns the world object, reads input,
// runs the render loop, stages screenshots (?shot=), and exposes the debug
// handle window.__gravitas (state, autoplay driver, build/buy hooks).

import { SimulationEngine, VIEW_W, VIEW_H, STAR_X, STAR_Y, STAR_R, FIXED_DT } from './core/SimulationEngine.js';
import { OrbitalPhysicsEngine } from './systems/OrbitalPhysicsEngine.js';
import { FleetWaveDirector, TOTAL_WAVES } from './systems/FleetWaveDirector.js';
import { StructureManager, STRUCTURE_DEFS, MAX_STRUCTURES, OrbitalStructure } from './entities/OrbitalStructure.js';
import { TechTreeManager, TECHS } from './systems/TechTreeManager.js';
import { TelemetryHUDRenderer } from './ui/TelemetryHUDRenderer.js';
import { CosmicSynthAudio } from './audio/CosmicSynthAudio.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

// ---- the world: one object every system shares ----
function makeWorld() {
  return {
    phase: 'title',
    paused: false,
    time: 0,
    wave: 0,
    score: 0,
    chain: 0,
    chainTimer: 0,
    plasma: 80,
    ore: 20,
    core: 100,
    kills: 0,
    shots: 0,
    hits: 0,
    plasmaEarned: 0,
    oreEarned: 0,
    structuresBuilt: 0,
    novaUsed: 0,
    lanceFired: 0,
    peakChain: 0,
    enemies: [],
    projectiles: [],
    particles: [],
    damageNumbers: [],
    structures: [],
    comets: [],
    boss: null,
    bossDefeated: false,
    waveClear: false,
    waveBreakTimer: 0,
    novaCooldown: 0,
    controlsFlash: 0, // seconds left of the grey flash on the controls row
    flankHits: 0, // shielded enemies killed or hurt from the flank (Pass 2)
    phaseBanner: null, // { text, sub, timer } while a boss-phase banner shows
    lanceTimer: 12,
    buoys: [
      { x: STAR_X + 330, y: STAR_Y, r: 16, mass: 2600, angle: 0, orbitR: 330, orbitSpeed: 0.12, kind: 'moon', name: 'Vey' },
      { x: STAR_X - 300, y: STAR_Y, r: 13, mass: 2000, angle: Math.PI, orbitR: 300, orbitSpeed: -0.16, kind: 'moon', name: 'Ith' },
    ],
    stars: makeStarfield(),
    aim: { active: false, x: STAR_X + 200, y: STAR_Y, vx: 520, vy: 0 },
    fireCooldown: 0,
    mouseDown: false,
    mouseX: STAR_X + 200,
    mouseY: STAR_Y,
  };
}

function makeStarfield() {
  const stars = [];
  let seed = 1337;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  for (let i = 0; i < 170; i++) {
    stars.push({
      x: rnd() * VIEW_W,
      y: rnd() * VIEW_H,
      s: rnd() < 0.85 ? 1 : 2,
      a: 0.25 + rnd() * 0.6,
      c: rnd() < 0.8 ? '#cdd7ff' : rnd() < 0.5 ? '#ffe9b0' : '#9ff3ff',
    });
  }
  return stars;
}

const world = makeWorld();
world.engine = new SimulationEngine(world);
world.physics = new OrbitalPhysicsEngine(world);
world.director = new FleetWaveDirector(world);
world.structureManager = new StructureManager(world);
world.tech = new TechTreeManager(world);
world.hud = new TelemetryHUDRenderer(world);
const audio = new CosmicSynthAudio();
world.audio = audio; // the physics engine plays the flank-hit chime through it

const systems = {
  physics: world.physics,
  director: world.director,
  structures: world.structureManager,
  tech: world.tech,
};

// ---- input ----

function canvasPos(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: ((clientX - rect.left) / rect.width) * VIEW_W,
    y: ((clientY - rect.top) / rect.height) * VIEW_H,
  };
}

function updateAim() {
  const dx = world.mouseX - STAR_X;
  const dy = world.mouseY - STAR_Y;
  const d = Math.hypot(dx, dy) || 1;
  world.aim.x = world.mouseX;
  world.aim.y = world.mouseY;
  world.aim.vx = (dx / d) * 520;
  world.aim.vy = (dy / d) * 520;
  world.aim.active = world.phase === 'playing' && !world.paused;
}

canvas.addEventListener('mousemove', (e) => {
  const p = canvasPos(e.clientX, e.clientY);
  world.mouseX = p.x;
  world.mouseY = p.y;
  updateAim();
});

canvas.addEventListener('mousedown', (e) => {
  audio.ensure();
  const p = canvasPos(e.clientX, e.clientY);
  world.mouseX = p.x;
  world.mouseY = p.y;
  world.mouseDown = true;
  updateAim();
  if (world.phase === 'title') { world.engine.startRun(); return; }
  if (world.phase === 'won' || world.phase === 'lost') { world.engine.startRun(); return; }
  if (world.phase !== 'playing' || world.paused) return;
  // Clicking a tech name in the strip buys it.
  if (p.y >= 636 && p.y <= 688 && p.x >= 112 && p.x < 1312) {
    const col = Math.floor((p.x - 112) / 300);
    const row = p.y < 676 ? 0 : 1;
    const idx = row * 4 + col;
    if (TECHS[idx] && world.tech.buy(TECHS[idx].id)) audio.blip(990);
    return;
  }
  firePlayerSlug();
});

window.addEventListener('mouseup', () => { world.mouseDown = false; });

window.addEventListener('wheel', (e) => {
  e.preventDefault();
  world.engine.zoomAt(e.deltaY > 0 ? 0.92 : 1.09);
}, { passive: false });

window.addEventListener('keydown', (e) => {
  audio.ensure();
  const k = e.key.toLowerCase();
  if (k === 'enter') {
    if (world.phase === 'title' || world.phase === 'won' || world.phase === 'lost') world.engine.startRun();
    return;
  }
  if (k === 'r' && (world.phase === 'won' || world.phase === 'lost')) { world.engine.startRun(); return; }
  if (world.phase !== 'playing') return;
  if (k === 'p') { world.paused = !world.paused; return; }
  if (k === 'm') { audio.setMuted(!audio.muted); return; }
  // Paused: Q and X still answer with a low blip so the player knows the
  // game heard them (the controls row hides behind the PAUSED overlay).
  if (world.paused) {
    if (k === 'q' || k === 'x') audio.blip(220);
    return;
  }
  if (k === '1') buildStructure('turret');
  else if (k === '2') buildStructure('flak');
  else if (k === '3') buildStructure('repulsor');
  else if (k === '4') buildStructure('dyson');
  else if (k === 'q') {
    const boosted = world.structureManager.needyStructures();
    if (world.structureManager.boostAll()) {
      audio.blip(660);
      // Success FX: a cyan ring burst and a +BOOST tag over every boosted ring.
      for (const s of boosted) {
        world.engine.burst(s.x, s.y, 14, '#7df9ff', 130);
        world.engine.addDamageNumber(s.x, s.y - 18, '+BOOST', '#7df9ff');
      }
    } else {
      failFeedback();
    }
  } else if (k === 'x') {
    if (world.tech.fireNova()) audio.explosion(true);
    else failFeedback();
  }
});

// A failed key press answers anyway: a low blip plus a grey flash on the
// controls row, so no button ever feels dead.
function failFeedback() {
  audio.blip(220);
  world.controlsFlash = 0.5;
}

function buildStructure(kind, silent) {
  if (world.structureManager.build(kind)) {
    audio.blip(760);
    world.engine.addDamageNumber(STAR_X, STAR_Y - STAR_R - 22, STRUCTURE_DEFS[kind].name.toUpperCase() + ' ONLINE', '#7df9ff');
  } else if (!silent) {
    // The build failed (too poor, or no slot left): say so, at the star.
    failFeedback();
    const def = STRUCTURE_DEFS[kind];
    const reason = world.structures.length >= MAX_STRUCTURES ? 'SLOTS FULL' : 'NEED ' + def.cost.plasma + 'P';
    world.engine.addDamageNumber(STAR_X, STAR_Y - STAR_R - 22, reason, '#9fb3c8');
  }
}

function firePlayerSlug() {
  if (world.fireCooldown > 0) return;
  world.fireCooldown = 0.22;
  const a = Math.atan2(world.mouseY - STAR_Y, world.mouseX - STAR_X);
  world.projectiles.push({
    x: STAR_X + Math.cos(a) * (STAR_R + 8),
    y: STAR_Y + Math.sin(a) * (STAR_R + 8),
    vx: Math.cos(a) * 520,
    vy: Math.sin(a) * 520,
    dmg: 12,
    life: 2.5,
    pierce: 0,
    trail: [],
    from: 'player',
    color: '#ffe08a',
  });
  world.shots++;
  audio.whoosh();
}

// ---- autoplay driver (verification + title demo share it) ----

const TECH_PRIORITY = ['overcharge', 'rapid', 'siphon', 'lens', 'burst', 'reinforced', 'lance', 'nova'];

function autoplayStep() {
  if (world.phase !== 'playing' || world.paused) return;
  // Defense first: anything very close to the star outranks the boss.
  let target = null;
  let bestClose = Infinity;
  for (const e of world.enemies) {
    if (e.kind === 'dreadnought') continue;
    const d = Math.hypot(e.x - STAR_X, e.y - STAR_Y);
    if (d < 160 && d < bestClose) { bestClose = d; target = e; }
  }
  // Aim at the most dangerous enemy: boss first, then nearest to the star.
  if (!target) target = world.boss;
  if (!target) {
    let bestScore = Infinity;
    for (const e of world.enemies) {
      const d = Math.hypot(e.x - STAR_X, e.y - STAR_Y);
      const danger = d - (e.kind === 'leech' ? 60 : 0) - (e.kind === 'cruiser' ? 30 : 0);
      if (danger < bestScore) { bestScore = danger; target = e; }
    }
  }
  // If plasma is low, harvest the nearest comet instead.
  if (!target && world.comets.length) target = world.comets[0];
  if (world.plasma < 35 && world.comets.length) {
    let bd = Infinity;
    for (const c of world.comets) {
      const d = Math.hypot(c.x - STAR_X, c.y - STAR_Y);
      if (d < bd) { bd = d; target = c; }
    }
  }
  if (target) {
    const lead = Math.hypot(target.x - STAR_X, target.y - STAR_Y) / 520;
    world.mouseX = target.x + (target.vx || 0) * lead;
    world.mouseY = target.y + (target.vy || 0) * lead;
    updateAim();
    if (world.fireCooldown <= 0) firePlayerSlug();
  }
  // Build: Dyson first for income, then turrets, flak, repulsor from wave 3.
  // Silent attempts: the bot tries every step, and a failed try is not a
  // player pressing a key, so it must not flash fail feedback.
  if (world.structures.length < 8) {
    const counts = { dyson: 0, turret: 0, flak: 0, repulsor: 0 };
    for (const s of world.structures) counts[s.kind]++;
    if (counts.dyson < 2) buildStructure('dyson', true);
    else if (counts.turret < 3) buildStructure('turret', true);
    else if (counts.flak < 2) buildStructure('flak', true);
    else if (counts.repulsor < 1 && world.wave >= 3) buildStructure('repulsor', true);
    else if (counts.turret < 4) buildStructure('turret', true);
  }
  // Boost decaying orbits before they burn up.
  if (world.structures.some((s) => s.orbitR < 135)) world.structureManager.boostAll();
  // Buy tech in priority order when affordable.
  for (const id of TECH_PRIORITY) {
    if (id === 'reinforced' && world.core > 70) continue;
    if (world.tech.buy(id)) break;
  }
  // Nova when the field is crowded.
  if (world.tech.owned.has('nova') && world.novaCooldown <= 0) {
    const near = world.enemies.filter((e) => Math.hypot(e.x - STAR_X, e.y - STAR_Y) < 300).length;
    if (near >= 6) world.tech.fireNova();
  }
}

// ---- title demo: a living AI battle behind the title card ----

function setupTitleDemo() {
  world.phase = 'title';
  world.time = 0;
  world.enemies = [];
  world.projectiles = [];
  world.particles = [];
  world.damageNumbers = [];
  world.comets = [];
  world.structures = [];
  world.boss = null;
  world.score = 0;
  world.core = 100;
  world.plasma = 200;
  world.ore = 100;
  world.tech.reset();
  // Three pre-built structures so the demo battle looks alive.
  world.structures.push(new OrbitalStructure('turret', world));
  world.structures.push(new OrbitalStructure('flak', world));
  world.structures.push(new OrbitalStructure('dyson', world));
}

setupTitleDemo();

// ---- render loop ----

let frozen = false;

function render() {
  ctx.save();
  ctx.clearRect(0, 0, VIEW_W, VIEW_H);
  world.engine.applyCamera(ctx);
  world.hud.drawWorld(ctx);
  ctx.restore();
  if (world.phase === 'playing') world.hud.drawHUD(ctx);
  if (world.phase === 'title') world.hud.drawTitle(ctx, world);
  if (world.phase === 'won' || world.phase === 'lost') world.hud.drawEnd(ctx, world);
  if (world.paused && world.phase === 'playing') world.hud.drawPaused(ctx, world);
}

function loop(now) {
  requestAnimationFrame(loop);
  if (frozen) { render(); return; }
  if (world.phase === 'title') {
    world.engine.frame(now, (dt) => {
      world.engine.demoStep(dt, systems);
      autoplayStepTitle(dt);
      world.core = 100; // the Forge never falls in the title demo
    });
  } else if (world.phase === 'playing') {
    world.engine.frame(now, (dt) => {
      if (world.fireCooldown > 0) world.fireCooldown -= dt;
      if (world.mouseDown && !window.__gravitas.autoplay) firePlayerSlug();
      if (window.__gravitas.autoplay) autoplayStep();
      world.engine.step(dt, systems);
    });
  }
  render();
}

// The title demo plays itself: the AI aims and fires like the autoplay does.
function autoplayStepTitle(dt) {
  const savedPhase = world.phase;
  world.phase = 'playing';
  const savedPaused = world.paused;
  world.paused = false;
  // Demo structures already exist; reuse the autoplay aim/fire only.
  let target = null;
  let bestD = Infinity;
  for (const e of world.enemies) {
    const d = Math.hypot(e.x - STAR_X, e.y - STAR_Y);
    if (d < bestD) { bestD = d; target = e; }
  }
  if (target && world.fireCooldown <= 0) {
    const lead = bestD / 520;
    world.mouseX = target.x + target.vx * lead;
    world.mouseY = target.y + target.vy * lead;
    updateAim();
    firePlayerSlug();
  }
  if (world.fireCooldown > 0) world.fireCooldown -= dt;
  world.phase = savedPhase;
  world.paused = savedPaused;
}

// ---- fixed-step driver shared by staging and the debug handle ----

function stepSim(seconds, driver) {
  const steps = Math.round(seconds * 60);
  for (let i = 0; i < steps; i++) {
    if (world.fireCooldown > 0) world.fireCooldown -= FIXED_DT;
    if (driver) driver();
    if (world.phase === 'title') world.engine.demoStep(FIXED_DT, systems);
    else world.engine.step(FIXED_DT, systems);
    if (world.phase === 'won' || world.phase === 'lost') break;
  }
  render();
}

// ---- screenshot staging (?shot=) ----

function stageShot(name) {
  if (name === 'title') {
    setupTitleDemo();
    stepSim(14, null);
    world.aim.active = false;
  } else if (name === 'play') {
    world.engine.startRun();
    window.__gravitas.autoplay = true;
    // Fast-forward until wave 4 is in full swing, then freeze mid-fight.
    let steps = 0;
    while (steps < 60 * 300) {
      if (world.fireCooldown > 0) world.fireCooldown -= FIXED_DT;
      autoplayStep();
      world.engine.step(FIXED_DT, systems);
      steps++;
      if (world.wave >= 4 && world.enemies.length >= 8) break;
      if (world.phase === 'won' || world.phase === 'lost') break;
    }
    window.__gravitas.autoplay = false;
    aimAtNearestEnemy();
  } else if (name === 'boss') {
    world.engine.startRun();
    window.__gravitas.autoplay = true;
    // Fast-forward until the boss exists and is at ~50% HP.
    let steps = 0;
    while (steps < 60 * 420) {
      if (world.fireCooldown > 0) world.fireCooldown -= FIXED_DT;
      autoplayStep();
      world.engine.step(FIXED_DT, systems);
      steps++;
      if (world.boss && world.boss.hp <= world.boss.maxHp * 0.5) break;
      if (world.phase === 'won' || world.phase === 'lost') break;
    }
    window.__gravitas.autoplay = false;
    // Cover staging: the freeze frame shows the fight at its peak. The
    // chain shown is the run's real peak chain (at least x8, capped at the
    // x12 score-multiplier cap) — the moment the boss crosses 50% is often
    // a low-chain lull, and the cover should read like the fight feels.
    if (world.phase === 'playing' && world.boss) {
      world.chain = Math.max(world.chain, Math.min(Math.max(world.peakChain, 8), 12));
      world.chainTimer = 2.5;
      // Cover staging: exactly two structures stay decayed (so the Q boost
      // stays READY and the DECAY! Q label still reads) and the rest are
      // fresh — the Pass 1 cover showed six DECAY! Q labels at once.
      world.structures.forEach((s, i) => {
        s.orbitR = i < 2 ? s.nominalR - 20 : s.nominalR;
        s.x = STAR_X + Math.cos(s.angle) * s.orbitR;
        s.y = STAR_Y + Math.sin(s.angle) * s.orbitR;
      });
    }
    aimAtNearestEnemy();
  } else if (name === 'win') {
    world.engine.startRun();
    window.__gravitas.autoplay = true;
    // Fast-forward until the Forge wins the whole run.
    let steps = 0;
    while (steps < 60 * 600) {
      if (world.fireCooldown > 0) world.fireCooldown -= FIXED_DT;
      autoplayStep();
      world.engine.step(FIXED_DT, systems);
      steps++;
      if (world.phase === 'won' || world.phase === 'lost') break;
    }
    window.__gravitas.autoplay = false;
    world.aim.active = false;
  }
  frozen = true;
  render();
  window.__gravitas.shotReady = true;
}

// Point the aim (and its dotted gravity arc) at the nearest enemy.
function aimAtNearestEnemy() {
  let target = world.boss;
  if (!target) {
    let bestD = Infinity;
    for (const e of world.enemies) {
      const d = Math.hypot(e.x - STAR_X, e.y - STAR_Y);
      if (d < bestD) { bestD = d; target = e; }
    }
  }
  if (target) {
    world.mouseX = target.x;
    world.mouseY = target.y;
    updateAim();
    world.aim.active = true;
  }
}

// ---- debug handle ----

window.__gravitas = {
  world,
  engine: world.engine,
  audio,
  autoplay: false,
  shotReady: false,
  state() {
    return {
      phase: world.phase,
      wave: world.wave,
      core: Math.round(world.core),
      score: world.score,
      chain: world.chain,
      kills: world.kills,
      plasma: Math.floor(world.plasma),
      ore: Math.floor(world.ore),
      enemies: world.enemies.length,
      structures: world.structures.length,
      tech: [...world.tech.owned],
      bossHp: world.boss ? Math.round(world.boss.hp) : null,
      bossPhase: world.boss ? world.boss.phase : null,
      flankHits: world.flankHits,
      flankSounds: audio.flankSounds,
      shots: world.shots,
      hits: world.hits,
      time: Math.round(world.time),
    };
  },
  start() { world.engine.startRun(); },
  build(kind) { return world.structureManager.build(kind); },
  buy(id) { return world.tech.buy(id); },
  boost() { return world.structureManager.boostAll(); },
  nova() { return world.tech.fireNova(); },
  nextWave() { return world.hud.nextWave(); },
  autoplayStep() { autoplayStep(); },
  stepSim(seconds, useAutoplay) {
    const driver = useAutoplay ? autoplayStep : null;
    stepSim(seconds, driver);
    return this.state();
  },
};

const params = new URLSearchParams(location.search);
const shot = params.get('shot');
if (shot) {
  // Stage synchronously before the first frame so headless capture is exact.
  stageShot(shot);
} else {
  requestAnimationFrame(loop);
}
