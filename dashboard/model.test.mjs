import {test} from "node:test";
import assert from "node:assert/strict";
import {Classifier, preset, validateConfig, ACTIONS, DEMO} from "./model.js";
import {AudioEngine} from "./audio.js";

test("classifies the full demo and tracks repeats across returns", () => {
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
  for (const sound of ["sub","kick","snare","clap","hat","openhat","rim","piano","strings","lead"]) {
    const data = engine.buffer(sound).getChannelData(0);
    assert.ok(data.every(Number.isFinite));
    assert.ok(data.some(v => Math.abs(v) > .1));
    assert.ok(data.every(v => Math.abs(v) < 1.5));
    keys.add(Array.from(data.slice(100,120)).join(","));
  }
  assert.equal(keys.size, 10);
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
test("a burst of agent events changes bar layers without creating extra notes", () => {
  const baseline = new DarkScore(), busy = new DarkScore();
  busy.event("edit");
  for (let i = 0; i < 100; i++) busy.event("edit");
  assert.equal(busy.energy, 3);
  let baselineCount = 0, busyCount = 0;
  for (let step = 0; step < 16; step++) {
    baselineCount += baseline.next().length;
    busyCount += busy.next().length;
  }
  assert.equal(busyCount - baselineCount, 2);
});
test("permission pauses drums, ending waits for the bar, and a new turn resumes", () => {
  const score = new DarkScore();
  score.event("permission");
  for (let i = 0; i < 16; i++) assert.ok(score.next().every(n => n.sound === "strings"));
  score.event("command");
  assert.ok(score.next().some(n => n.sound === "kick"));
  score.event("finish");
  while (score.step % 16) score.next();
  assert.ok(score.next().some(n => n.sound === "sub"));
  assert.equal(score.state, "rest");
  assert.equal(score.next().length, 0);
  score.event("start");
  assert.ok(score.next().some(n => n.sound === "kick"));
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
