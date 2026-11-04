// A repeating bass melody in A minor. Real actions supply every other layer.
// Each tuple is [sixteenth-note onset, semitones above A1, held steps].
const BASS_PHRASE = [
  [[0, 0, 5], [6, 3, 2], [8, 7, 3], [12, 5, 2], [14, 3, 2]],
  [[0, -4, 5], [6, 0, 2], [8, 3, 3], [12, 7, 2], [14, 3, 2]],
  [[0, 5, 5], [6, 3, 2], [8, 0, 3], [12, -2, 4]],
  [[0, -5, 5], [6, -1, 2], [8, 2, 3], [12, -1, 2], [14, 0, 2]]
];
export class DarkScore {
  constructor() { this.step = 0; }
  next() {
    const position = this.step % 16;
    const bar = Math.floor(this.step++ / 16) % BASS_PHRASE.length;
    const note = BASS_PHRASE[bar].find(([onset]) => onset === position);
    return note ? [{sound: "bass", note: note[1], level: position === 0 ? 68 : 56, steps: note[2]}] : [];
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
      for (const note of this.score.next()) this.audio.hit(note.sound, note.note, note.level, this.at, 1, note.steps * subdivision - .02);
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
