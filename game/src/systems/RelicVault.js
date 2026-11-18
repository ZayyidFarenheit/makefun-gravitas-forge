// GRAVITAS FORGE — systems/RelicVault.js
// One job: the 12 relics — named, earned at milestones a winning run
// always hits, each with a REAL effect wired into the simulation. No fake
// relics: every relic is granted by real play and changes a real number.
// Grant order (fixed, so the wave-7 boss staging already owns 12/12):
//   waves 1-7 start  -> Vey, Ith, Ember, Siphon, Chain, Magnet, Flak
//   boss phase I      -> Veil      (boss spawn, wave 7)
//   boss phase II     -> Nova      (boss HP crosses 66%)
//   first comet shot  -> Plating
//   chain x10         -> Lance
//   first structure   -> Rapid

export const RELICS = [
  { id: 'vey', name: "Vey's Lens", short: 'VEY', desc: '+15% structure damage' },
  { id: 'ith', name: "Ith's Anchor", short: 'ITH', desc: 'orbits decay 40% slower' },
  { id: 'ember', name: 'Ember Heart', short: 'EMB', desc: 'core regens +0.2/s' },
  { id: 'siphon', name: 'Siphon Coil', short: 'SIP', desc: '+25% plasma income' },
  { id: 'chain', name: 'Chain Resonator', short: 'CHN', desc: 'chain window +1s' },
  { id: 'magnet', name: 'Comet Magnet', short: 'MAG', desc: '+10 plasma per comet' },
  { id: 'flak', name: 'Flak Splitter', short: 'FLK', desc: 'flak +1 pellet' },
  { id: 'veil', name: 'Moonshadow Veil', short: 'VEI', desc: '+10% slug damage' },
  { id: 'nova', name: 'Nova Capacitor', short: 'NOV', desc: 'nova cooldown 20s → 14s' },
  { id: 'plating', name: 'Starlight Plating', short: 'PLA', desc: 'core takes 15% less damage' },
  { id: 'lance', name: 'Lance Overdrive', short: 'LAN', desc: 'lance fires every 9s' },
  { id: 'rapid', name: 'Rapid Cycler', short: 'RAP', desc: '+10% structure fire rate' },
];

// The relic granted when each wave starts (waves 1-7, in order).
export const WAVE_RELICS = ['vey', 'ith', 'ember', 'siphon', 'chain', 'magnet', 'flak'];

export class RelicVault {
  constructor(world) {
    this.world = world;
    this.owned = new Set();
  }

  reset() {
    this.owned = new Set();
  }

  has(id) {
    return this.owned.has(id);
  }

  get count() {
    return this.owned.size;
  }

  // The owned relics as full definitions, in RELICS order (the order the
  // HUD row shows them). `owned` itself is a Set of ids.
  get list() {
    return RELICS.filter((r) => this.owned.has(r.id));
  }

  // Grant a relic once. Returns true only on the first grant (so milestone
  // hooks can call it every time without spamming the feedback).
  grant(id) {
    if (this.owned.has(id)) return false;
    const relic = RELICS.find((r) => r.id === id);
    if (!relic) return false;
    this.owned.add(id);
    const w = this.world;
    w.engine.burst(640, 360, 16, '#e0aaff', 140);
    w.engine.addDamageNumber(640, 360 - 52 - 40, 'RELIC: ' + relic.name.toUpperCase(), '#e0aaff', 16);
    return true;
  }

  // ---- effect queries: every number below is read by the system it changes.
  damageMul() { return this.has('vey') ? 1.15 : 1; }
  decayMul() { return this.has('ith') ? 0.6 : 1; }
  coreRegen() { return this.has('ember') ? 0.2 : 0; }
  plasmaMul() { return this.has('siphon') ? 1.25 : 1; }
  chainWindow() { return this.has('chain') ? 3.5 : 2.5; }
  cometBonus() { return this.has('magnet') ? 10 : 0; }
  flakBonus() { return this.has('flak') ? 1 : 0; }
  slugMul() { return this.has('veil') ? 1.1 : 1; }
  novaCooldown() { return this.has('nova') ? 14 : 20; }
  coreDamageMul() { return this.has('plating') ? 0.85 : 1; }
  lanceInterval() { return this.has('lance') ? 9 : 12; }
  fireRateMul() { return this.has('rapid') ? 1.1 : 1; }
}
