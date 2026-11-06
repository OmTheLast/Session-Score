import {readdir, stat, open} from "node:fs/promises";
import {join} from "node:path";
import {homedir} from "node:os";
import {createHash} from "node:crypto";
import {StringDecoder} from "node:string_decoder";

export const SESSION_ID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const root = join(process.env.CODEX_HOME || join(homedir(), ".codex"), "sessions");
export const STALE_MS = 120_000;

// Only metadata leaves the server. No prompt, tool arguments or output is sent.
export class TurnState {
  constructor() { this.state = "unknown"; this.turn = null; this.calls = new Map(); }
  consume(record) {
    const p = record.payload || {}, ts = Date.parse(record.timestamp);
    if (!Number.isFinite(ts)) return [];
    if (record.type === "event_msg") {
      if (p.type === "task_started") {
        this.state = "working"; this.turn = p.turn_id; this.endReason = null; this.calls.clear();
        return [{kind: "turn", status: "ok", ts}];
      }
      if (["task_complete", "turn_aborted"].includes(p.type) && (!p.turn_id || !this.turn || p.turn_id === this.turn)) {
        this.state = p.type === "turn_aborted" ? "cancelled" : "idle";
        this.endReason = p.type === "turn_aborted" ? "cancelled" : "completed";
        this.calls.clear();
        return [{kind: "stop", status: p.type === "turn_aborted" ? "cancelled" : "ok", ts}];
      }
      return [];
    }
    if (record.type !== "response_item" || this.state !== "working") return [];
    if (["function_call", "custom_tool_call"].includes(p.type)) {
      const tool = String(p.name || "unknown");
      const sig = createHash("sha256").update(String(p.arguments || p.input || "")).digest("hex");
      this.calls.set(p.call_id, {tool, sig});
      return [{kind: "tool", status: "waiting", tool, sig, ts}];
    }
    if (["function_call_output", "custom_tool_call_output"].includes(p.type)) {
      const call = this.calls.get(p.call_id);
      this.calls.delete(p.call_id);
      return call ? [{kind: "tool", status: "ok", ...call, ts}] : [];
    }
    return [];
  }
  snapshot(mtime, now = Date.now()) {
    const stale = this.state === "working" && now - mtime > STALE_MS;
    return {state: stale ? "unknown" : this.state, turn: this.turn, endReason: this.endReason || null,
      reason: stale ? "No fresh Codex records for two minutes; sound paused." : "", lastRecord: mtime};
  }
}

export class SessionReader {
  constructor(path) { this.path = path; this.reset(); }
  reset() { this.offset = 0; this.pending = ""; this.decoder = new StringDecoder("utf8"); this.turn = new TurnState(); }
  async read() {
    const file = await open(this.path, "r");
    try {
      const info = await file.stat();
      if (info.size < this.offset || (this.ino !== undefined && this.ino !== info.ino)) this.reset();
      this.ino = info.ino;
      const events = [];
      while (this.offset < info.size) {
        const buffer = Buffer.alloc(Math.min(1024 * 1024, info.size - this.offset));
        const {bytesRead} = await file.read(buffer, 0, buffer.length, this.offset);
        if (!bytesRead) break;
        this.offset += bytesRead;
        this.pending += this.decoder.write(buffer.subarray(0, bytesRead));
        const lines = this.pending.split("\n"); this.pending = lines.pop();
        for (const line of lines) {
          let record;
          try { record = JSON.parse(line); } catch { continue; }
          events.push(...this.turn.consume(record));
        }
      }
      return {events, ...this.turn.snapshot(info.mtimeMs)};
    } finally { await file.close(); }
  }
}

let inventory = [], refreshed = 0;
export async function sessions() {
  if (Date.now() - refreshed < 1500) return inventory;
  const found = [];
  async function walk(dir, depth = 0) {
    for (const entry of await readdir(dir, {withFileTypes: true})) {
      const path = join(dir, entry.name);
      if (entry.isDirectory() && depth < 3) await walk(path, depth + 1);
      if (!entry.isFile() || !entry.name.endsWith(".jsonl")) continue;
      const id = entry.name.slice(-42, -6);
      if (!SESSION_ID.test(id)) continue;
      const info = await stat(path);
      found.push({session: id, last: info.mtimeMs, path});
    }
  }
  await walk(root);
  inventory = found.sort((a,b) => b.last - a.last);
  refreshed = Date.now();
  return inventory;
}

// All sessions share one soundtrack; each retains its own lifecycle and event identity.
export class SessionGroup {
  constructor({list = sessions, now = Date.now} = {}) {
    this.list = list; this.now = now; this.readers = new Map(); this.startedAt = now(); this.initial = true;
  }
  async read() {
    const entries = await this.list();
    const present = new Set(entries.map(entry => entry.session));
    for (const id of this.readers.keys()) if (!present.has(id)) this.readers.delete(id);
    for (const entry of entries) {
      if (this.now() - entry.last <= STALE_MS && !this.readers.has(entry.session)) {
        this.readers.set(entry.session, new SessionReader(entry.path));
      }
    }
    const updates = await Promise.all([...this.readers].map(async ([session, reader]) => {
      try { return {session, ...await reader.read()}; }
      catch { return {session, state: "unknown", events: [], reason: "Session log unreadable."}; }
    }));
    const activeSessions = updates.filter(s => s.state === "working").map(s => s.session);
    const uncertain = updates.filter(s => s.state === "unknown");
    // Only the sessions that were actually working can authorize a normal release.
    if (activeSessions.length) this.endReason = null;
    else if (this.activeSessions?.length) {
      const ended = this.activeSessions.map(id => updates.find(s => s.session === id));
      this.endReason = ended.every(s => s?.endReason === "completed") ? "completed"
        : ended.some(s => s?.endReason === "cancelled") ? "cancelled" : null;
    }
    this.activeSessions = activeSessions;
    const events = this.initial ? [] : updates.filter(s => s.state === "working")
      .flatMap(s => s.events.filter(e => e.kind !== "stop" && e.ts >= this.startedAt && this.now() - e.ts < 2000)
        .map(e => ({...e, session: s.session}))).sort((a,b) => a.ts - b.ts);
    this.initial = false;
    // Retain quiet open turns so they can report uncertainty and recover on new records.
    for (const s of updates) {
      if ((s.state === "idle" || s.state === "cancelled") && this.now() - s.lastRecord > STALE_MS) this.readers.delete(s.session);
    }
    return {events, state: activeSessions.length ? "working" : uncertain.length ? "unknown" : "idle",
      endReason: this.endReason || null, activeSessions, activeCount: activeSessions.length, uncertainCount: uncertain.length,
      reason: uncertain.length ? `${uncertain.length} session(s) have no reliable current state.` : ""};
  }
}

export async function followSession(session, res) {
  let reader;
  if (session === "all") reader = new SessionGroup();
  else {
    const entry = (await sessions()).find(s => s.session === session);
    if (!entry) { res.writeHead(404).end("Codex session log not found."); return; }
    reader = new SessionReader(entry.path);
  }
  // Reconstruct current state, never audition the historical events.
  const initial = await reader.read();
  if (res.destroyed) return;
  res.writeHead(200, {"Content-Type": "text/event-stream", "Cache-Control": "no-store", "X-Accel-Buffering": "no"});
  const send = (type, data) => {
    if (res.destroyed) return;
    if (res.writableLength > 65536) { res.end(); return; }
    res.write(`event: ${type}\ndata: ${JSON.stringify({session, ...data, observedAt: Date.now()})}\n\n`);
  };
  const state = value => { const {events, ...snapshot} = value; send("state", snapshot); };
  state(initial);
  let busy = false;
  const timer = setInterval(async () => {
    if (busy || res.destroyed) return;
    busy = true;
    try {
      const update = await reader.read();
      if (res.destroyed) return;
      state(update);
      if (update.state === "working") {
        for (const event of update.events) if (event.kind !== "stop") send("action", event);
      }
    } catch {
      send("state", {state: "unknown", activeSessions: [], activeCount: 0, reason: "Cannot read Codex sessions. Sound paused."});
    } finally { busy = false; }
  }, 300);
  res.on("close", () => clearInterval(timer));
}
