// Audio for Solmar: everything is synthesised with WebAudio — no audio
// files at all. Engine hum, gunfire, sirens, horn, and a slow synth loop.
export class Audio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.engineOsc = null;
    this.engineGain = null;
    this.engineFilter = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.sirenLfo = null;
    this.musicTimer = null;
    this.musicStep = 0;
  }

  /** Create the context on a user gesture (browsers require it). */
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.55;
    this.master.connect(this.ctx.destination);
    this.startMusic();
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.55;
    return this.muted;
  }

  /** A short tone with an envelope. */
  tone(freq, dur, type = 'sine', vol = 0.2, when = 0, slideTo = null) {
    if (!this.ctx || this.muted) return;
    const t0 = this.ctx.currentTime + when;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(g).connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  /** A burst of filtered noise (gunfire, impacts). */
  noise(dur, vol = 0.3, cutoff = 1200, when = 0) {
    if (!this.ctx || this.muted) return;
    const t0 = this.ctx.currentTime + when;
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = cutoff;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    src.connect(filter).connect(g).connect(this.master);
    src.start(t0);
  }

  gunshot() {
    this.noise(0.16, 0.5, 2600);
    this.tone(160, 0.1, 'square', 0.15, 0, 50);
  }

  gunshotFar() {
    this.noise(0.14, 0.12, 700);
  }

  hit() {
    this.tone(220, 0.12, 'sawtooth', 0.12, 0, 110);
  }

  thud() {
    this.tone(70, 0.22, 'sine', 0.4, 0, 40);
    this.noise(0.1, 0.2, 300);
  }

  horn() {
    this.tone(392, 0.28, 'square', 0.08);
    this.tone(494, 0.28, 'square', 0.08);
  }

  uiClick() {
    this.tone(880, 0.07, 'sine', 0.12);
  }

  /** Cash-register blip for mission rewards. */
  cash() {
    this.tone(1319, 0.09, 'triangle', 0.16);
    this.tone(1760, 0.18, 'triangle', 0.16, 0.09);
  }

  missionStart() {
    this.tone(523, 0.16, 'triangle', 0.2);
    this.tone(659, 0.16, 'triangle', 0.2, 0.14);
    this.tone(784, 0.28, 'triangle', 0.22, 0.28);
  }

  missionPass() {
    [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.22, 'triangle', 0.22, i * 0.13));
  }

  missionFail() {
    this.tone(392, 0.25, 'triangle', 0.2);
    this.tone(311, 0.25, 'triangle', 0.2, 0.22);
    this.tone(233, 0.4, 'triangle', 0.22, 0.44);
  }

  /** Continuous engine hum; speed 0 stops it. Call every frame while driving. */
  setEngine(speed, driving) {
    if (!this.ctx) return;
    if (!driving || this.muted) {
      if (this.engineGain) this.engineGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1);
      return;
    }
    if (!this.engineOsc) {
      this.engineOsc = this.ctx.createOscillator();
      this.engineOsc.type = 'sawtooth';
      this.engineFilter = this.ctx.createBiquadFilter();
      this.engineFilter.type = 'lowpass';
      this.engineFilter.frequency.value = 420;
      this.engineGain = this.ctx.createGain();
      this.engineGain.gain.value = 0;
      this.engineOsc.connect(this.engineFilter).connect(this.engineGain).connect(this.master);
      this.engineOsc.start();
    }
    const t = this.ctx.currentTime;
    this.engineOsc.frequency.setTargetAtTime(55 + Math.abs(speed) * 3.2, t, 0.08);
    this.engineGain.gain.setTargetAtTime(0.045 + Math.min(0.05, Math.abs(speed) * 0.001), t, 0.1);
  }

  /** Two-tone siren while the player is wanted. */
  setSiren(on) {
    if (!this.ctx) return;
    if (!on) {
      if (this.sirenGain) this.sirenGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.15);
      return;
    }
    if (!this.sirenOsc) {
      this.sirenOsc = this.ctx.createOscillator();
      this.sirenOsc.type = 'triangle';
      this.sirenOsc.frequency.value = 820;
      this.sirenLfo = this.ctx.createOscillator();
      this.sirenLfo.type = 'square';
      this.sirenLfo.frequency.value = 0.9;
      const lfoGain = this.ctx.createGain();
      lfoGain.gain.value = 140;
      this.sirenLfo.connect(lfoGain).connect(this.sirenOsc.frequency);
      this.sirenGain = this.ctx.createGain();
      this.sirenGain.gain.value = 0;
      this.sirenOsc.connect(this.sirenGain).connect(this.master);
      this.sirenOsc.start();
      this.sirenLfo.start();
    }
    this.sirenGain.gain.setTargetAtTime(0.035, this.ctx.currentTime, 0.2);
  }

  /** A slow, sunny synth loop: Am pentatonic arpeggio + soft bass. */
  startMusic() {
    if (this.musicTimer || !this.ctx) return;
    const scale = [220, 261.6, 293.7, 329.6, 392, 440, 523.3];
    const bass = [110, 87.3, 98, 110];
    this.musicTimer = setInterval(() => {
      if (this.muted || !this.ctx) return;
      const step = this.musicStep++;
      if (step % 8 === 0) {
        this.tone(bass[(step / 8 | 0) % bass.length], 1.6, 'sine', 0.09);
      }
      if (step % 2 === 0) {
        const note = scale[Math.floor(Math.random() * scale.length)];
        this.tone(note, 0.5, 'triangle', 0.05);
      }
    }, 420);
  }
}
