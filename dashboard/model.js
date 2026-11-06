import {BASS_MELODIES, BASS_MODES} from "./phrases.js";
export const ACTIONS = [
  ["start", "Turn starts", "A new prompt arrives"],
  ["read", "Read a file", "A named read or inspect tool"],
  ["search", "Search", "A named search or browse tool"],
  ["edit", "Edit code", "Write, patch or change a file"],
  ["command", "Run a command", "Shell commands and execution wrappers"],
  ["test", "Run tests", "An explicitly named test tool"],
  ["other", "Other tool", "Any tool we haven’t classified"],
  ["repeat", "Repeat an action", "Same tool and input, again"],
  ["return", "Tool returns", "The tool reports a normal return"],
  ["failure", "Reported failure", "An error signal from the agent"],
  ["permission", "Needs permission", "Waiting for your approval"],
  ["denied", "Permission denied", "An action was denied"],
  ["think", "Thinking event", "A reported thinking interval"],
  ["subagent", "Subagent activity", "Activity from a helper agent"],
  ["notification", "Notification", "A general agent notification"],
  ["finish", "Turn ends", "Normal completion fades out; cancellation stops audio"],
  ["stopError", "Turn ends with error", "A reported end stops all audio"]
];
export const SOUNDS = {
  bass: "Melodic bass", sub: "808 sub bass", kick: "808 kick", snare: "808 snare", clap: "808 clap",
  hat: "Closed hat", openhat: "Open hat", rim: "Rimshot",
  piano: "Soft keys", strings: "String pad", lead: "Bright synth"
};
export const PATTERNS = {
  hit: "Sparse phrase", double: "Steady phrase", roll: "Busy phrase",
  rise: "Rising phrase", fall: "Falling phrase", hold: "Held notes"
};
const rule = (sound, pattern = "hit", level = 65, note = 0, enabled = true) => ({sound, pattern, level, note, enabled});
function legacyPreset(name) {
  const mappings = Object.fromEntries(ACTIONS.map(([id]) => [id, rule("rim")]));
  Object.assign(mappings, {
    start: rule("kick"), read: rule("hat", "double", 35), search: rule("rim", "roll", 45),
    edit: rule("sub", "double", 75), command: rule("kick", "double", 70),
    other: rule("clap", "hit", 45), repeat: rule("sub", "roll", 65),
    return: rule("hat", "hit", 30, 0, false), failure: rule("lead", "double", 45, 1),
    permission: rule("strings", "hold", 50, 7), denied: rule("rim", "hit", 55),
    think: rule("strings", "hold", 30), subagent: rule("lead", "rise", 40, 12),
    notification: rule("rim", "hit", 35, 0, false), finish: rule("sub", "fall", 65),
    stopError: rule("lead", "hold", 40, 1)
  });
  if (name === "classical") {
    for (const [id] of ACTIONS) {
      mappings[id].sound = ["permission", "think", "stopError"].includes(id) ? "strings" : "piano";
    }
    mappings.edit.pattern = "rise";
    mappings.command.pattern = "double";
    mappings.read.pattern = "rise";
  }
  if (name === "hyperpop") {
    mappings.read = rule("hat", "roll", 45);
    mappings.edit = rule("sub", "roll", 80);
    mappings.search = rule("lead", "rise", 60, 12);
    mappings.command = rule("clap", "double", 65);
    mappings.repeat = rule("lead", "roll", 65, 12);
    mappings.finish = rule("lead", "fall", 55, 12);
  }
  return {version: 1, preset: name, bpm: {classical: 84, electronic: 120, hyperpop: 150}[name] ?? 120, master: 55, arrangement: name === "electronic" ? "dark" : "actions", mappings};
}
export const PARTS = {keys: "Keys melody", arpeggio: "Synth sequence", chords: "Chord bed", groove: "Drums + synth", fill: "Short fill"};
export const VARIATIONS = {steady:"Steady", subtle:"Subtle", evolving:"Evolving"};
export const MIXER = {bass: "Bass melody", keys: "Keys", synth: "Synth", chords: "Chords", drums: "Drums"};
const partFor = {start:"chords",read:"keys",search:"arpeggio",edit:"chords",command:"groove",test:"arpeggio",other:"keys",repeat:"fill",return:"keys"};
export function preset(name) {
  const config = legacyPreset(name);
  config.version = 2;
  config.engine = {bassMelody:"original", bassMode:"cycle", intensity: 65, mix: {bass: 80, keys: 85, synth: 75, chords: 70, drums: 65}};
  for (const [id] of ACTIONS) Object.assign(config.mappings[id], {part: partFor[id] || "fill", bars: id === "start" || id === "repeat" ? 1 : 2});
  Object.assign(config.mappings, {
    start: {...rule("strings", "hold", 35), part:"chords", bars:1},
    read: {...rule("piano", "double", 60, -12), part:"keys", bars:2},
    search: {...rule(name === "classical" ? "piano" : "lead", "rise", 52, -12), part:"arpeggio", bars:2},
    edit: {...rule(name === "hyperpop" ? "lead" : "strings", "hold", 55, -12), part:"chords", bars:4},
    command: {...rule("kick", "double", 65), part:"groove", bars:4},
    test: {...rule("lead", "roll", 50, -12), part:"arpeggio", bars:2},
    other: {...rule("piano", "fall", 45, -12), part:"keys", bars:2},
    repeat: {...rule("rim", "roll", 40), part:"fill", bars:1}
  });
  for (const mapping of Object.values(config.mappings)) mapping.variation = "subtle";
  return config;
}
export function validateConfig(value) {
  const number = (n, min, max) => Number.isFinite(n) && n >= min && n <= max;
  if (![1, 2].includes(value?.version) || !["classical", "electronic", "hyperpop"].includes(value.preset) ||
      !number(value.bpm, 60, 180) || !number(value.master, 0, 100)) throw new Error("This is not a Session Score preset file.");
  const clean = preset(value.preset), legacy = legacyPreset(value.preset);
  clean.bpm = value.bpm; clean.master = value.master;
  if (value.arrangement !== undefined && !["dark", "actions"].includes(value.arrangement)) throw new Error("Unknown arrangement.");
  clean.arrangement = value.arrangement ?? clean.arrangement;
  if (value.version === 2) {
    if (!number(value.engine?.intensity, 0, 100)) throw new Error("Invalid activity intensity.");
    clean.engine.intensity = value.engine.intensity;
    if (value.engine.bassMelody !== undefined && !BASS_MELODIES.some(p=>p.id===value.engine.bassMelody)) throw new Error("Unknown bass melody.");
    if (value.engine.bassMode !== undefined && !Object.hasOwn(BASS_MODES,value.engine.bassMode)) throw new Error("Unknown bass mode.");
    clean.engine.bassMelody = value.engine.bassMelody ?? "original";
    clean.engine.bassMode = value.engine.bassMode ?? "cycle";
    for (const id of Object.keys(MIXER)) {
      if (!number(value.engine?.mix?.[id], 0, 100)) throw new Error("Invalid mixer level.");
      clean.engine.mix[id] = value.engine.mix[id];
    }
  }
  for (const [id] of ACTIONS) {
    const r = value.mappings?.[id];
    if (!r && id === "test" && value.version === 1) continue;
    if (!r || !Object.hasOwn(SOUNDS, r.sound) || !Object.hasOwn(PATTERNS, r.pattern) ||
        !number(r.level, 0, 100) || !Number.isInteger(r.note) || r.note < -12 || r.note > 12 ||
        typeof r.enabled !== "boolean") throw new Error("The action settings in this file are incomplete or invalid.");
    // Upgrade untouched legacy defaults; preserve every field a listener customized.
    const next = clean.mappings[id];
    for (const field of ["sound", "pattern", "level", "note", "enabled"]) {
      if (value.version === 2 || r[field] !== legacy.mappings[id][field]) next[field] = r[field];
    }
    if (value.version === 2) {
      if (!Object.hasOwn(PARTS, r.part) || ![1,2,4].includes(r.bars)) throw new Error("Invalid musical part or phrase length.");
      next.part = r.part; next.bars = r.bars;
      if (r.variation !== undefined && !Object.hasOwn(VARIATIONS, r.variation)) throw new Error("Invalid phrase variation.");
      next.variation = r.variation ?? "subtle";
    }
  }
  return clean;
}
const FAMILIES = {
  test: ["test", "run_tests", "pytest", "vitest", "jest"],
  read: ["read", "read_file", "readfile", "view_file", "get_file"],
  search: ["search", "grep", "glob", "web_search", "browse", "web.run"],
  edit: ["edit", "write", "apply_patch", "write_file", "edit_file", "multiedit"],
  command: ["bash", "shell", "exec_command", "exec", "run_command", "execute"]
};
export class Classifier {
  reset() { this.previous = null; }
  classify(event) {
    const {kind, status = "ok"} = event;
    if (kind === "turn") { this.reset(); return "start"; }
    if (kind === "stop") { this.reset(); return status === "error" ? "stopError" : "finish"; }
    if (status === "denied") return "denied";
    if (kind === "tool_fail" || kind === "error" || (kind === "tool" && status === "error")) return "failure";
    if (kind === "permission") return status === "waiting" ? "permission" : null;
    if (["think", "subagent", "notification"].includes(kind)) return kind;
    if (kind !== "tool") return null;
    if (status !== "waiting") return status === "ok" ? "return" : null;
    const reported = String(event.tool ?? "").toLowerCase();
    const tool = reported === "web.run" ? reported : reported.split(".").at(-1);
    const identity = event.sig ? JSON.stringify([reported, event.sig]) : null;
    const repeats = identity !== null && identity === this.previous;
    this.previous = identity;
    if (repeats) return "repeat";
    return Object.entries(FAMILIES).find(([,names]) => names.includes(tool))?.[0] ?? "other";
  }
}

// Repeat detection belongs to the originating session, even when events interleave.
export class SessionClassifiers {
  constructor() { this.sessions = new Map(); }
  reset() { this.sessions.clear(); }
  retain(ids) { for (const id of this.sessions.keys()) if (!ids.has(id)) this.sessions.delete(id); }
  classify(event) {
    if (!this.sessions.has(event.session)) this.sessions.set(event.session, new Classifier());
    return this.sessions.get(event.session).classify(event);
  }
}
