export class AudioEngine {
  constructor() { this.sources = new Set(); this.buffers = new Map(); }
  async ready() {
    if (!this.context) {
      this.context = new AudioContext();
      this.master = this.context.createGain();
      this.master.gain.value = 0.42;
      this.compressor = this.context.createDynamicsCompressor();
      this.compressor.threshold.value = -14;
      this.compressor.ratio.value = 8;
      this.analyser = this.context.createAnalyser();
      this.analyser.fftSize = 256;
      this.master.connect(this.compressor).connect(this.analyser).connect(this.context.destination);
    }
    await this.context.resume();
  }
  volume(value) {
    if (this.context) this.master.gain.setTargetAtTime(value / 100 * 0.75, this.context.currentTime, 0.015);
  }
  stop() {
    for (const source of this.sources) {
      try { source.stop(); } catch {}
    }
    this.sources.clear();
  }
  buffer(sound, semitones = 0) {
    const key = sound + semitones;
    if (this.buffers.has(key)) return this.buffers.get(key);
    const rate = this.context.sampleRate;
    const duration = {sub: 1.3, kick: .55, snare: .28, clap: .27, hat: .09, openhat: .42, rim: .12, piano: 1.2, strings: 1.8, lead: .65}[sound];
    const buffer = this.context.createBuffer(1, Math.ceil(rate * duration), rate);
    const data = buffer.getChannelData(0);
    const base = 55 * 2 ** (semitones / 12);
    let phase = 0, lastNoise = 0, seed = 813;
    for (let i = 0; i < data.length; i++) {
      const t = i / rate;
      seed = (1664525 * seed + 1013904223) >>> 0;
      const noise = seed / 4294967296 * 2 - 1;
      const high = (noise - lastNoise) * .5;
      lastNoise = noise;
      const fade = Math.min(1, (duration - t) / .04);
      const attack = Math.min(1, t / .004);
      let value = 0;
      if (sound === "sub" || sound === "kick") {
        const start = sound === "kick" ? 100 : 27;
        phase += 2 * Math.PI * (base + start * Math.exp(-t * 40)) / rate;
        const tone = Math.sin(phase) + (sound === "sub" ? .14 * Math.sin(2 * phase) : 0);
        value = Math.tanh(tone * 1.4) * Math.exp(-t * (sound === "sub" ? 3.3 : 11));
      } else if (sound === "snare") {
        value = (noise * .7 + Math.sin(2 * Math.PI * 185 * t) * .3) * Math.exp(-t * 22);
      } else if (sound === "clap") {
        const burst = (t % .012) < .007 && t < .04 ? 1 : .35 * Math.exp(-Math.max(0, t - .04) * 25);
        value = high * burst * .9;
      } else if (sound === "hat" || sound === "openhat") {
        value = high * Math.exp(-t * (sound === "hat" ? 48 : 12)) * .65;
      } else if (sound === "rim") {
        value = (Math.sin(t * 2 * Math.PI * 830) + .4 * Math.sin(t * 2 * Math.PI * 1260)) * Math.exp(-t * 65) * .6;
      } else {
        const freq = base * (sound === "strings" ? 4 : 8);
        const p = 2 * Math.PI * freq * t;
        if (sound === "piano") {
          value = (Math.sin(p + Math.sin(2 * p) * Math.exp(-t * 7)) + .2 * Math.sin(3 * p) * Math.exp(-t * 10)) * Math.exp(-t * 4) * .65;
        } else if (sound === "strings") {
          value = (Math.sin(p) + .3 * Math.sin(2 * p) + .15 * Math.sin(3.003 * p)) * (1 - Math.exp(-t * 7)) * Math.exp(-t * 1.8) * .55;
        } else {
          value = (Math.sin(p) + .4 * Math.sin(2 * p) + .2 * Math.sin(p * 1.004)) * Math.exp(-t * 6) * .55;
        }
      }
      data[i] = value * attack * fade;
    }
    this.buffers.set(key, buffer);
    return buffer;
  }
  trigger(mapping, bpm, quantize = true) {
    if (!this.context || !mapping.enabled || mapping.level === 0) return;
    const beat = 60 / bpm;
    const step = beat / 2;
    const now = this.context.currentTime + .015;
    const start = quantize ? Math.ceil(now / step) * step : now;
    const phrases = {
      hit: [[0, 0]], double: [[0, 0], [.5, 0]], roll: [[0, 0], [.25, 0], [.5, 0], [.75, 0]],
      rise: [[0, 0], [.5, 3], [1, 7]], fall: [[0, 7], [.5, 3], [1, 0]], hold: [[0, 0]]
    };
    for (const [offset, pitch] of phrases[mapping.pattern]) {
      this.hit(mapping.sound, mapping.note + pitch, mapping.level, start + offset * beat,
        mapping.pattern === "hold" ? .65 : 1);
    }
  }

  hit(sound, note, level, when, speed = 1) {
    if (!this.context || this.sources.size >= 64 || level <= 0) return;
    const source = this.context.createBufferSource();
    const percussion = ["snare", "clap", "hat", "openhat", "rim"].includes(sound);
    source.buffer = this.buffer(sound, percussion ? 0 : note);
    source.playbackRate.value = (percussion ? 2 ** (note / 12) : 1) * speed;
    const gain = this.context.createGain();
    gain.gain.value = level / 100 * .65;
    source.connect(gain).connect(this.master);
    this.sources.add(source);
    source.onended = () => {this.sources.delete(source); source.disconnect(); gain.disconnect();};
    source.start(when);
  }
}
