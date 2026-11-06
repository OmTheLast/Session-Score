import {test} from "node:test";
import assert from "node:assert/strict";
import {Classifier, SessionClassifiers, preset, validateConfig, ACTIONS} from "./model.js";
import {AudioEngine} from "./audio.js";

const DEMO = [
  [0,{kind:"turn"}], [1,{kind:"tool",status:"waiting",tool:"read_file",sig:"read"}],
  [2,{kind:"tool",status:"waiting",tool:"apply_patch",sig:"edit"}], [3,{kind:"tool",status:"ok"}],
  [4,{kind:"tool",status:"waiting",tool:"apply_patch",sig:"edit"}], [5,{kind:"tool",status:"waiting",tool:"exec_command",sig:"cmd"}],
  [6,{kind:"permission",status:"waiting"}], [7,{kind:"tool",status:"waiting",tool:"exec_command",sig:"next"}], [9,{kind:"stop"}]
];
test("classifies a fixture sequence and tracks repeats across returns", () => {
  const classifier = new Classifier();
  assert.deepEqual(DEMO.map(([, event]) => classifier.classify(event)), [
    "start", "read", "edit", "return", "repeat", "command", "permission", "command", "finish"
  ]);
  assert.equal(classifier.classify({kind: "tool", status: "waiting", tool: "exec_command", sig: "demo-next"}), "command");
});
test("unknown tools, absent hashes and error signals stay distinct", () => {
  const classifier = new Classifier();
  const event = {kind: "tool", status: "waiting", tool: "mystery"};
  assert.equal(classifier.classify(event), "other");
  assert.equal(classifier.classify(event), "other");
  assert.equal(classifier.classify({...event, status: "ok"}), "return");
  assert.equal(classifier.classify({...event, status: "error"}), "failure");
  assert.equal(classifier.classify({...event, status: "denied"}), "denied");
  assert.equal(classifier.classify({kind: "stop", status: "error"}), "stopError");
});
test("import accepts complete presets and rejects corrupt or out-of-range settings", () => {
  for (const name of ["classical", "electronic", "hyperpop"]) {
    const p = preset(name);
    assert.deepEqual(validateConfig(JSON.parse(JSON.stringify(p))), p);
    assert.equal(Object.keys(p.mappings).length, ACTIONS.length);
  }
  const corrupt = preset("electronic");
  corrupt.mappings.edit.level = 1000;
  assert.throws(() => validateConfig(corrupt));
  delete corrupt.mappings.edit;
  assert.throws(() => validateConfig(corrupt));
  assert.throws(() => validateConfig({version: 99}));
  const a = preset("electronic"), b = preset("electronic");
  a.mappings.edit.sound = "lead";
  assert.equal(b.mappings.edit.sound, "sub");
});
test("all generated sound buffers are finite, non-silent and have distinct audio", () => {
  const engine = new AudioEngine();
  engine.context = {
    sampleRate: 44100,
    createBuffer(channels, length) {
      const data = new Float32Array(length);
      return {getChannelData: () => data};
    }
  };
  const keys = new Set();
  for (const sound of ["bass","sub","kick","snare","clap","hat","openhat","rim","piano","strings","lead"]) {
    const data = engine.buffer(sound).getChannelData(0);
    assert.ok(data.every(Number.isFinite));
    assert.ok(data.some(v => Math.abs(v) > .1));
    assert.ok(data.every(v => Math.abs(v) < 1.5));
    keys.add(Array.from(data.slice(100,120)).join(","));
  }
  assert.equal(keys.size, 11);
});
test("mute, volume, timing and pitch reach the audio scheduler", () => {
  const engine = new AudioEngine();
  const scheduled = [];
  engine.context = {
    currentTime: .1,
    createBufferSource() {
      const source = {
        playbackRate: {value: 1}, connect(target) { return target; },
        start(at) {scheduled.push({at, rate: this.playbackRate.value});},
        disconnect() {}
      };
      return source;
    },
    createGain() { return {gain: {value: 1}, connect() {}, disconnect() {}}; }
  };
  engine.buffer = () => ({});
  engine.master = {};
  const mapping = {sound: "hat", pattern: "double", level: 60, note: 12, enabled: true};
  engine.trigger({...mapping, enabled: false},120);
  engine.trigger({...mapping, level: 0},120);
  assert.equal(scheduled.length,0);
  engine.trigger(mapping,120);
  assert.deepEqual(scheduled,[{at:.25,rate:2},{at:.5,rate:2}]);
});
test("recognizes namespaced tools while keeping their repeat identities separate", () => {
  const classifier = new Classifier();
  const event = {kind: "tool", status: "waiting", tool: "functions.apply_patch", sig: "same"};
  assert.equal(classifier.classify(event), "edit");
  assert.equal(classifier.classify({...event, tool: "other.apply_patch"}), "edit");
  assert.equal(classifier.classify({...event, tool: "web.run"}), "search");
});

import {DarkScore, DarkTrack} from "./dark-track.js";
test("the foundation is bass only and live event bursts are bounded", () => {
  const score = new DarkScore();
  const phrase = Array.from({length: 64}, () => score.next());
  const notes = phrase.flat();
  assert.ok(notes.every(n => n.sound === "bass" && n.steps > 0));
  assert.ok(new Set(notes.map(n => n.note)).size >= 5);
  assert.ok(notes.some(n => n.steps >= 4));
  assert.deepEqual(Array.from({length: 64}, () => score.next()), phrase);
  const calls = [], accents = [];
  const audio = {context: {currentTime: 1}, hit: (...args) => calls.push(args), trigger: (...args) => accents.push(args)};
  const cfg = preset("electronic");
  const track = new DarkTrack(audio, () => cfg);
  track.start();
  try {
    for (let i = 0; i < 100; i++) track.event("edit");
    track.event("search"); track.event("command");
    assert.equal(track.pending.size, 3);
    audio.context.currentTime = 1.1; track.schedule();
    audio.context.currentTime = 1.2; track.schedule();
    assert.equal(accents.length, 2);
    assert.deepEqual(accents[0][0], cfg.mappings.edit);
    track.stop();
    assert.equal(track.pending.size, 0);
  } finally { track.stop(); }
});
test("clock scheduling uses musical time and drops a delayed-tab backlog", () => {
  const calls = [];
  const audio = {context: {currentTime: 1}, hit: (...args) => calls.push(args)};
  const track = new DarkTrack(audio, () => ({bpm: 120}));
  track.score = new DarkScore();
  track.at = .1;
  track.schedule();
  assert.ok(calls.length > 0 && calls.length < 15);
  assert.ok(calls.every(c => c[3] >= 1));
  assert.ok(track.at > 1.12);
  const count = calls.length;
  track.schedule();
  assert.equal(calls.length, count);
});
test("older saved presets acquire an arrangement and new files retain it", () => {
  const p = preset("electronic");
  delete p.arrangement;
  assert.equal(validateConfig(p).arrangement, "dark");
  p.arrangement = "actions";
  assert.equal(validateConfig(p).arrangement, "actions");
});

test("interleaved sessions retain independent repeat histories", () => {
  const classifier = new SessionClassifiers();
  const action = {kind:"tool",status:"waiting",tool:"exec_command",sig:"same"};
  assert.equal(classifier.classify({...action,session:"A"}),"command");
  assert.equal(classifier.classify({...action,session:"B"}),"command");
  assert.equal(classifier.classify({...action,session:"A"}),"repeat");
  assert.equal(classifier.classify({...action,session:"B"}),"repeat");
  classifier.retain(new Set(["B"]));
  assert.equal(classifier.classify({...action,session:"A"}),"command");
});
