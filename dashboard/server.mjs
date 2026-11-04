import http from "node:http";
import {readFile} from "node:fs/promises";

const port = Number(process.env.PORT || 8787);
const upstreamPort = Number(process.env.TURBELLA_PORT || 7377);
const files = new Map([
  ["/", ["index.html", "text/html"]],
  ["/app.js", ["app.js", "text/javascript"]],
  ["/model.js", ["model.js", "text/javascript"]],
  ["/audio.js", ["audio.js", "text/javascript"]],
  ["/style.css", ["style.css", "text/css"]]
]);
const root = new URL(".", import.meta.url);
const server = http.createServer(async (req, res) => {
  const allowedHosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
  if (!allowedHosts.has(req.headers.host) || req.method !== "GET" ||
      (req.headers.origin && ![`http://127.0.0.1:${port}`, `http://localhost:${port}`].includes(req.headers.origin))) {
    res.writeHead(403).end(); return;
  }
  const url = new URL(req.url, `http://127.0.0.1:${port}`);
  if (url.pathname === "/api/visualizer") {
    const session = url.searchParams.get("session");
    if (!session || session.length > 200) {
      res.writeHead(400).end("Choose a session."); return;
    }
    const target = new URL(`http://127.0.0.1:${upstreamPort}/viz`);
    target.searchParams.set("session", session);
    if (!url.searchParams.has("full")) target.searchParams.set("overlay", "1");
    res.writeHead(302, {Location: target.href, "Cache-Control": "no-store"}).end();
    return;
  }
  if (url.pathname === "/api/status" || url.pathname === "/api/events") {
    const path = url.pathname.slice(4);
    const session = url.searchParams.get("session");
    if (path === "/events" && (!session || session.length > 200)) {
      res.writeHead(400).end("Choose a session."); return;
    }
    const target = new URL(`http://127.0.0.1:${upstreamPort}${path}`);
    if (session) target.searchParams.set("session", session);
    const headers = {};
    if (/^\d+$/.test(req.headers["last-event-id"] ?? "")) headers["Last-Event-ID"] = req.headers["last-event-id"];
    const proxy = http.get(target, {headers}, incoming => {
      clearTimeout(timer);
      res.writeHead(incoming.statusCode, {
        "Content-Type": path === "/events" ? "text/event-stream" : "application/json",
        "Cache-Control": "no-store"
      });
      incoming.pipe(res);
      incoming.on("error", () => res.destroy());
    });
    const timer = setTimeout(() => proxy.destroy(new Error("Turbella did not respond.")), 2500);
    proxy.on("error", () => {
      clearTimeout(timer);
      if (!res.headersSent) res.writeHead(503, {"Content-Type": "application/json"}).end(JSON.stringify({error: "Start Turbella, then refresh sessions."}));
      else res.destroy();
    });
    res.on("close", () => {clearTimeout(timer); proxy.destroy();});
    return;
  }
  const file = files.get(url.pathname);
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
server.listen(port, "127.0.0.1", () => console.log(`Session Score • http://127.0.0.1:${port}`));
server.on("error", error => { console.error(error.message); process.exitCode = 1; });
