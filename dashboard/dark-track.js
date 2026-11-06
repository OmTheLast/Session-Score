import {preset, PARTS} from "./model.js";

// A repeating bass melody in A minor. Real actions supply every other layer.
// Each tuple is [sixteenth-note onset, semitones above A1, held steps].
const BASS_PHRASE = [
  [[0, 0, 5], [6, 3, 2], [8, 7, 3], [12, 5, 2], [14, 3, 2]],
  [[0, -4, 5], [6, 0, 2], [8, 3, 3], [12, 7, 2], [14, 3, 2]],
  [[0, 5, 5], [6, 3, 2], [8, 0, 3], [12, -2, 4]],
  [[0, -5, 5], [6, -1, 2], [8, 2, 3], [12, -1, 2], [14, 0, 2]]
];
const DEFAULT = preset("electronic");
const CHORDS = [[0,3,7], [-4,0,3], [-7,-4,0], [-5,-1,2]];
const PERCUSSION = new Set(["kick", "snare", "clap", "hat", "openhat", "rim"]);
const PATTERN_STEPS = {hit:[0,8], double:[0,6,10,14], roll:[0,2,4,6,8,10,12,14], rise:[0,4,8,12], fall:[0,4,8,12], hold:[0]};
function inKey(note, bar) {
  const scale = bar === 3 ? [0,2,3,5,7,8,11] : [0,2,3,5,7,8,10];
  for (let distance = 0; distance <= 2; distance++) {
    for (const n of [note-distance,note+distance]) if (scale.includes(((n % 12)+12)%12)) return n;
  }
  return note;
}

export class DarkScore {
  constructor() { this.step = 0; this.parts = new Map(); }
  event(action, session, config = DEFAULT) {
    if (!action || ["finish", "stopError"].includes(action)) return;
    if (action === "repeat") {
      const previous = [...this.parts.values()].filter(p => p.session === session && p.action !== "repeat").sort((a,b) => b.touched-a.touched)[0];
      if (previous) { previous.variant = (previous.variant + 1) % 3; previous.expires = Math.max(previous.expires, this.step + config.mappings[previous.action].bars * 16); }
    }
    const mapping = config.mappings[action];
    if (!mapping?.enabled || mapping.level === 0) return;
    const key = session + ":" + action;
    const previous = this.parts.get(key);
    const starts = Math.ceil(this.step / 2) * 2;
    const builds = previous && this.step - previous.built >= 4;
    this.parts.set(key, {session, action, starts: previous?.starts ?? starts,
      expires: starts + mapping.bars * 16, touched:this.step,
      built: builds || !previous ? this.step : previous.built,
      energy: previous ? Math.min(3, previous.energy + (builds ? 1 : 0)) : 1,
      variant: previous?.variant || 0});
    // Bound memory even if a very large number of sessions are reported.
    if (this.parts.size > 128) this.parts.delete(this.parts.keys().next().value);
  }
  retainSessions(ids) { for (const [key, part] of this.parts) if (!ids.has(part.session)) this.parts.delete(key); }
  groups(config = DEFAULT) {
    const groups = new Map();
    for (const [key, part] of this.parts) {
      const mapping = config.mappings[part.action];
      if (this.step >= part.expires || !mapping?.enabled || mapping.level === 0) { this.parts.delete(key); continue; }
      if (this.step < part.starts) continue;
      const group = groups.get(mapping.part);
      if (!group) groups.set(mapping.part, {part, mapping, sessions:new Set([part.session]), energy:part.energy});
      else {
        group.sessions.add(part.session); group.energy = Math.max(group.energy,part.energy);
        if (part.touched >= group.part.touched) {group.part=part;group.mapping=mapping;}
      }
    }
    // At most three melodic parts, one drum groove and one fill.
    return [...groups.values()].sort((a,b) => b.part.touched-a.part.touched).filter((g, i, all) =>
      ["groove","fill"].includes(g.mapping.part) || all.slice(0,i+1).filter(x => !["groove","fill"].includes(x.mapping.part)).length <= 3);
  }
  summary(config = DEFAULT) {
    return this.groups(config).map(g => ({part:g.mapping.part, label:PARTS[g.mapping.part], action:g.part.action,
      sessions:g.sessions.size, barsLeft:Math.ceil((g.part.expires-this.step)/16), energy:g.energy}));
  }
  next(config = DEFAULT) {
    const step = this.step, position = step % 16, bar = Math.floor(step/16)%4;
    const chord = CHORDS[bar], notes = [];
    const add = (sound, note, level, steps, bus) => {
      const volume = config.engine.mix[bus] / 100;
      if (volume <= 0 || level <= 0) return;
      notes.push({sound, note:PERCUSSION.has(sound) || bus === "bass" ? note : inKey(note,bar),
        level:Math.min(80,level * volume),steps,bus});
    };
    const bass = BASS_PHRASE[bar].find(([onset]) => onset === position);
    if (bass) add("bass",bass[1],position===0 ? 68 : 56,bass[2],"bass");
    for (const {part, mapping:m, energy} of this.groups(config)) {
      const dense = Math.min(3, 1 + (energy-1) * config.engine.intensity/100);
      const fade = Math.min(1,(part.expires-step)/8);
      const level = m.level * fade * (0.8 + dense*.12);
      const variant = (part.variant + Math.floor(step/16))%3;
      const first = step === part.starts;
      let rhythm = PATTERN_STEPS[m.pattern];
      if (dense >= 2 && m.pattern === "double") rhythm = [0,3,6,8,10,14];
      const index = Math.max(0,rhythm.indexOf(position));
      const sequence = m.pattern === "fall" ? [2,1,0,1] : m.pattern === "rise" ? [0,1,2,1] : [0,2,1,2];
      const pitch = chord[(sequence[index%4]+variant)%3] + m.note;
      if (m.part === "keys" || m.part === "arpeggio") {
        const arp = m.part === "arpeggio";
        if (first || rhythm.includes(position)) add(m.sound,pitch+(arp && index%4===3 ? 12 : 0),level, m.pattern==="hold" ? 12 : arp ? 1.7 : 3.5,arp ? "synth":"keys");
      } else if (m.part === "chords") {
        if (first || (m.pattern === "hold" ? position===0 || position===8 : rhythm.includes(position))) {
          for (const n of PERCUSSION.has(m.sound) ? [chord[0]] : chord) add(m.sound,n+m.note,level*.52,m.pattern==="hold" ? 7.5 : 3.5,"chords");
        }
      } else if (m.part === "groove") {
        const kicks = m.pattern === "hit" ? [0,8] : m.pattern === "hold" ? [0] : [0,6,10];
        if (first || kicks.includes(position) || (dense >= 2 || m.pattern === "roll") && position===14) add(m.sound,m.note,level,1.8,"drums");
        if (position===8) add("snare",0,level*.65,1.8,"drums");
        if (position % (dense>=2 || m.pattern==="roll" ? 2:4)===0) add("hat",0,level*.36,1,"drums");
        // Generic command wrappers still develop a musical phrase, not only percussion.
        if ([3,7,11,15].includes(position)) add("lead",chord[(sequence[Math.floor(position/4)%4]+variant)%3]-12,level*.7,2,"synth");
      } else if (m.part === "fill" && (first || [10,12,14,15].includes(position))) {
        add(m.sound,pitch,level,1,"drums");
      }
    }
    this.step++;
    return notes.slice(0,12);
  }
}
export class DarkTrack {
  constructor(audio, getConfig) {
    this.audio = audio; this.getConfig = getConfig; this.timer = null;
  }
  start() {
    if (this.timer) return;
    this.score = new DarkScore();
    this.at = this.audio.context.currentTime + .06;
    this.timer = setInterval(() => this.schedule(), 25);
    this.schedule();
  }
  stop() { clearInterval(this.timer); this.timer = null; this.score = null; }
  event(action, session = "local") { if (this.timer) this.score.event(action, session, this.getConfig()); }
  retainSessions(ids) { this.score?.retainSessions(ids); }
  summary() { return this.score?.summary(this.getConfig()) || []; }
  schedule() {
    if (!this.score) return;
    const now = this.audio.context.currentTime;
    if (this.at < now) {
      const missed = now-this.at;
      if (missed > .5) { this.score.step += Math.ceil(missed/(60/this.getConfig().bpm/4)); this.score.parts.clear(); }
      this.at = now + .03;
    }
    const config = this.getConfig(), subdivision = 60 / config.bpm / 4;
    while (this.at < now + .12) {
      for (const note of this.score.next(config)) {
        this.audio.hit(note.sound,note.note,note.level,this.at,1,Math.max(.04,note.steps*subdivision-.02),note.bus);
      }
      this.at += subdivision;
    }
  }
}
