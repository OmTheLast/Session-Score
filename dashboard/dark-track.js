// The only repeating part is a simple A-minor bass foundation.
// Every additional sound comes from a real action and its editable mapping.
export class DarkScore {
  constructor() { this.step = 0; }
  next() {
    const position = this.step++ % 16;
    if (![0, 6, 12].includes(position)) return [];
    return [{sound: "sub", note: position === 12 ? -5 : 0, level: position === 0 ? 70 : 50}];
  }
}
export class DarkTrack {
  constructor(audio, getConfig) {
    this.audio = audio; this.getConfig = getConfig; this.timer = null; this.pending = new Map();
  }
  start() {
    if (this.timer) return;
    this.score = new DarkScore();
    this.at = this.audio.context.currentTime + .06;
    this.timer = setInterval(() => this.schedule(), 25);
    this.schedule();
  }
  stop() { clearInterval(this.timer); this.timer = null; this.pending.clear(); }
  event(action) {
    if (!this.timer || !action || ["finish", "stopError"].includes(action)) return;
    // Coalesce same-action bursts; take at most two accents each eighth note.
    this.pending.set(action, this.getConfig().mappings[action]);
  }
  schedule() {
    const now = this.audio.context.currentTime;
    if (this.at < now) { this.at = now + .03; this.pending.clear(); }
    const config = this.getConfig();
    const subdivision = 60 / config.bpm / 4;
    while (this.at < now + .12) {
      const step = this.score.step;
      for (const note of this.score.next()) this.audio.hit(note.sound, note.note, note.level, this.at);
      if (step % 2 === 0) {
        for (const [action, mapping] of [...this.pending].slice(0, 2)) {
          this.pending.delete(action);
          if (mapping) this.audio.trigger(mapping, config.bpm, true, this.at);
        }
      }
      this.at += subdivision;
    }
  }
}
