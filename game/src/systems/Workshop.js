// GRAVITAS FORGE — systems/Workshop.js
// One job: the permanent workshop — Salvage banked from kills when a run
// ends (1 per kill, win or lose), spent on permanent upgrades that carry
// across runs. Stored in localStorage with guarded access: the Node
// entrypoint has no window, and a corrupt or unavailable store must never
// crash the game, so every storage touch is typeof-checked and try/caught
// and falls back to memory only.

export const WORKSHOP_UPGRADES = [
  { id: 'hull', name: 'Reinforced Hull', desc: '+15 max core', maxLevel: 3, costs: [100, 200, 350], effect: (lvl) => lvl === 0 ? '+15 max core per level' : '+' + (15 * lvl) + ' max core owned' },
  { id: 'rails', name: 'Overcharged Rails', desc: '+2 slug damage', maxLevel: 3, costs: [100, 200, 350], effect: (lvl) => lvl === 0 ? '+2 slug damage per level' : '+' + (2 * lvl) + ' slug damage owned' },
  { id: 'reserves', name: 'Deep Reserves', desc: '+50 starting plasma', maxLevel: 3, costs: [80, 160, 280], effect: (lvl) => lvl === 0 ? '+50 starting plasma per level' : '+' + (50 * lvl) + ' starting plasma owned' },
  { id: 'comets', name: 'Rich Comets', desc: '+5 plasma per comet', maxLevel: 3, costs: [80, 160, 280], effect: (lvl) => lvl === 0 ? '+5 plasma per comet per level' : '+' + (5 * lvl) + ' plasma per comet owned' },
  { id: 'slots', name: 'Orbital Foundry', desc: '+1 structure slot', maxLevel: 3, costs: [120, 240, 400], effect: (lvl) => lvl === 0 ? '+1 structure slot per level' : '+' + lvl + ' structure slot' + (lvl > 1 ? 's' : '') + ' owned' },
  { id: 'lance', name: 'Lance Capacitor', desc: '+20 lance damage', maxLevel: 3, costs: [120, 240, 400], effect: (lvl) => lvl === 0 ? '+20 lance damage per level' : '+' + (20 * lvl) + ' lance damage owned' },
];

const STORAGE_KEY = 'gravitas-workshop-v1';

export class Workshop {
  constructor() {
    this.salvage = 0;
    this.levels = {};
    this.load();
  }

  // Guarded load: no window (Node) or no storage or corrupt JSON all fall
  // back to a fresh, empty workshop instead of throwing.
  load() {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return;
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      if (typeof data.salvage === 'number') this.salvage = Math.max(0, Math.floor(data.salvage));
      if (data.levels && typeof data.levels === 'object') {
        for (const u of WORKSHOP_UPGRADES) {
          const lv = data.levels[u.id];
          if (typeof lv === 'number') this.levels[u.id] = Math.max(0, Math.min(u.maxLevel, Math.floor(lv)));
        }
      }
    } catch (e) {
      this.salvage = 0;
      this.levels = {};
    }
  }

  save() {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return;
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ salvage: this.salvage, levels: this.levels }));
    } catch (e) {
      // Storage full or unavailable: the workshop keeps working in memory.
    }
  }

  level(id) {
    return this.levels[id] || 0;
  }

  // The Salvage bank — the "SALVAGE n" figure on the title screen.
  get bank() {
    return this.salvage;
  }

  // Upgrades owned at any level, out of 6 — the "WORKSHOP n/6" count.
  ownedCount() {
    return WORKSHOP_UPGRADES.filter((u) => this.level(u.id) > 0).length;
  }

  cost(id) {
    const u = WORKSHOP_UPGRADES.find((x) => x.id === id);
    if (!u) return null;
    const lv = this.level(id);
    if (lv >= u.maxLevel) return null;
    return u.costs[lv];
  }

  canBuy(id) {
    const c = this.cost(id);
    return c !== null && this.salvage >= c;
  }

  buy(id) {
    if (!this.canBuy(id)) return false;
    this.salvage -= this.cost(id);
    this.levels[id] = this.level(id) + 1;
    this.save();
    return true;
  }

  // Bank Salvage at run end: 1 per kill, win or lose.
  bankSalvage(kills) {
    this.salvage += Math.max(0, Math.floor(kills || 0));
    this.save();
  }

  // ---- effect queries: read at run start and by the systems they change.
  maxCoreBonus() { return 15 * this.level('hull'); }
  slugDamageBonus() { return 2 * this.level('rails'); }
  startPlasmaBonus() { return 50 * this.level('reserves'); }
  cometPlasmaBonus() { return 5 * this.level('comets'); }
  slotsBonus() { return this.level('slots'); }
  lanceDamageBonus() { return 20 * this.level('lance'); }
}
