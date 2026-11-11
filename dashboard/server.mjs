import http from "node:http";
import {readFile} from "node:fs/promises";
import {sessions, followSession, SESSION_ID} from "./codex-feed.mjs";

import {assets} from "./assets.mjs";

const port = Number(process.env.PORT || 8787);
const upstreamPort = Number(process.env.TURBELLA_PORT || 7377);
const root = new URL(".", import.meta.url);
const server = http.createServer(async (req, res) => {
  const boundPort = server.address().port;
  const allowedHosts = new Set([`127.0.0.1:${boundPort}`, `localhost:${boundPort}`]);
  if (!allowedHosts.has(req.headers.host) || req.method !== "GET" ||
      (req.headers.origin && ![`http://127.0.0.1:${boundPort}`, `http://localhost:${boundPort}`].includes(req.headers.origin))) {
    res.writeHead(403).end(); return;
  }
  const url = new URL(req.url, `http://127.0.0.1:${boundPort}`);
  if (url.pathname === "/api/visualizer") {
    const session = url.searchParams.get("session") || "all";
    if (!session || session.length > 200) {
      res.writeHead(400).end("Choose a session."); return;
    }
    const target = new URL(`http://127.0.0.1:${upstreamPort}/viz`);
    if (session !== "all") target.searchParams.set("session", session);
    if (!url.searchParams.has("full")) target.searchParams.set("overlay", "1");
    res.writeHead(302, {Location: target.href, "Cache-Control": "no-store"}).end();
    return;
  }
  if (url.pathname === "/api/status") {
    try {
      const all = await sessions();
      const recent = all.slice(0, 20);
      res.writeHead(200, {"Content-Type": "application/json", "Cache-Control": "no-store"})
        .end(JSON.stringify({source: "codex-session-log", preferredSession: "all",
          sessions: recent.map(({session, last}) => ({session, last, agent: "codex"}))}));
    } catch { res.writeHead(503).end(JSON.stringify({error: "Local Codex session logs are unavailable."})); }
    return;
  }
  if (url.pathname === "/api/events") {
    const session = url.searchParams.get("session") || "all";
    if (session !== "all" && !SESSION_ID.test(session || "")) { res.writeHead(400).end("Choose a Codex session."); return; }
    try { await followSession(session, res); }
    catch { if (!res.headersSent) res.writeHead(503).end("Cannot read this Codex session."); else res.end(); }
    return;
  }
  const file = assets.get(url.pathname);
  if (!file) { res.writeHead(404).end("Not found"); return; }
  try {
    const body = await readFile(new URL(file[0], root));
    res.writeHead(200, {
      "Content-Type": file[1], "Cache-Control": "no-store",
      "Content-Security-Policy": `default-src 'self'; connect-src 'self'; style-src 'self'; script-src 'self'; img-src 'self' data:; frame-src 'self' http://127.0.0.1:${upstreamPort}; object-src 'none'; frame-ancestors 'none'`,
      "X-Content-Type-Options": "nosniff"
    }).end(body);
  } catch { res.writeHead(500).end("Dashboard file missing."); }
});
server.listen(port, "127.0.0.1", () => console.log(`Session Score • http://127.0.0.1:${server.address().port}`));
server.on("error", error => { console.error(error.message); process.exitCode = 1; });
