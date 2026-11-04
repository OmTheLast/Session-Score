import {ACTIONS, SOUNDS, PATTERNS, Classifier, DEMO, preset, validateConfig} from "./model.js";
import {AudioEngine} from "./audio.js";

const $ = id => document.getElementById(id);
const audio = new AudioEngine();
const classifier = new Classifier();
let configs = Object.fromEntries(["classical", "electronic", "hyperpop"].map(name => [name, preset(name)]));
let selected = "electronic";
let storageAvailable = true;
try {
  const saved = JSON.parse(localStorage.getItem("session-score-studio") || "null");
  if (saved) {
    const restored = Object.fromEntries(Object.keys(configs).map(name => [name, validateConfig(saved.configs[name])]));
    configs = restored;
    if (Object.hasOwn(configs, saved.selected)) selected = saved.selected;
  }
} catch { storageAvailable = false; }
const config = () => configs[selected];
let stream = null;
let timers = [];
let mode = "idle";
let run = 0;
let toastTimer;

function toast(message) {
  $("toast").textContent = message;
  $("toast").classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $("toast").classList.remove("show"), 3800);
}
function save() {
  try {
    localStorage.setItem("session-score-studio", JSON.stringify({selected, configs}));
    storageAvailable = true;
    $("save-status").textContent = "Saved on this device";
  } catch {
    storageAvailable = false;
    $("save-status").textContent = "Settings aren’t saved";
    toast("Browser storage is unavailable. Export settings to keep your changes.");
  }
}
function log(action, source) {
  const list = $("activity");
  list.querySelector(".empty-activity")?.remove();
  const item = document.createElement("li");
  const label = document.createElement("span");
  label.textContent = ACTIONS.find(([id]) => id === action)?.[1] || action;
  const stamp = document.createElement("time");
  stamp.textContent = source;
  item.append(label, stamp);
  list.prepend(item);
  while (list.children.length > 6) list.lastChild.remove();
}
function showAction(action, source = "PREVIEW") {
  if (!action) return;
  audio.volume(config().master);
  audio.trigger(config().mappings[action], config().bpm);
  log(action, source);
  const row = document.querySelector(`tr[data-action="${action}"]`);
  row?.classList.add("triggered");
  setTimeout(() => row?.classList.remove("triggered"), 350);
}
function eventReceived(event, source) {
  const action = classifier.classify(event);
  // An approval wait or stop clears pending accents before its own cue.
  if (["permission", "denied", "finish", "stopError"].includes(action)) audio.stop();
  showAction(action, source);
}
function labelMode(value) {
  mode = value;
  $("activity-mode").textContent = value.toUpperCase();
  $("demo").textContent = value === "demo" ? "■ Stop preview" : "▶ Preview session";
  $("connect").textContent = value === "live" ? "Disconnect" : "Connect live";
  $("connection-dot").classList.toggle("connected", value === "live");
  $("sessions").disabled = value === "live";
  $("transport-label").textContent = {idle: "Ready when you are", demo: "Playing your action map", live: "Following your agent"}[value];
  $("transport-detail").textContent = value === "live" ? "New events from your selected session" : "A 10-second scripted session";
}
function stop() {
  run++;
  for (const timer of timers) clearTimeout(timer);
  timers = [];
  stream?.close();
  stream = null;
  classifier.reset();
  audio.stop();
  if (mode === "live") $("connection-status").textContent = "Disconnected. Your settings are ready.";
  labelMode("idle");
}
async function ready() {
  try {
    await audio.ready();
    audio.volume(config().master);
    return true;
  } catch {
    toast("Audio could not start. Check your browser’s audio permission and try again.");
    return false;
  }
}
async function demo() {
  if (mode === "demo") { stop(); return; }
  stop();
  const token = run;
  if (!await ready() || token !== run) return;
  labelMode("demo");
  for (const [seconds, event] of DEMO) {
    timers.push(setTimeout(() => {
      if (token === run) eventReceived(event, "DEMO");
    }, seconds * 1000));
  }
  timers.push(setTimeout(() => {
    if (token === run) { labelMode("idle"); timers = []; }
  }, 11000));
}
function options(values, chosen) {
  return Object.entries(values).map(([value,label]) => {
    const option = document.createElement("option");
    option.value = value; option.textContent = label; option.selected = value === chosen;
    return option;
  });
}
function render() {
  for (const button of document.querySelectorAll("[data-preset]")) button.setAttribute("aria-pressed", String(button.dataset.preset === selected));
  $("tempo").value = config().bpm;
  $("master").value = config().master;
  $("master-value").textContent = config().master + "%";
  $("mappings").replaceChildren();
  for (const [id, label, description] of ACTIONS) {
    const mapping = config().mappings[id];
    const row = document.createElement("tr");
    row.dataset.action = id;
    row.classList.toggle("muted-row", !mapping.enabled);
    const name = document.createElement("td");
    const title = document.createElement("strong"); title.textContent = label;
    const detail = document.createElement("small"); detail.textContent = description;
    name.append(title, detail); row.append(name);
    for (const [field, choices] of [["sound", SOUNDS], ["pattern", PATTERNS]]) {
      const cell = document.createElement("td");
      const select = document.createElement("select");
      select.setAttribute("aria-label", label + " " + field);
      select.append(...options(choices, mapping[field]));
      select.addEventListener("change", () => {mapping[field] = select.value; save();});
      cell.append(select); row.append(cell);
    }
    const pitchCell = document.createElement("td");
    const pitch = document.createElement("input");
    Object.assign(pitch, {type: "number", min: "-12", max: "12", step: "1", value: mapping.note, className: "pitch"});
    pitch.setAttribute("aria-label", label + " pitch in semitones");
    pitch.addEventListener("change", () => {
      if (pitch.value === "" || !pitch.checkValidity()) {pitch.value = mapping.note; return;}
      mapping.note = Number(pitch.value); save();
    });
    pitchCell.append(pitch); row.append(pitchCell);
    const levelCell = document.createElement("td");
    const container = document.createElement("div"); container.className = "level-cell";
    const level = document.createElement("input");
    Object.assign(level, {type: "range", min: "0", max: "100", value: mapping.level});
    level.setAttribute("aria-label", label + " volume");
    const output = document.createElement("output"); output.textContent = mapping.level;
    level.addEventListener("input", () => {mapping.level = Number(level.value); output.textContent = level.value; save();});
    container.append(level,output); levelCell.append(container); row.append(levelCell);
    const control = document.createElement("td");
    const preview = document.createElement("button");
    preview.className = "row-preview"; preview.textContent = "▶";
    preview.setAttribute("aria-label", "Preview " + label);
    preview.addEventListener("click", async () => {
      if (!mapping.enabled) {toast("Unmute this action to hear its mapping."); return;}
      if (await ready()) showAction(id);
    });
    const mute = document.createElement("button");
    mute.className = "row-mute"; mute.textContent = mapping.enabled ? "ON" : "OFF";
    mute.setAttribute("aria-label", "Mute " + label);
    mute.setAttribute("aria-pressed", String(!mapping.enabled));
    mute.addEventListener("click", () => {
      mapping.enabled = !mapping.enabled;
      row.classList.toggle("muted-row", !mapping.enabled);
      mute.textContent = mapping.enabled ? "ON" : "OFF";
      mute.setAttribute("aria-pressed", String(!mapping.enabled));
      save();
    });
    control.append(preview,mute); row.append(control);
    $("mappings").append(row);
  }
}
for (const [sound,label] of Object.entries(SOUNDS)) {
  const button = document.createElement("button");
  button.className = "pad";
  button.textContent = label.replace("808 ", "");
  button.setAttribute("aria-label", "Preview sound " + label);
  const symbol = document.createElement("span"); symbol.textContent = "↗"; button.append(symbol);
  button.addEventListener("click", async () => {
    if (!await ready()) return;
    audio.trigger({sound, pattern: "hit", note: 0, level: 75, enabled: true}, config().bpm, false);
    button.classList.add("flash"); setTimeout(() => button.classList.remove("flash"), 200);
  });
  $("sound-kit").append(button);
}
document.querySelectorAll("[data-preset]").forEach(button => button.addEventListener("click", () => {
  stop(); selected = button.dataset.preset; save(); render(); audio.volume(config().master);
}));
$("tempo").addEventListener("change", () => {
  const input = $("tempo");
  if (!input.value || !input.checkValidity()) {input.value = config().bpm; return;}
  config().bpm = Number(input.value); save();
});
$("master").addEventListener("input", () => {
  config().master = Number($("master").value);
  $("master-value").textContent = config().master + "%";
  audio.volume(config().master); save();
});
$("demo").addEventListener("click", demo);
$("stop").addEventListener("click", stop);
$("reset").addEventListener("click", () => {
  if (!confirm("Reset this preset’s sounds and levels to its starting settings?")) return;
  stop(); configs[selected] = preset(selected); render(); save(); toast("Preset reset.");
});
$("export").addEventListener("click", () => {
  const url = URL.createObjectURL(new Blob([JSON.stringify(config(), null, 2)], {type: "application/json"}));
  const a = document.createElement("a"); a.href = url; a.download = `session-score-${selected}.json`; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000); toast("Preset exported.");
});
$("import").addEventListener("click", () => $("import-file").click());
$("import-file").addEventListener("change", async event => {
  const file = event.target.files[0];
  try {
    if (!file) return;
    if (file.size > 100000) throw new Error("Choose a Session Score JSON file under 100 KB.");
    const imported = validateConfig(JSON.parse(await file.text()));
    stop(); selected = imported.preset; configs[selected] = imported;
    render(); save(); toast("Settings imported into " + selected + ".");
  } catch(error) {toast(error.message || "Could not read that preset.");}
  finally {event.target.value = "";}
});
async function refresh() {
  const button = $("refresh"); button.disabled = true;
  try {
    const response = await fetch("/api/status");
    if (!response.ok) throw new Error("Start Turbella, then refresh sessions.");
    const status = await response.json();
    const current = $("sessions").value;
    $("sessions").replaceChildren(...options({"": "Choose a session"}, ""));
    for (const session of status.sessions || []) {
      const option = document.createElement("option"); option.value = session.session;
      const time = new Date(session.last).toLocaleTimeString([], {hour: "2-digit", minute: "2-digit"});
      option.textContent = `${session.agent} · ${session.session.slice(0,8)} · ${time}`;
      $("sessions").append(option);
    }
    if ([...$("sessions").options].some(o => o.value === current)) $("sessions").value = current;
    if (mode !== "live") $("connection-status").textContent = status.sessions?.length ? "Turbella is ready. Choose your session." : "Turbella is ready. Send a prompt in your agent to see it here.";
  } catch(error) {
    if (mode !== "live") $("connection-status").textContent = error.message;
  } finally {button.disabled = false;}
}
$("refresh").addEventListener("click", refresh);
$("connect").addEventListener("click", async () => {
  if (mode === "live") {stop(); return;}
  const session = $("sessions").value;
  if (!session) {toast("Choose a session first."); return;}
  stop();
  const token = run;
  if (!await ready() || token !== run) return;
  let since = Date.now();
  classifier.reset();
  labelMode("live");
  $("connection-status").textContent = "Connecting to the event stream…";
  stream = new EventSource("/api/events?session=" + encodeURIComponent(session));
  stream.onopen = () => {$("connection-status").textContent = "Connected. Waiting for new agent activity."; $("connection-dot").classList.add("connected");};
  stream.onmessage = message => {
    if (token !== run) return;
    try {
      const event = JSON.parse(message.data);
      if (event.session !== session || !Number.isFinite(event.ts) || event.ts < since) return;
      eventReceived(event, "LIVE");
    } catch {toast("An unreadable event was skipped.");}
  };
  stream.onerror = () => {
    since = Date.now();
    classifier.reset();
    audio.stop();
    $("connection-dot").classList.remove("connected");
    $("connection-status").textContent = "Connection interrupted. Retrying Turbella…";
  };
});
const canvas = $("meter"), painter = canvas.getContext("2d"), bins = new Uint8Array(128);
function drawMeter() {
  if (audio.analyser) audio.analyser.getByteFrequencyData(bins);
  painter.clearRect(0,0,canvas.width,canvas.height);
  for (let i = 0; i < 48; i++) {
    const height = Math.max(3, bins[i * 2] / 255 * 70);
    painter.fillStyle = height > 5 ? "#c6f16f" : "#394038";
    painter.fillRect(i*11, 78-height, 5, height);
  }
  requestAnimationFrame(drawMeter);
}
window.addEventListener("pagehide", stop);
render(); refresh(); drawMeter();
if (!storageAvailable) { $("save-status").textContent = "Using default settings"; toast("Saved settings could not be loaded. The defaults are ready."); }
