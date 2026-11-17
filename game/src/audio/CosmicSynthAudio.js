// GRAVITAS FORGE — audio/CosmicSynthAudio.js
// One job: procedural Web Audio — deep bass pads, Doppler-shifted projectile
// whooshes, and crystalline UI feedback. No audio files, no network: every
// sound is synthesized. The context starts on the first user gesture.

export class CosmicSynthAudio {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.padNodes = null;
  }

  // Create the context lazily (browsers require a gesture first).
  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.startPad();
    } catch {
      this.ctx = null;
    }
  }

  setMuted(m) {
    this.muted = m;
    if (this.padNodes) {
      this.padNodes.gain.gain.value = m ? 0 : 0.05;
    }
  }

  // A slow deep-bass pad: two detuned low oscillators through a low-pass.
  startPad() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const gain = ctx.createGain();
    gain.gain.value = this.muted ? 0 : 0.05;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 220;
    const o1 = ctx.createOscillator();
    o1.type = 'sine';
    o1.frequency.value = 55;
    const o2 = ctx.createOscillator();
    o2.type = 'sine';
    o2.frequency.value = 55.7;
    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 0.07;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.02;
    lfo.connect(lfoGain);
    lfoGain.connect(gain.gain);
    o1.connect(filter);
    o2.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    o1.start();
    o2.start();
    lfo.start();
    this.padNodes = { gain, o1, o2, lfo };
  }

  // Doppler-shifted whoosh: a filtered noise burst sweeping down in pitch.
  whoosh() {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx;
    const dur = 0.28;
    const buffer = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 1.2;
    filter.frequency.setValueAtTime(2400, ctx.currentTime);
    filter.frequency.exponentialRampToValueAtTime(320, ctx.currentTime + dur);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.16, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    src.start();
  }

  // Crystalline UI blip: two high sine pings a fifth apart.
  blip(freq) {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx;
    const f = freq || 880;
    for (const [mult, delay] of [[1, 0], [1.5, 0.05]]) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f * mult;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.12, ctx.currentTime + delay);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + 0.18);
      o.connect(g);
      g.connect(ctx.destination);
      o.start(ctx.currentTime + delay);
      o.stop(ctx.currentTime + delay + 0.2);
    }
  }

  // Explosion: a low thump plus noise, scaled by size.
  explosion(big) {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(big ? 120 : 90, ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(28, ctx.currentTime + 0.3);
    const g = ctx.createGain();
    g.gain.setValueAtTime(big ? 0.4 : 0.22, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.32);
    o.connect(g);
    g.connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 0.35);
  }
}
