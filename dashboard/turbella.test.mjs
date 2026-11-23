import {test} from "node:test";
import assert from "node:assert/strict";
import {createServer} from "node:http";
import {spawn} from "node:child_process";
import {TurbellaState, STALE_MS} from "./turbella-feed.mjs";
import {Classifier} from "./model.js";

const at = (ms, over = {}) => ({session: "s1", agent: "claude", ts: ms, ...over});

test("a turn starts work, a stop ends it, and a stale open turn becomes uncertain", () => {
  let now = 1_000_000;
  const state = new TurbellaState({now: () => now});
  assert.equal(state.snapshot().state, "idle");
  state.consume(at(now, {kind: "turn"}));
  assert.deepEqual(state.snapshot().activeSessions, ["s1"]);
  state.consume(at(now, {kind: "stop"}));
  const ended = state.snapshot();
  assert.equal(ended.state, "idle");
  assert.equal(ended.endReason, "completed");
  state.consume(at(now, {kind: "turn"}));
  now += STALE_MS + 1;
  assert.equal(state.snapshot().state, "unknown");
});

test("a cancelled stop reports cancellation, and one session ending keeps another's music going", () => {
  const state = new TurbellaState({now: () => 5000});
  state.consume(at(5000, {kind: "turn"}));
  state.consume(at(5000, {kind: "turn", session: "s2", agent: "codex"}));
  state.consume(at(5000, {kind: "stop", status: "error"}));
  assert.equal(state.snapshot().state, "working");
  assert.deepEqual(state.snapshot().activeSessions, ["s2"]);
  state.consume(at(5000, {kind: "stop", session: "s2"}));
  assert.equal(state.snapshot().endReason, "completed");
});

test("fresh work from a session first seen mid-turn counts as working; old backlog does not", () => {
  const state = new TurbellaState({now: () => 1_000_000});
  state.consume(at(1_000_000 - 500, {kind: "tool", status: "waiting", tool: "Bash"}));
  assert.equal(state.snapshot().state, "working");
  const old = new TurbellaState({now: () => 1_000_000});
  old.consume(at(1_000_000 - STALE_MS - 10, {kind: "tool", status: "waiting", tool: "Bash"}));
  assert.equal(old.snapshot().state, "idle");
});

test("only event metadata is kept; unknown fields never pass through", () => {
  const state = new TurbellaState({now: () => 10});
  const ev = state.consume({...at(10, {kind: "tool", status: "waiting", tool: "Read", sig: "sha256:" + "a".repeat(64)}), prompt: "SECRET", output: "SECRET"});
  assert.equal(JSON.stringify(ev).includes("SECRET"), false);
  assert.equal(ev.tool, "Read");
});

test("Claude Code tool names land in the same action families as Codex names", () => {
  const classify = tool => new Classifier().classify({kind: "tool", status: "waiting", tool});
  assert.deepEqual(["Read", "Grep", "Edit", "Write", "Bash"].map(classify), ["read", "search", "edit", "edit", "command"]);
  assert.equal(new Classifier().classify({kind: "tool_fail", status: "error"}), "failure");
});

test("the server plays Turbella events as the same state and action messages", async () => {
  const sent = [];
  const fake = createServer((req, res) => {
    if (req.url === "/status") { res.writeHead(200, {"Content-Type": "application/json"}); res.end(JSON.stringify({schema: 1, sessions: [{session: "s1", agent: "claude", last: Date.now()}]})); return; }
    res.writeHead(200, {"Content-Type": "text/event-stream"});
    res.write(`id: 1\ndata: ${JSON.stringify({kind: "turn", session: "s1", agent: "claude", ts: Date.now() - 500})}\n\n`);
    setTimeout(() => res.write(`id: 2\ndata: ${JSON.stringify({kind: "tool", status: "waiting", tool: "Read", session: "s1", agent: "claude", ts: Date.now(), prompt: "SECRET"})}\n\n`), 700);
    sent.push(res);
  });
  await new Promise(done => fake.listen(0, "127.0.0.1", done));
  const controller = new AbortController();
  const child = spawn(process.execPath, ["dashboard/server.mjs"], {env: {...process.env, SESSION_SCORE_SOURCE: "turbella", TURBELLA_PORT: String(fake.address().port), PORT: "0"}, stdio: ["ignore", "pipe", "pipe"]});
  try {
    const url = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Server startup timed out")), 3000);
      child.stdout.on("data", chunk => { const m = String(chunk).match(/http:\/\/127\.0\.0\.1:\d+/); if (m) { clearTimeout(timer); resolve(m[0]); } });
      child.on("error", reject);
    });
    const status = await (await fetch(url + "/api/status")).json();
    assert.equal(status.source, "turbella");
    assert.equal(status.sessions[0].agent, "claude");
    const feed = await fetch(url + "/api/events?session=all", {signal: controller.signal});
    const reader = feed.body.getReader();
    let text = "";
    const deadline = Date.now() + 4000;
    while (Date.now() < deadline && !(text.includes("event: action") && text.includes('"tool":"Read"'))) {
      const timer = setTimeout(() => controller.abort(), 4000);
      const {value, done} = await reader.read().finally(() => clearTimeout(timer));
      if (done) break;
      text += new TextDecoder().decode(value);
    }
    assert.match(text, /event: state\ndata: .*"state":"working".*"activeSessions":\["s1"\]/);
    assert.match(text, /event: action\ndata: .*"tool":"Read"/);
    assert.equal(text.includes("SECRET"), false);
    assert.equal(text.includes('"observedAt"'), true);
  } finally {
    controller.abort(); child.kill(); for (const r of sent) r.end(); fake.close();
  }
});
