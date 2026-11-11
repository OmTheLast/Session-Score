import {AudioEngine} from "../dashboard/audio.js";
import {DarkTrack} from "../dashboard/dark-track.js";
import {Classifier, preset} from "../dashboard/model.js";

const el = id => document.getElementById(id);
const audio = new AudioEngine();
const classifier = new Classifier();
let settings = preset("electronic");
const track = new DarkTrack(audio, () => settings);
let seed, interval, nextEvent, starting = false, generation = 0, lastBar;
const buttons = () => el("actions").querySelectorAll("button");

function finish(completed) {
  generation++;
  clearInterval(interval);
  interval = null;
  track.stop();
  if (completed) audio.release(.8);
  else audio.stop();
  el("play").textContent = "Play again";
  el("preset").disabled = false;
  for (const button of buttons()) button.disabled = true;
  el("mix").textContent = completed ? "Session finished" : "Silent";
  el("status").textContent = completed ? "The last session finished. The music fades out." : "Playback stopped.";
  for (const segment of el("bars").children) segment.classList.remove("active");
}

function trigger(event) {
  const action = classifier.classify({kind: "tool", status: "waiting", tool: event.tool});
  track.event(action, seed.session);
  el("status").textContent = event.label + " · added to the arrangement";
}

function tick() {
  const bar = Math.floor(Math.max(0, track.score.step - 1) / 16) + 1;
  if (bar > seed.bars) { finish(true); return; }
  while (seed.events[nextEvent]?.bar <= bar) trigger(seed.events[nextEvent++]);
  if (bar !== lastBar) {
    lastBar = bar;
    [...el("bars").children].forEach((segment, index) => {
      segment.className = index + 1 === bar ? "active" : index + 1 < bar ? "past" : "";
    });
    el("position").textContent = `Bar ${bar} of ${seed.bars} · ${settings.bpm} BPM`;
  }
  const parts = track.summary().map(p => p.label + (p.waiting ? " (queued)" : ""));
  el("mix").textContent = ["Bass melody", ...parts].join(" · ");
}

el("play").onclick = async () => {
  if (interval) { finish(false); return; }
  if (starting) return;
  starting = true;
  const token = ++generation;
  try {
    await audio.ready();
    if (token !== generation) return;
    audio.stop();
    settings = preset(el("preset").value);
    audio.volume(settings.master);
    classifier.reset();
    nextEvent = 0;
    lastBar = 0;
    track.start();
    el("preset").disabled = true;
    el("play").textContent = "Stop demo";
    el("status").textContent = "Session started · bass melody";
    for (const button of buttons()) button.disabled = false;
    interval = setInterval(tick, 90);
    tick();
  } catch {
    finish(false);
    el("status").textContent = "Audio could not start. Check your browser’s audio settings and try again.";
  } finally { starting = false; }
};
window.addEventListener("pagehide", () => finish(false));
try {
  const response = await fetch(new URL("./seed/session.json", import.meta.url));
  if (!response.ok) throw new Error();
  seed = await response.json();
  for (let i = 0; i < seed.bars; i++) el("bars").append(document.createElement("span"));
  for (const event of seed.events) {
    const button = document.createElement("button");
    button.textContent = event.label;
    button.disabled = true;
    button.onclick = () => trigger(event);
    el("actions").append(button);
  }
  el("status").textContent = "Ready to play";
  el("play").disabled = false;
} catch { el("status").textContent = "The demo could not load. Refresh to try again."; }
