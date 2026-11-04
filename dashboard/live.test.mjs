import {test} from "node:test";
import assert from "node:assert/strict";
import {mkdtemp, mkdir, writeFile, appendFile, rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {spawn} from "node:child_process";
import {TurnState, SessionReader, STALE_MS} from "./codex-feed.mjs";
import {LiveSession} from "./live-session.js";

const record = (type, payload) => ({timestamp: new Date().toISOString(), type, payload});
const lifecycle = (type, turn_id = "turn-1") => record("event_msg", {type, turn_id});
const line = r => JSON.stringify(r) + "\n";

test("only the matching turn can end work; cancellation and stale evidence stop music", () => {
  const state = new TurnState();
  state.consume(lifecycle("task_started"));
  state.consume(lifecycle("task_complete", "older-turn"));
  assert.equal(state.state, "working");
  assert.equal(state.snapshot(0, STALE_MS + 1).state, "unknown");
  state.consume(lifecycle("turn_aborted"));
  assert.equal(state.state, "cancelled");
  state.consume(lifecycle("task_started", "turn-2"));
  state.consume(lifecycle("task_complete", "turn-2"));
  assert.equal(state.state, "idle");
});

test("reader handles partial records and exposes only tool metadata", async () => {
  const dir = await mkdtemp(join(tmpdir(), "score-reader-"));
  try {
    const path = join(dir, "session.jsonl");
    const secret = "PRIVATE_PROMPT_AND_TOOL_ARGUMENTS";
    await writeFile(path, line(lifecycle("task_started")));
    const reader = new SessionReader(path);
    assert.equal((await reader.read()).state, "working");
    const tool = line(record("response_item", {type:"function_call", call_id:"call-1",name:"exec_command", arguments:secret}));
    await appendFile(path, tool.slice(0, -5));
    assert.equal((await reader.read()).events.length, 0);
    await appendFile(path, tool.slice(-5));
    const update = await reader.read();
    assert.equal(update.events[0].tool, "exec_command");
    assert.ok(!JSON.stringify(update).includes(secret));
    await appendFile(path, line(lifecycle("task_complete")));
    assert.equal((await reader.read()).state, "idle");
    assert.equal((await reader.read()).events.length, 0);
  } finally { await rm(dir, {recursive:true, force:true}); }
});

test("audio follows verified state, cancels scheduled tails, and fails silent on loss", () => {
  let now = 10, playing = false, stopped = 0;
  const audio = {context:{state:"running"}, stop:() => stopped++};
  const track = {start:() => playing = true, stop:() => playing = false};
  const live = new LiveSession({audio, track, now:() => now});
  live.connect("chosen");
  assert.equal(playing, false); // Connecting never starts music itself.
  live.receive({session:"other",state:"working"});
  assert.equal(playing, false);
  live.receive({session:"chosen",state:"working"});
  assert.equal(playing, true); // Joining mid-turn starts the bass.
  assert.equal(live.action({session:"other"}), false);
  live.receive({session:"chosen",state:"cancelled"});
  assert.equal(playing, false);
  assert.ok(stopped >= 2);
  live.receive({session:"chosen",state:"working"});
  now += 2100; live.check();
  assert.equal(playing, false);
  assert.equal(live.action({session:"chosen"}), false);
  live.receive({session:"chosen", state:"working", observedAt: 1});
  assert.equal(playing, false); // Buffered old states cannot restart music.
  live.receive({session:"chosen",state:"idle"});
  assert.equal(playing, false); // Reconnect after finish stays silent.
  live.receive({session:"chosen",state:"working"});
  audio.context.state = "suspended"; live.sync();
  assert.equal(playing, false);
  audio.context.state = "running"; live.sync();
  assert.equal(playing, true);
  live.disconnect();
  live.receive({session:"chosen",state:"working"});
  assert.equal(playing, false);
});

test("real HTTP feed reconstructs state, skips history, and follows start/tool/end/abort", {timeout:15000}, async () => {
  const dir = await mkdtemp(join(tmpdir(), "score-feed-"));
  const session = "11111111-1111-1111-1111-111111111111";
  let child;
  const controller = new AbortController();
  try {
    const folder = join(dir, "sessions", "2026", "11", "04");
    await mkdir(folder, {recursive:true});
    const path = join(folder, `rollout-test-${session}.jsonl`);
    await writeFile(path, line(lifecycle("task_started")) + line(record("response_item", {type:"function_call", name:"old_tool",call_id:"old"})) + line(lifecycle("task_complete")));
    child = spawn(process.execPath, ["dashboard/server.mjs"], {env:{...process.env, CODEX_HOME:dir, CODEX_THREAD_ID:session, PORT:"0"}, stdio:["ignore","pipe","pipe"]});
    const url = await new Promise((resolve,reject) => {
      const timer = setTimeout(() => reject(new Error("Server startup timed out")), 3000);
      child.stdout.on("data", chunk => { const match = String(chunk).match(/http:\/\/127\.0\.0\.1:\d+/); if (match) {clearTimeout(timer);resolve(match[0]);} });
      child.on("error", reject);
    });
    const status = await (await fetch(url + "/api/status")).json();
    assert.equal(status.preferredSession, session);
    assert.equal(status.sessions[0].session, session);
    assert.equal((await fetch(url+"/api/events?session=../../secret")).status, 400);
    const feed = await fetch(url + "/api/events?session=" + session, {signal:controller.signal});
    const reader = feed.body.getReader();
    let text = "";
    async function until(check) {
      const deadline = Date.now()+3000;
      while (Date.now()<deadline) {
        const timeout = setTimeout(() => controller.abort(), 3000);
        let result;
        try { result = await reader.read(); } finally {clearTimeout(timeout);}
        if (result.done) throw new Error("Feed closed");
        text += new TextDecoder().decode(result.value);
        if (check(text)) return;
      }
      throw new Error("Expected event missing: " + text);
    }
    await until(t => t.includes('"state":"idle"'));
    assert.ok(!text.includes("old_tool"));
    text="";
    await appendFile(path,line(lifecycle("task_started", "turn-2")));
    await until(t => t.includes('"state":"working"'));
    await appendFile(path,line(record("response_item",{type:"custom_tool_call",name:"apply_patch",call_id:"c",input:"PRIVATE_TEXT"})));
    await until(t => t.includes('"tool":"apply_patch"'));
    assert.ok(!text.includes("PRIVATE_TEXT"));
    text="";
    await appendFile(path,line(lifecycle("turn_aborted", "turn-2")));
    await until(t => t.includes('"state":"cancelled"'));
    text="";
    await appendFile(path,line(lifecycle("task_started", "turn-3")));
    await until(t => t.includes('"state":"working"'));
    await appendFile(path,line(lifecycle("task_complete", "turn-3")));
    await until(t => t.includes('"state":"idle"'));
    controller.abort();
    const reconnected = await fetch(url + "/api/events?session=" + session);
    const again = reconnected.body.getReader();
    const first = new TextDecoder().decode((await again.read()).value);
    assert.ok(first.includes('"state":"idle"'));
    assert.ok(!first.includes("event: action"));
    await again.cancel();
  } finally {controller.abort(); child?.kill(); await rm(dir,{recursive:true,force:true});}
});
