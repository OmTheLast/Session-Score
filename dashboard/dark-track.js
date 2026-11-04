// A-minor, half-time 808 arrangement. Events change a bounded layer state.
export class DarkScore {
  constructor() {
    this.step = 0;
    this.state = "active";
    this.ending = false;
    this.energy = 0;
    this.search = false;
    this.repeat = false;
    this.layers = {energy: 0, search: false, repeat: false};
  }
  event(action) {
    if (["permission", "denied"].includes(action)) { this.state = "waiting"; return; }
    if (["finish", "stopError"].includes(action)) { this.ending = true; return; }
    if (["start", "read", "edit", "search", "command", "other", "repeat", "failure"].includes(action)) {
      if (this.state === "rest") this.step = 0;
      this.state = "active";
      this.ending = false;
      this.energy = Math.min(3, this.energy + 1);
      this.search ||= action === "search";
      this.repeat ||= action === "repeat";
    }
  }
  next() {
    const position = this.step % 16;
    const bar = Math.floor(this.step / 16);
    this.step++;
    const notes = [];
    const add = (sound, note, level, echo = false) => notes.push({sound, note, level, echo});
    // A, F, D and E bass roots, with a raised seventh in the final E-bar cadence.
    const root = [0, -4, -7, -5][bar % 4];
    if (position === 0) {
      if (this.ending) {
        add("piano", -12, 55, true);
        add("strings", 0, 28);
        add("sub", 0, 65);
        this.state = "rest";
        this.ending = false;
      }
      this.layers = {energy: this.energy, search: this.search, repeat: this.repeat};
      this.energy = Math.max(0, this.energy - 1);
      this.search = false;
      this.repeat = false;
    }
    if (this.state === "rest") return notes;
    if (this.state === "waiting") {
      if (position === 0) add("strings", 7, 22);
      return notes;
    }
    const melody = [
      [[0,7],[3,12],[6,10],[10,7],[14,3]],
      [[0,7],[4,3],[7,0],[10,3],[14,7]],
      [[0,3],[3,7],[6,5],[10,3],[14,0]],
      [[0,2],[4,5],[7,2],[10,0],[14,-1]]
    ][bar % 4];
    for (const [onset,pitch] of melody) {
      if (position === onset) add("piano", pitch - 12, 48, true);
    }
    if (position === 0) {
      add("strings", root, 19);
      add("strings", root + 7, 12);
    }
    if ([0, 6, 11].includes(position)) {
      add("sub", root, position === 0 ? 80 : 58);
      add("kick", 0, position === 0 ? 70 : 48);
    }
    if (position === 8) {add("clap", 0, 60); add("snare", 0, 28);}
    if (position % 2 === 0) add("hat", 0, position % 4 ? 32 : 18);
    if (this.layers.energy >= 2 && [3, 14].includes(position)) add("sub", root + 12, 47);
    if (this.layers.search && position % 2 === 1) add("hat", 3, 24);
    if (this.layers.repeat && [12, 13, 14, 15].includes(position)) add("rim", 0, 28);
    return notes;
  }
}

export class DarkTrack {
  constructor(audio, getConfig) {
    this.audio = audio;
    this.getConfig = getConfig;
    this.timer = null;
  }
  start() {
    this.stop();
    this.score = new DarkScore();
    this.at = this.audio.context.currentTime + .06;
    this.timer = setInterval(() => this.schedule(), 25);
    this.schedule();
  }
  stop() { clearInterval(this.timer); this.timer = null; }
  event(action) { this.score?.event(action); }
  schedule() {
    const now = this.audio.context.currentTime;
    // If the tab was asleep, resume from now without playing a backlog.
    if (this.at < now) this.at = now + .03;
    const subdivision = 60 / this.getConfig().bpm / 4;
    while (this.at < now + .12) {
      for (const note of this.score.next()) {
        this.audio.hit(note.sound, note.note, note.level, this.at);
        if (note.echo) this.audio.hit(note.sound, note.note, note.level * .22, this.at + subdivision * 3);
      }
      this.at += subdivision;
    }
  }
}
