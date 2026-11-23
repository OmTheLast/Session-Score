import {test} from "node:test";
import assert from "node:assert/strict";
import {routeFor, filterTarget, delaySeconds, addEffects} from "./effects.js";
import {assets} from "./assets.mjs";

test("drums stay dry, bass is ducked only, melodic parts get the effects", () => {
  assert.deepEqual([routeFor("kick", "drums"), routeFor("hat", "drums"), routeFor("bass", "bass"),
    routeFor("piano", "keys"), routeFor("lead", "synth"), routeFor("strings", "chords")],
    ["drums", "drums", "low", "wet", "wet", "wet"]);
});

test("the filter opens with activity, rings with repeats, and the delay is a dotted eighth", () => {
  assert.equal(filterTarget({recent: 0}).cutoff, 900);
  assert.equal(filterTarget({recent: 40}).cutoff, 9000);
  assert.equal(filterTarget({repeats: 0}).q, .7);
  assert.equal(filterTarget({repeats: 6}).q, 9);
  assert.equal(delaySeconds(120), .375);
});

// A stand-in audio context that records connections and gain automation.
function fakeAudio() {
  const param = () => ({value: 0, events: [], setValueAtTime(v, t) { this.events.push(["set", v, t]); },
    linearRampToValueAtTime(v, t) { this.events.push(["ramp", v, t]); }, setTargetAtTime(v) { this.value = v; }});
  const node = kind => ({kind, to: [], gain: param(), frequency: param(), Q: param(), delayTime: param(), connect(n) { this.to.push(n); return n; }});
  const context = {sampleRate: 8000, currentTime: 0,
    createGain: () => node("gain"), createBiquadFilter: () => node("filter"), createDelay: () => node("delay"),
    createConvolver: () => node("convolver"), createBuffer: (channels, length) => ({getChannelData: () => new Float32Array(length)})};
  const master = node("master"), routed = [];
  const audio = {context, master, hit(sound) { routed.push([sound, this.master]); }};
  return {audio, master, routed};
}

test("each note reaches the right input and the engine's master is restored", () => {
  const {audio, master, routed} = fakeAudio();
  const effects = addEffects(audio, {now: () => 1000});
  audio.hit("kick", 0, 60, 1, 1, .2, "drums");
  audio.hit("bass", 0, 60, 1, 1, .2, "bass");
  audio.hit("piano", 0, 60, 1, 1, .2, "keys");
  assert.equal(audio.master, master);
  const [kick, bass, keys] = routed.map(([, input]) => input);
  assert.equal(kick.to[0], master);                 // dry, straight to master
  assert.equal(bass.to[0].to[0], master);           // through the duck only
  assert.equal(keys.to[0].kind, "filter");          // into the filter and the sends
  assert.equal(new Set([kick, bass, keys]).size, 3);
  assert.equal(effects.state().ducks, 1);
  const duck = bass.to[0];
  assert.deepEqual(duck.gain.events.map(([type, value]) => [type, value]), [["set", 1], ["ramp", .45], ["ramp", 1]]);
});

test("a silent kick does not duck, and steering follows recent actions", () => {
  let time = 0;
  const {audio} = fakeAudio();
  const effects = addEffects(audio, {now: () => time});
  audio.hit("kick", 0, 0, 1, 1, .2, "drums");
  assert.equal(effects.state().ducks, 0);
  for (let i = 0; i < 30; i++) effects.action(i < 6 ? "repeat" : "read");
  effects.steer(120);
  assert.deepEqual([effects.state().cutoff, effects.state().q, effects.state().delay], [9000, 9, .375]);
  time = 31_000;
  effects.steer(120);
  assert.deepEqual([effects.state().cutoff, effects.state().q], [900, .7]);
});

test("the dashboard and the Mac app both serve the effects module", () => {
  assert.deepEqual(assets.get("/effects.js"), ["effects.js", "text/javascript"]);
});
