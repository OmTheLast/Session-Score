import {BASS_MELODIES, BASS_MODES, actionInventory} from "./phrases.js";
import {ACTIONS, SOUNDS, PATTERNS, PARTS, VARIATIONS, MIXER, SessionClassifiers, preset, validateConfig} from "./model.js";
import {AudioEngine} from "./audio.js";
import {DarkTrack} from "./dark-track.js";
import {LiveSession} from "./live-session.js";

const $ = id => document.getElementById(id);
const audio = new AudioEngine();
const classifier = new SessionClassifiers();
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
const track = new DarkTrack(audio, config);
let stream = null;

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
  renderInventory();
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
const live = new LiveSession({audio, track, onState: ({state, audible, reason, audioBlocked, activeCount, uncertainCount, releasing}) => {
  $("connection-dot").classList.toggle("connected", state !== "unknown");
  $("enable-audio").hidden = !audioBlocked;
  const working = `${activeCount} Codex session${activeCount === 1 ? "" : "s"} working`;
  const descriptions = {
    working: audible ? (config().master === 0 ? working + " · master volume is zero" : working + " · bass melody + live actions") : working + " · click Enable audio",
    idle: releasing ? "All Codex sessions finished · fading out" : "All Codex sessions idle · waiting for work",
    cancelled: "Codex cancelled · sound stopped",
    unknown: reason || "Waiting for verified Codex state · silent"
  };
  $("link-state").textContent = descriptions[state] || descriptions.unknown;
  $("transport-label").textContent = descriptions[state] || descriptions.unknown;
  $("transport-detail").textContent = "All local Codex sessions · one shared bass melody" + (uncertainCount ? ` · ${uncertainCount} unverified` : "");
  $("activity-mode").textContent = state.toUpperCase();
  const visibleSession = state === "working" ? live.session : "";
  if (visualSession !== visibleSession) showVisualizer(visibleSession);
}});
let visualSession = "";
setInterval(() => live.check(), 300);
function showAction(action, session = "local") {
  if (!action) return;
  audio.volume(config().master);
  track.event(action, session);
  log(action, session.slice(0,8));
  updateParts();
  const row = document.querySelector(`tr[data-action="${action}"]`);
  row?.classList.add("triggered");
  setTimeout(() => row?.classList.remove("triggered"), 350);
}
function labelMode(value) {
  mode = value;
  $("activity-mode").textContent = value.toUpperCase();
  $("codex-link").checked = value === "live";
  $("link-state").textContent = value === "live" ? "Checking all local Codex sessions…" : "OFF · audio disconnected";
  $("connection-dot").classList.remove("connected");
  $("transport-label").textContent = value === "live" ? "Checking Codex state" : "Audio disconnected";
  $("transport-detail").textContent = "Bass melody while Codex works · real actions add layers";
}
function showVisualizer(session = "") {
  visualSession = session;
  const frame = $("turbella-view");
  const open = $("visualizer-open");
  frame.hidden = !session;
  open.hidden = !session;
  $("visualizer-empty").hidden = Boolean(session);
  if (session) {
    const path = "/api/visualizer?session=" + encodeURIComponent(session);
    frame.src = path;
    open.href = path + "&full=1";
    $("visualizer-label").textContent = "All Turbella sessions";
  } else {
    frame.removeAttribute("src");
    open.removeAttribute("href");
    $("visualizer-label").textContent = "All-session visuals";
  }
}
function stop() {
  run++;
  live.disconnect();
  $("enable-audio").hidden = true;
  stream?.close();
  stream = null;
  showVisualizer();
  classifier.reset();
  track.stop();
  audio.stop();
  if (mode === "live") $("connection-status").textContent = "Disconnected. Your settings are ready.";
  labelMode("idle");
  updateParts();
}
async function ready() {
  try {
    await audio.ready();
    audio.volume(config().master);
    audio.context.onstatechange = () => { if (live.connected) live.sync(); };
    return true;
  } catch {
    toast("Audio could not start. Check your browser’s audio permission and try again.");
    return false;
  }
}
function options(values, chosen) {
  return Object.entries(values).map(([value,label]) => {
    const option = document.createElement("option");
    option.value = value; option.textContent = label; option.selected = value === chosen;
    return option;
  });
}
function updateParts() {
  const bass = track.bassStatus();
  const chosen = BASS_MELODIES.find(p=>p.id===config().engine.bassMelody);
  $("bass-status").textContent = bass
    ? `Playing: ${bass.melody.name}` + (bass.pending ? ` · ${chosen.name} / ${BASS_MODES[config().engine.bassMode]} queued for the next four-bar phrase` : config().engine.bassMode === "cycle" ? " · rotates after four bars" : " · held melody")
    : `Ready: ${chosen.name} · ${BASS_MODES[config().engine.bassMode]} · silent until verified work`;
  const parts = track.summary();
  $("parts-status").textContent = parts.length ? parts.map(p => {
    const action = ACTIONS.find(([id]) => id === p.action)?.[1] || p.action;
    return `${p.label} · ${action} · ${p.sessions} session${p.sessions === 1 ? "" : "s"} · ${p.waiting ? "starts next bar" : `${p.barsLeft} bar${p.barsLeft === 1 ? "" : "s"} left`}`;
  }).join(" / ") : live.state === "working" ? "Bass melody active · waiting for fresh actions to add parts" : "Parts follow live activity across all Codex sessions";
}
function renderInventory() {
  $("action-inventory").replaceChildren();
  for (const item of actionInventory(config(),ACTIONS,PARTS)) {
    const row = document.createElement("tr");
    const label = document.createElement("td");
    const strong = document.createElement("strong"); strong.textContent = item.label;
    const role = document.createElement("small"); role.textContent = item.role;
    label.append(strong,role); row.append(label);
    const mode = document.createElement("td"); mode.textContent = `${VARIATIONS[item.mode]}${item.enabled ? "" : " · muted"}`; row.append(mode);
    item.variants.forEach((description,index)=>{
      const cell = document.createElement("td"); cell.textContent = description;
      cell.classList.toggle("inactive-variant", !item.enabled || index >= item.count);
      row.append(cell);
    });
    $("action-inventory").append(row);
  }
}
function renderBass() {
  $("bass-melody").replaceChildren(...options(Object.fromEntries(BASS_MELODIES.map(p=>[p.id,p.name])),config().engine.bassMelody));
  $("bass-mode").replaceChildren(...options(BASS_MODES,config().engine.bassMode));
  $("bass-inventory").replaceChildren();
  for (const melody of BASS_MELODIES) {
    const item = document.createElement("li"), title = document.createElement("strong"), description = document.createElement("span");
    title.textContent = melody.name; description.textContent = melody.description;
    item.append(title,description); $("bass-inventory").append(item);
  }
}
for (const [id,field] of [["bass-melody","bassMelody"],["bass-mode","bassMode"]]) {
  $(id).addEventListener("change",()=>{config().engine[field]=$(id).value;save();updateParts();});
}
function renderMixer() {
  $("mixer-controls").replaceChildren();
  for (const [id, title] of Object.entries({...MIXER, intensity:"Activity intensity"})) {
    const label = document.createElement("label");
    const name = document.createElement("span"); name.textContent = title;
    const input = document.createElement("input");
    const current = () => id === "intensity" ? config().engine.intensity : config().engine.mix[id];
    Object.assign(input,{type:"range",min:"0",max:"100",value:current()});
    input.setAttribute("aria-label",title);
    const output = document.createElement("output"); output.textContent = current()+"%";
    input.addEventListener("input", () => {
      const value = Number(input.value);
      if (id === "intensity") config().engine.intensity = value;
      else { config().engine.mix[id] = value; if (value === 0) audio.stopBus(id); }
      output.textContent=value+"%"; save();
    });
    label.append(name,input,output); $("mixer-controls").append(label);
  }
}
function render() {
  renderMixer(); renderBass(); renderInventory(); updateParts();
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
    if (["finish", "stopError", "failure", "permission", "denied", "think", "subagent", "notification"].includes(id)) {
      const info = document.createElement("td"); info.colSpan = 8;
      info.className = "muted";
      info.textContent = id === "finish" ? "Automatic · normal completion fades out; cancellation stops sound" : "Not reported separately by this Codex connection";
      row.append(info); $("mappings").append(row); continue;
    }
    for (const [field, choices] of [["part", PARTS], ["sound", SOUNDS], ["pattern", PATTERNS], ["variation", VARIATIONS]]) {
      const cell = document.createElement("td");
      const select = document.createElement("select");
      select.setAttribute("aria-label", label + " " + field);
      select.append(...options(choices, mapping[field]));
      select.addEventListener("change", () => {mapping[field] = select.value; save();});
      cell.append(select); row.append(cell);
    }
    const barsCell = document.createElement("td");
    const bars = document.createElement("select");
    bars.setAttribute("aria-label",label + " phrase length");
    bars.append(...options({1:"1 bar",2:"2 bars",4:"4 bars"},String(mapping.bars)));
    bars.addEventListener("change", () => { mapping.bars=Number(bars.value);save(); });
    barsCell.append(bars); row.append(barsCell);
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
    control.append(mute); row.append(control);
    $("mappings").append(row);
  }
}
document.querySelectorAll("[data-preset]").forEach(button => button.addEventListener("click", () => {
  selected = button.dataset.preset; save(); render(); audio.volume(config().master);
  track.stop(); audio.stop(); if (live.connected) live.sync();
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
$("stop").addEventListener("click", stop);
$("reset").addEventListener("click", () => {
  if (!confirm("Reset this preset’s sounds and levels to its starting settings?")) return;
  configs[selected] = preset(selected); render(); save(); audio.volume(config().master); toast("Sound settings reset.");
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
    selected = imported.preset; configs[selected] = imported;
    track.stop(); audio.stop(); if (live.connected) live.sync();
    render(); save(); audio.volume(config().master); toast("Settings imported into " + selected + ".");
  } catch(error) {toast(error.message || "Could not read that preset.");}
  finally {event.target.value = "";}
});
async function refresh() {
  const button = $("refresh"); button.disabled = true;
  try {
    const response = await fetch("/api/status");
    if (!response.ok) throw new Error("Cannot read local Codex sessions. Check that the local server is running.");
    await response.json();
    if (mode !== "live") $("connection-status").textContent = "Ready to follow all local Codex sessions. New sessions join automatically.";
  } catch(error) {
    if (mode !== "live") $("connection-status").textContent = error.message;
  } finally {button.disabled = false;}
}
$("refresh").addEventListener("click", refresh);
$("codex-link").addEventListener("change", async () => {
  if (!$("codex-link").checked) {stop(); return;}
  stop();
  const token = run;
  $("codex-link").checked = true;
  $("link-state").textContent = "Connecting…";
  // Resume browser audio directly from the user's switch gesture.
  await ready();
  if (token !== run) return;
  const session = "all";
  classifier.reset();
  labelMode("live");
  live.connect(session);
  $("connection-status").textContent = "Following all local Codex sessions. New sessions join automatically.";
  stream = new EventSource("/api/events?session=" + encodeURIComponent(session));
  stream.addEventListener("state", message => {
    if (token !== run) return;
    try {
      const snapshot = JSON.parse(message.data);
      const previous = live.state;
      $("connection-status").textContent = "Following all local Codex sessions. New sessions join automatically.";
      const accepted = live.receive(snapshot);
      if (accepted) {
        classifier.retain(live.activeSessions); track.retainSessions(live.activeSessions); updateParts();
      }
      if (accepted && previous !== snapshot.state) {
        classifier.reset();
        if (["idle", "cancelled"].includes(snapshot.state)) log("finish", snapshot.state.toUpperCase());
      }
    } catch { live.interrupted(); }
  });
  stream.addEventListener("action", message => {
    if (token !== run) return;
    try {
      const event = JSON.parse(message.data);
      if (live.action(event)) showAction(classifier.classify(event), event.session);
    } catch { toast("An unreadable event was skipped."); }
  });
  stream.onerror = () => {
    if (token !== run) return;
    classifier.reset(); live.interrupted();
    $("connection-status").textContent = "Connection interrupted. Retrying the local Codex reader…";
  };
});
$("enable-audio").addEventListener("click", async () => {
  if (await ready() && live.connected) live.sync();
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
render(); labelMode("idle"); refresh(); drawMeter();
if (!storageAvailable) { $("save-status").textContent = "Using default settings"; toast("Saved settings could not be loaded. The defaults are ready."); }
