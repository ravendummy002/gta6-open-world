// Synthesised sound: every effect is built from oscillators and
// filtered noise at run time. No audio files, no network requests.
// The context only starts after a user gesture (the Play click).

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.noiseBuffer = null;
    this.engineNodes = null;
    this.sirenNodes = null;
  }

  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.5;
    this.master.connect(this.ctx.destination);
    this.startEngineLoop();
    this.startSirenLoop();
    this.startAmbient();
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(muted ? 0 : 0.5, this.ctx.currentTime, 0.05);
    }
  }

  // Pause silences everything, including the ambient bed; resume
  // brings it back. Both are safe to call before the context exists.
  suspend() {
    if (this.ctx && this.ctx.state === 'running') {
      this.ctx.suspend().catch(() => {});
    }
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  getNoiseBuffer() {
    if (this.noiseBuffer) return this.noiseBuffer;
    const len = this.ctx.sampleRate;
    const buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    this.noiseBuffer = buffer;
    return buffer;
  }

  // Engine: two detuned oscillators through a low-pass filter. The
  // pitch and the filter track the car's speed.
  startEngineLoop() {
    const ctx = this.ctx;
    const oscA = ctx.createOscillator();
    oscA.type = 'sawtooth';
    oscA.frequency.value = 55;
    const oscB = ctx.createOscillator();
    oscB.type = 'square';
    oscB.frequency.value = 110;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 320;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    oscA.connect(filter);
    oscB.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    oscA.start();
    oscB.start();
    this.engineNodes = { oscA, oscB, filter, gain };
  }

  setEngine(running, speed01) {
    if (!this.ctx || !this.engineNodes) return;
    const t = this.ctx.currentTime;
    const n = this.engineNodes;
    const freq = 48 + speed01 * 150;
    n.oscA.frequency.setTargetAtTime(freq, t, 0.08);
    n.oscB.frequency.setTargetAtTime(freq * 2.02, t, 0.08);
    n.filter.frequency.setTargetAtTime(280 + speed01 * 900, t, 0.1);
    n.gain.gain.setTargetAtTime(running ? 0.045 + speed01 * 0.05 : 0, t, 0.1);
  }

  // Siren: a triangle wave wobbling between two notes on an LFO,
  // louder the closer the nearest police car is.
  startSirenLoop() {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = 840;
    const lfo = ctx.createOscillator();
    lfo.type = 'square';
    lfo.frequency.value = 0.55;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 130;
    lfo.connect(lfoGain);
    lfoGain.connect(osc.frequency);
    const gain = ctx.createGain();
    gain.gain.value = 0;
    osc.connect(gain);
    gain.connect(this.master);
    osc.start();
    lfo.start();
    this.sirenNodes = { gain };
  }

  setSiren(on, near01) {
    if (!this.ctx || !this.sirenNodes) return;
    const target = on ? 0.015 + near01 * 0.05 : 0;
    this.sirenNodes.gain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.2);
  }

  // Soft surf-and-wind bed: looped noise through a low filter, with a
  // slow swell so it breathes like waves on the beach.
  startAmbient() {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.getNoiseBuffer();
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 320;
    const gain = ctx.createGain();
    gain.gain.value = 0.016;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.09;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.008;
    lfo.connect(lfoGain);
    lfoGain.connect(gain.gain);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    src.start();
    lfo.start();
  }

  blip(freq, dur, type, vol, slideTo) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = type || 'square';
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol || 0.08, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  noiseBurst(dur, vol, filterFreq) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.getNoiseBuffer();
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(filterFreq || 1200, t);
    filter.frequency.exponentialRampToValueAtTime(120, t + dur);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol || 0.2, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  shot() {
    this.noiseBurst(0.14, 0.32, 2600);
    this.blip(180, 0.08, 'square', 0.1, 60);
  }

  distantShot() {
    this.noiseBurst(0.1, 0.1, 900);
  }

  hit() {
    this.blip(320, 0.06, 'square', 0.07, 180);
  }

  click() {
    this.blip(660, 0.07, 'square', 0.06);
  }

  pickup() {
    this.blip(880, 0.09, 'sine', 0.12);
    setTimeout(() => this.blip(1320, 0.12, 'sine', 0.12), 70);
  }

  missionDone() {
    [523, 659, 784, 1047].forEach((f, i) => {
      setTimeout(() => this.blip(f, 0.22, 'triangle', 0.14), i * 110);
    });
  }

  missionFail() {
    [392, 330, 262].forEach((f, i) => {
      setTimeout(() => this.blip(f, 0.25, 'triangle', 0.12), i * 140);
    });
  }

  busted() {
    this.blip(440, 0.4, 'sawtooth', 0.1, 110);
  }

  wasted() {
    this.blip(220, 0.7, 'sawtooth', 0.12, 55);
  }

  horn() {
    this.blip(370, 0.25, 'square', 0.06);
    this.blip(466, 0.25, 'square', 0.05);
  }

  reload() {
    this.blip(240, 0.06, 'square', 0.08);
    setTimeout(() => this.blip(340, 0.06, 'square', 0.08), 160);
  }
}
