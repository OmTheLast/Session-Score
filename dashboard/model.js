export const ACTIONS = [
  ["start", "Turn starts", "A new prompt arrives"],
  ["read", "Read a file", "A named read or inspect tool"],
  ["search", "Search", "A named search or browse tool"],
  ["edit", "Edit code", "Write, patch or change a file"],
  ["command", "Run a command", "Shell commands and test tools"],
  ["other", "Other tool", "Any tool we haven’t classified"],
  ["repeat", "Repeat an action", "Same tool and input, again"],
  ["return", "Tool returns", "The tool reports a normal return"],
  ["failure", "Reported failure", "An error signal from the agent"],
  ["permission", "Needs permission", "Waiting for your approval"],
  ["denied", "Permission denied", "An action was denied"],
  ["think", "Thinking event", "A reported thinking interval"],
  ["subagent", "Subagent activity", "Activity from a helper agent"],
  ["notification", "Notification", "A general agent notification"],
  ["finish", "Turn ends", "The turn stops or compacts"],
  ["stopError", "Turn ends with error", "The turn stops with an error"]
];
export const SOUNDS = {
  sub: "808 sub bass", kick: "808 kick", snare: "808 snare", clap: "808 clap",
  hat: "Closed hat", openhat: "Open hat", rim: "Rimshot",
  piano: "Soft keys", strings: "String pad", lead: "Bright synth"
};
export const PATTERNS = {
  hit: "Single hit", double: "Double hit", roll: "Four-hit roll",
  rise: "Rising phrase", fall: "Falling phrase", hold: "Sustain"
};
const rule = (sound, pattern = "hit", level = 65, note = 0, enabled = true) => ({sound, pattern, level, note, enabled});
export function preset(name) {
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
export function validateConfig(value) {
  const number = (n, min, max) => Number.isFinite(n) && n >= min && n <= max;
  if (value?.version !== 1 || !["classical", "electronic", "hyperpop"].includes(value.preset) ||
      !number(value.bpm, 60, 180) || !number(value.master, 0, 100)) throw new Error("This is not a Session Score preset file.");
  const clean = preset(value.preset);
  clean.bpm = value.bpm;
  clean.master = value.master;
  if (value.arrangement !== undefined && !["dark", "actions"].includes(value.arrangement)) throw new Error("Unknown arrangement.");
  clean.arrangement = value.arrangement ?? clean.arrangement;
  for (const [id] of ACTIONS) {
    const r = value.mappings?.[id];
    if (!r || !Object.hasOwn(SOUNDS, r.sound) || !Object.hasOwn(PATTERNS, r.pattern) ||
        !number(r.level, 0, 100) || !Number.isInteger(r.note) || r.note < -12 || r.note > 12 ||
        typeof r.enabled !== "boolean") throw new Error("The action settings in this file are incomplete or invalid.");
    clean.mappings[id] = {sound: r.sound, pattern: r.pattern, level: r.level, note: r.note, enabled: r.enabled};
  }
  return clean;
}
const FAMILIES = {
  read: ["read", "read_file", "readfile", "view_file", "get_file"],
  search: ["search", "grep", "glob", "web_search", "browse", "web.run"],
  edit: ["edit", "write", "apply_patch", "write_file", "edit_file", "multiedit"],
  command: ["bash", "shell", "exec_command", "run_command", "execute", "test"]
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
export const DEMO = [
  [0, {kind: "turn"}],
  [1, {kind: "tool", status: "waiting", tool: "read_file", sig: "demo-read"}],
  [2, {kind: "tool", status: "waiting", tool: "apply_patch", sig: "demo-edit"}],
  [3, {kind: "tool", status: "ok", tool: "apply_patch", sig: "demo-edit"}],
  [4, {kind: "tool", status: "waiting", tool: "apply_patch", sig: "demo-edit"}],
  [5, {kind: "tool", status: "waiting", tool: "exec_command", sig: "demo-command"}],
  [6, {kind: "permission", status: "waiting"}],
  [7.5, {kind: "tool", status: "waiting", tool: "exec_command", sig: "demo-next"}],
  [9, {kind: "stop"}]
];
