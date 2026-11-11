import {test} from "node:test";
import assert from "node:assert/strict";
import {mkdtemp, mkdir, writeFile, appendFile, rm, stat} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {spawn} from "node:child_process";
import {TurnState, SessionReader, SessionGroup, STALE_MS} from "./codex-feed.mjs";
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
    assert.equal((await fetch(url + "//[[")).status, 400);
    const status = await (await fetch(url + "/api/status")).json();
    assert.equal(status.preferredSession, "all");
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
    const allFeed = await fetch(url + "/api/events");
    const allReader = allFeed.body.getReader();
    async function allUntil(check) {
      const deadline = Date.now()+5000;
      while (Date.now()<deadline) {
        const chunk = await allReader.read();
        if (chunk.done) throw new Error("All-session feed closed");
        const body = new TextDecoder().decode(chunk.value);
        if (check(body)) return body;
      }
      throw new Error("Expected all-session update missing");
    }
    await allUntil(t => t.includes('"session":"all"') && t.includes('"state":"idle"'));
    const another = "22222222-2222-2222-2222-222222222222";
    const anotherPath = join(folder, `rollout-test-${another}.jsonl`);
    await writeFile(anotherPath,line(lifecycle("task_started")));
    await allUntil(t => t.includes('"activeSessions":["'+another+'"]'));
    await appendFile(anotherPath,line(record("response_item", {type:"function_call",name:"read_file",call_id:"live"})));
    const action = await allUntil(t => t.includes('"tool":"read_file"'));
    assert.ok(action.includes('"session":"'+another+'"'));
    await appendFile(anotherPath,line(lifecycle("task_complete")));
    await allUntil(t => t.includes('"activeCount":0') && t.includes('"state":"idle"'));
    await allReader.cancel();
    const viz = await fetch(url + "/api/visualizer?session=all",{redirect:"manual"});
    assert.equal(new URL(viz.headers.get("location")).searchParams.has("session"),false);

  } finally {controller.abort(); child?.kill(); await rm(dir,{recursive:true,force:true});}
});


test("all-session reader discovers new chats, preserves overlap, and skips history on reconnect", async () => {
  const dir = await mkdtemp(join(tmpdir(), "score-group-"));
  const files = new Map();
  const list = async () => Promise.all([...files].map(async ([session, path]) => ({session, path, last:(await stat(path)).mtimeMs})));
  async function add(id, records) {
    const path = join(dir, id + ".jsonl");
    await writeFile(path, records.map(line).join("")); files.set(id, path);
  }
  try {
    await add("A", [lifecycle("task_started"), record("response_item",{type:"function_call",name:"historical",call_id:"old"})]);
    const group = new SessionGroup({list});
    let snapshot = await group.read();
    assert.deepEqual(snapshot.activeSessions, ["A"]);
    assert.equal(snapshot.events.length, 0);
    await add("B", [lifecycle("task_started")]);
    snapshot = await group.read();
    assert.deepEqual(snapshot.activeSessions.sort(), ["A","B"]);
    assert.ok(snapshot.events.some(e => e.session === "B" && e.kind === "turn"));
    await appendFile(files.get("A"), line(lifecycle("task_complete")));
    await appendFile(files.get("B"), line(record("response_item",{type:"function_call",name:"apply_patch",arguments:"private",call_id:"b"})));
    snapshot = await group.read();
    assert.equal(snapshot.state, "working");
    assert.deepEqual(snapshot.activeSessions, ["B"]);
    assert.equal(snapshot.events.find(e => e.tool === "apply_patch").session, "B");
    assert.ok(!JSON.stringify(snapshot).includes("private"));
    const reconnect = new SessionGroup({list});
    snapshot = await reconnect.read();
    assert.equal(snapshot.state, "working");
    assert.equal(snapshot.events.length, 0);
    await appendFile(files.get("B"), line(lifecycle("turn_aborted")));
    snapshot = await group.read();
    assert.equal(snapshot.state, "idle");
    assert.equal(snapshot.activeCount, 0);
    // A previously finished session can resume without reconnecting the group.
    await appendFile(files.get("A"), line(lifecycle("task_started", "new-turn")));
    assert.deepEqual((await group.read()).activeSessions, ["A"]);
  } finally { await rm(dir,{recursive:true,force:true}); }
});

test("all-session audio accepts active sources and stops only after the last one ends", () => {
  let playing = false;
  const live = new LiveSession({audio:{context:{state:"running"},stop(){}},
    track:{start(){playing=true;},stop(){playing=false;}}});
  live.connect("all");
  live.receive({session:"all",state:"working",activeSessions:["A","B"]});
  assert.equal(playing,true);
  assert.equal(live.action({session:"A"}),true);
  assert.equal(live.action({session:"B"}),true);
  live.receive({session:"all",state:"working",activeSessions:["B"]});
  assert.equal(playing,true);
  assert.equal(live.action({session:"A"}),false);
  assert.equal(live.action({session:"B"}),true);
  live.receive({session:"all",state:"idle",activeSessions:[]});
  assert.equal(playing,false);
  assert.equal(live.action({session:"B"}),false);
});

test("normal completion releases once; idle heartbeats do not cut the tail or replay it", () => {
  let now=100, releases=0, stops=0, playing=false, status;
  const live=new LiveSession({now:()=>now, audio:{context:{state:"running"},stop(){stops++;},release(seconds){assert.equal(seconds,.8);releases++;}},
    track:{start(){playing=true;},stop(){playing=false;}},onState:s=>status=s});
  const receive=(state,endReason)=>live.receive({session:"all",state,endReason,activeSessions:state==="working"?["A"]:[]});
  live.connect("all"); receive("idle","completed"); assert.equal(releases,0);
  receive("working"); receive("idle","completed");
  assert.equal(playing,false);assert.equal(releases,1);assert.equal(status.releasing,true);
  const stopped=stops;now+=300;receive("idle","completed");assert.equal(stops,stopped);
  now+=501;receive("idle","completed");assert.equal(releases,1);assert.equal(status.releasing,false);
  receive("working");receive("idle","completed");const before=stops;
  receive("working");assert.equal(stops,before+1);assert.equal(playing,true);
  receive("idle","cancelled");assert.equal(releases,2);assert.equal(status.releasing,false);
  receive("working");receive("idle","completed");live.interrupted();assert.equal(status.releasing,false);
  receive("working");receive("idle","completed");live.disconnect();assert.equal(live.releaseUntil,0);
});

test("all-session completion outcome excludes old endings and missing active sessions", async () => {
  const dir=await mkdtemp(join(tmpdir(),"score-ending-")), files=new Map();
  const list=async()=>Promise.all([...files].map(async([session,path])=>({session,path,last:(await stat(path)).mtimeMs})));
  async function append(id,type) {
    if(!files.has(id))files.set(id,join(dir,id+".jsonl"));
    await appendFile(files.get(id),line(lifecycle(type)));
  }
  try {
    await append("old","task_complete");await append("A","task_started");await append("B","task_started");
    const group=new SessionGroup({list});await group.read();
    await append("A","turn_aborted");let state=await group.read();
    assert.equal(state.state,"working");assert.equal(state.endReason,null);
    await append("B","task_complete");state=await group.read();
    assert.equal(state.endReason,"completed");assert.equal((await group.read()).endReason,"completed");
    await append("A","task_started");await group.read();await append("A","turn_aborted");
    assert.equal((await group.read()).endReason,"cancelled");
    await append("A","task_started");await group.read();files.delete("A");
    assert.equal((await group.read()).endReason,null);
  } finally {await rm(dir,{recursive:true,force:true});}
});
