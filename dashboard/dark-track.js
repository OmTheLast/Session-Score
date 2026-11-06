import {preset, PARTS} from "./model.js";

import {BASS_MELODIES} from "./phrases.js";

const DEFAULT = preset("electronic");
const CHORDS = [[0,3,7], [0,3,8], [0,5,8], [-1,2,7]]; // Shared tones keep chord changes close.
const PERCUSSION = new Set(["kick", "snare", "clap", "hat", "openhat", "rim"]);
const PATTERN_STEPS = {hit:[0,8], double:[0,6,8,12], roll:[0,2,4,6,8,10,12,14], rise:[0,4,8,12], fall:[0,4,8,12], hold:[0]};
function inKey(note, bar) {
  const scale = bar === 3 ? [0,2,3,5,7,8,11] : [0,2,3,5,7,8,10];
  for (let distance = 0; distance <= 2; distance++) {
    for (const n of [note-distance,note+distance]) if (scale.includes(((n % 12)+12)%12)) return n;
  }
  return note;
}

export class DarkScore {
  constructor() { this.step = 0; this.parts = new Map(); this.variants = new Map(); }
  selectBass(config) {
    const cycle = Math.floor(this.step / 64);
    if (this.bassCycle === cycle) return;
    const selected = config.engine.bassMelody || "original", mode = config.engine.bassMode || "cycle";
    const index = Math.max(0,BASS_MELODIES.findIndex(p=>p.id===selected));
    if (this.bassCycle === undefined || selected !== this.bassSelection || mode !== this.bassMode) this.bassIndex = index;
    else if (mode === "cycle") this.bassIndex = (this.bassIndex + cycle - this.bassCycle) % BASS_MELODIES.length;
    this.bassSelection = selected; this.bassMode = mode; this.bassCycle = cycle;
  }
  queueVariation(part, config) {
    const boundary = Math.ceil(this.step / 16) * 16;
    if (part.variationBar === boundary) return;
    const mode = config.mappings[part.action].variation || "subtle";
    const count = mode === "steady" ? 1 : mode === "evolving" ? 3 : 2;
    part.nextVariant = (part.nextVariant + 1) % count;
    part.variationBar = boundary;
    this.variants.set(part.session + ":" + part.action, part.nextVariant);
  }
  event(action, session, config = DEFAULT) {
    if (!action || ["finish", "stopError"].includes(action)) return;
    if (action === "repeat") {
      const previous = [...this.parts.values()].filter(p => p.session === session && p.action !== "repeat").sort((a,b) => b.touched-a.touched)[0];
      if (previous) { this.queueVariation(previous, config); previous.expires = Math.max(previous.expires, Math.ceil(this.step/16)*16 + config.mappings[previous.action].bars * 16); }
    }
    const mapping = config.mappings[action];
    if (!mapping?.enabled || mapping.level === 0) return;
    const key = session + ":" + action;
    const candidate = this.parts.get(key);
    const previous = candidate?.expires > this.step ? candidate : null;
    const starts = Math.ceil(this.step / 16) * 16;
    const builds = previous && this.step - previous.built >= 4;
    if (previous) this.queueVariation(previous, config);
    const count = mapping.variation === "steady" ? 1 : mapping.variation === "evolving" ? 3 : 2;
    const initialVariant = this.variants.has(key) ? (this.variants.get(key) + 1) % count : 0;
    if (!previous) this.variants.set(key, initialVariant);
    if (this.variants.size > 128) this.variants.delete(this.variants.keys().next().value);
    this.parts.set(key, {session, action, starts: previous?.starts ?? starts,
      expires: starts + mapping.bars * 16, touched:this.step,
      built: builds || !previous ? this.step : previous.built,
      energy: previous ? Math.min(3, previous.energy + (builds ? 1 : 0)) : 1,
      variant: previous?.variant ?? initialVariant, nextVariant:previous?.nextVariant ?? initialVariant,
      variationBar:previous?.variationBar, variation:previous?.variation, gain:previous?.gain || 0});
    // Bound memory even if a very large number of sessions are reported.
    if (this.parts.size > 128) this.parts.delete(this.parts.keys().next().value);
  }
  retainSessions(ids) {
    for (const [key, part] of this.parts) if (!ids.has(part.session)) this.parts.delete(key);
    for (const key of this.variants.keys()) if (!ids.has(key.slice(0,key.lastIndexOf(":")))) this.variants.delete(key);
  }
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
        if (part.starts < group.part.starts) {group.part=part;group.mapping=mapping;}
      }
    }
    // At most three melodic parts, one drum groove and one fill.
    return [...groups.values()].sort((a,b) => b.part.touched-a.part.touched).filter((g, i, all) =>
      ["groove","fill"].includes(g.mapping.part) || all.slice(0,i+1).filter(x => !["groove","fill"].includes(x.mapping.part)).length <= 3);
  }
  summary(config = DEFAULT) {
    const active = this.groups(config).map(g => ({part:g.mapping.part, label:PARTS[g.mapping.part], action:g.part.action,
      sessions:g.sessions.size, barsLeft:Math.ceil((g.part.expires-this.step)/16), energy:g.energy}));
    const queued = new Map();
    for (const part of this.parts.values()) {
      const mapping = config.mappings[part.action];
      if (part.starts <= this.step || !mapping?.enabled || mapping.level===0 || active.some(a=>a.part===mapping.part)) continue;
      if (!queued.has(mapping.part)) queued.set(mapping.part,{part:mapping.part,label:PARTS[mapping.part],action:part.action,
        contributors:new Set(),barsLeft:mapping.bars,energy:part.energy,waiting:true});
      queued.get(mapping.part).contributors.add(part.session);
    }
    return [...active,...[...queued.values()].map(({contributors,...p})=>({...p,sessions:contributors.size}))];
  }
  next(config = DEFAULT) {
    const step = this.step, position = step % 16, bar = Math.floor(step/16)%4;
    this.selectBass(config);
    const bassBar = BASS_MELODIES[this.bassIndex].bars[bar];
    const chord = CHORDS[bar], notes = [];
    for (const part of this.parts.values()) {
      if (position === 0) {
        part.variation = config.mappings[part.action].variation || "subtle";
        part.variant = part.nextVariant % (part.variation === "steady" ? 1 : part.variation === "evolving" ? 3 : 2);
      }
      if (step >= part.starts) {
        const target = Math.min(1, Math.max(0,(part.expires-step)/8));
        part.gain += Math.max(-.15, Math.min(.15, target-part.gain));
      }
    }
    const groups = this.groups(config);
    const hasMelody = groups.some(g => ["keys","arpeggio"].includes(g.mapping.part));
    const bassPitch = bassBar.filter(([onset]) => onset <= position).at(-1)[1];
    const add = (sound, note, level, steps, bus, envelope = {}) => {
      const volume = config.engine.mix[bus] / 100;
      if (volume <= 0 || level <= 0) return;
      notes.push({sound, note:PERCUSSION.has(sound) || bus === "bass" ? note : inKey(note,bar),
        level:Math.min(80,level * volume),steps,bus,...envelope});
    };
    const bass = bassBar.find(([onset]) => onset === position);
    if (bass) add("bass",bass[1],position===0 ? 68 : 56,bass[2],"bass");
    for (const {part, mapping:m, energy} of groups) {
      const dense = Math.min(3, 1 + (energy-1) * config.engine.intensity/100);
      const fade = part.gain;
      const level = m.level * fade * (0.8 + dense*.12);
      const variant = part.variant;
      const first = step === part.starts;
      let rhythm = PATTERN_STEPS[m.pattern];
      if (dense >= 2 && m.pattern === "double") rhythm = [0,4,6,8,12,14];
      // Keep downbeats; evolving phrases only move a later, even-grid accent.
      if (part.variation === "evolving" && variant && rhythm.includes(12))
        rhythm = [...new Set(rhythm.map(n => n === 12 ? (variant === 1 ? 10 : 14) : n))].sort((a,b)=>a-b);
      const index = Math.max(0,rhythm.indexOf(position));
      const sequence = m.pattern === "fall" ? [2,1,0,1] : m.pattern === "rise" ? [0,1,2,1] : [0,2,1,2];
      const closest = [...chord].sort((a,b) => Math.abs(a-bassPitch)-Math.abs(b-bassPitch))[0];
      const pitch = (m.part === "keys" ? (variant && position >= 8 ? chord[(sequence[index%4]+variant)%3] : bassPitch) : variant ? chord[(sequence[index%4]+variant)%3] : closest) + m.note;
      if (m.part === "keys" || m.part === "arpeggio") {
        const arp = m.part === "arpeggio";
        if (rhythm.includes(position)) add(m.sound,pitch,level, m.pattern==="hold" ? 7.5 : arp ? 2.7 : 4,arp ? "synth":"keys");
      } else if (m.part === "chords") {
        if (m.pattern === "hold" ? position===0 : rhythm.includes(position)) {
          const chordLevel = m.level * (0.8+dense*.12) * .45;
          // Omit one inner tone for a related, lighter voicing; keep the same register.
          const voicing = variant === 1 ? [chord[0],chord[2]] : variant === 2 ? [chord[0],chord[1]] : chord;
          for (const n of PERCUSSION.has(m.sound) ? [chord[0]] : voicing) add(m.sound,n+m.note,chordLevel,m.pattern==="hold" ? 15.8 : 3.5,"chords",
            {attackSteps:first ? 4 : 1, releaseSteps:part.expires-step<=16 ? (m.pattern==="hold" ? 8 : 1) : 2});
        }
      } else if (m.part === "groove") {
        const kicks = m.pattern === "hit" ? [0,8] : m.pattern === "hold" ? [0] : variant === 1 ? [0,8,12] : variant === 2 ? [0,4,8,14] : [0,6,8];
        if (kicks.includes(position) || (dense >= 2 || m.pattern === "roll") && position===14) add(m.sound,m.note,level,1.8,"drums");
        if (position===8) add("snare",0,level*.65,1.8,"drums");
        if (position % (dense>=2 || m.pattern==="roll" ? 2:4)===0) add("hat",0,level*(variant && position===4 ? .24 : .36),1,"drums");
        // Generic command wrappers still develop a musical phrase, not only percussion.
        if (!hasMelody && [8,12].includes(position)) add("lead",bassPitch-12,level*.55,3.5,"synth");
      } else if (m.part === "fill" && ((variant === 2 ? [8,12,14] : [12,14]).includes(position))) {
        add(m.sound,pitch,level*(variant === 1 && position === 12 ? .55 : 1),1,"drums");
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
    this.bpm = this.getConfig().bpm;
    this.timer = setInterval(() => this.schedule(), 25);
    this.schedule();
  }
  stop() { clearInterval(this.timer); this.timer = null; this.score = null; }
  event(action, session = "local") { if (this.timer) this.score.event(action, session, this.getConfig()); }
  retainSessions(ids) { this.score?.retainSessions(ids); }
  summary() { return this.score?.summary(this.getConfig()) || []; }
  bassStatus() {
    if (!this.score || this.score.bassIndex === undefined) return null;
    const settings = this.getConfig().engine;
    return {melody:BASS_MELODIES[this.score.bassIndex],
      pending:settings.bassMelody !== this.score.bassSelection || settings.bassMode !== this.score.bassMode};
  }
  schedule() {
    if (!this.score) return;
    const now = this.audio.context.currentTime;
    const config = this.getConfig();
    this.bpm ??= config.bpm;
    let subdivision = 60 / this.bpm / 4;
    if (this.at < now) {
      const missed = now-this.at;
      const skipped = Math.ceil((now + .005 - this.at)/subdivision);
      this.score.step += skipped;
      this.at += skipped * subdivision;
      if (missed > .5) { this.score.parts.clear(); this.audio.stop?.(); }
    }
    while (this.at < now + .12) {
      // Tempo edits take effect on a bar line, without moving scheduled notes.
      if (this.score.step % 16 === 0) this.bpm = config.bpm;
      subdivision = 60 / this.bpm / 4;
      for (const note of this.score.next(config)) {
        this.audio.hit(note.sound,note.note,note.level,this.at,1,Math.max(.04,note.steps*subdivision-.02),note.bus, {attack:note.attackSteps === undefined ? undefined : note.attackSteps*subdivision, release:note.releaseSteps === undefined ? undefined : note.releaseSteps*subdivision});
      }
      this.at += subdivision;
    }
  }
}
