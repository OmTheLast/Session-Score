// A second feed for the dashboard: events from a local Turbella daemon
// (https://github.com/NakliTechie/turbella) instead of Codex log files. Turbella
// already follows Claude Code, Codex, Copilot CLI, Cursor, Hermes, opencode, pi and
// omp, so every one of them can play the score. It sends the same two messages as
// codex-feed.mjs ("state" and "action"), so the browser side does not change.
//
// Turbella events carry names, statuses and hashes only, never prompts or output.
export const STALE_MS = 120_000;      // an open turn with no news for this long is uncertain
const FORGET_MS = 600_000;            // and is dropped after this long
const KEEP = ["kind", "status", "tool", "sig", "ts", "agent"];

export class TurbellaState {
  constructor({now = Date.now} = {}) { this.now = now; this.sessions = new Map(); this.endReason = null; this.active = []; }
  // Returns the action event to play for this record, or null. State changes are
  // read back through snapshot().
  consume(raw) {
    if (!raw || typeof raw.session !== "string" || !raw.session) return null;
    const ev = Object.fromEntries(KEEP.filter(k => raw[k] !== undefined).map(k => [k, raw[k]]));
    ev.session = raw.session;
    ev.ts = Number.isFinite(ev.ts) ? ev.ts : this.now();
    ev.status ??= "ok";
    if (ev.kind === "ping") return null;
    const s = this.sessions.get(ev.session) ?? {state: "idle", endReason: null, last: 0, agent: ev.agent};
    this.sessions.set(ev.session, s);
    s.last = Math.max(s.last, ev.ts);
    if (ev.kind === "turn") { s.state = "working"; s.endReason = null; }
    else if (ev.kind === "stop") { s.state = ev.status === "error" ? "cancelled" : "idle"; s.endReason = s.state === "cancelled" ? "cancelled" : "completed"; }
    // Joining mid-turn: a session never seen working that sends fresh work is working.
    else if (s.state === "idle" && s.endReason === null && this.now() - ev.ts < STALE_MS) s.state = "working";
    return ev;
  }
  snapshot() {
    const now = this.now(), updates = [];
    for (const [id, s] of this.sessions) {
      const stale = s.state === "working" && now - s.last > STALE_MS;
      if (now - s.last > FORGET_MS) { this.sessions.delete(id); continue; }
      updates.push({session: id, state: stale ? "unknown" : s.state, endReason: s.endReason});
    }
    const active = updates.filter(s => s.state === "working").map(s => s.session);
    const uncertain = updates.filter(s => s.state === "unknown");
    // Only sessions that were working can authorise a normal release.
    if (active.length) this.endReason = null;
    else if (this.active.length) {
      const ended = this.active.map(id => updates.find(s => s.session === id));
      this.endReason = ended.every(s => s?.endReason === "completed") ? "completed"
        : ended.some(s => s?.endReason === "cancelled") ? "cancelled" : null;
    }
    this.active = active;
    return {state: active.length ? "working" : uncertain.length ? "unknown" : "idle",
      endReason: this.endReason, activeSessions: active, activeCount: active.length, uncertainCount: uncertain.length,
      reason: uncertain.length ? `${uncertain.length} session(s) have no reliable current state.` : ""};
  }
}

// Parse a server-sent-event byte stream into JSON objects.
export async function* readEvents(body) {
  const decoder = new TextDecoder();
  let buffer = "";
  for await (const chunk of body) {
    buffer += decoder.decode(chunk, {stream: true});
    const blocks = buffer.split("\n\n"); buffer = blocks.pop();
    for (const block of blocks) {
      const data = block.split("\n").filter(l => l.startsWith("data: ")).map(l => l.slice(6)).join("\n");
      if (!data) continue;
      try { yield JSON.parse(data); } catch { /* skip an unreadable record */ }
    }
  }
}

export function turbellaPort() { return Number(process.env.TURBELLA_PORT || 7377); }

export async function turbellaStatus(port = turbellaPort()) {
  const r = await fetch(`http://127.0.0.1:${port}/status`, {signal: AbortSignal.timeout(1500)});
  if (!r.ok) throw new Error("Turbella is not answering.");
  return r.json();
}

export async function followTurbella(res, {port = turbellaPort()} = {}) {
  const state = new TurbellaState(), startedAt = Date.now();
  const abort = new AbortController();
  let pending = [];
  // Reconstruct current state from Turbella's backlog; never audition old events.
  const pump = async () => {
    while (!abort.signal.aborted) {
      try {
        const r = await fetch(`http://127.0.0.1:${port}/events`, {signal: abort.signal});
        if (!r.ok) throw new Error("Turbella refused the stream.");
        for await (const raw of readEvents(r.body)) {
          const ev = state.consume(raw);
          if (ev && ev.kind !== "stop" && ev.ts >= startedAt && Date.now() - ev.ts < 2000) pending.push(ev);
        }
      } catch { if (abort.signal.aborted) return; }
      await new Promise(done => setTimeout(done, 2000));
    }
  };
  res.writeHead(200, {"Content-Type": "text/event-stream", "Cache-Control": "no-store", "X-Accel-Buffering": "no"});
  const send = (type, data) => {
    if (res.destroyed) return;
    if (res.writableLength > 65536) { res.end(); return; }
    res.write(`event: ${type}\ndata: ${JSON.stringify({session: "all", ...data, observedAt: Date.now()})}\n\n`);
  };
  void pump();
  const timer = setInterval(() => {
    const snapshot = state.snapshot(), events = pending; pending = [];
    send("state", snapshot);
    if (snapshot.state === "working") for (const ev of events.sort((a, b) => a.ts - b.ts)) send("action", ev);
  }, 300);
  res.on("close", () => { clearInterval(timer); abort.abort(); });
}
