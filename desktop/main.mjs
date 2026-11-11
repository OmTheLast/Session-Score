import {app, BrowserWindow, ipcMain, protocol, session, shell} from "electron";
import {readFile} from "node:fs/promises";
import {join} from "node:path";
import {assets} from "../dashboard/assets.mjs";
import {sessions, SessionGroup} from "../dashboard/codex-feed.mjs";

const page = "score://studio/";
const repo = "https://github.com/OmTheLast/Session-Score";
const port = Number(process.env.TURBELLA_PORT || 7377);
const viz = new URL("/viz", `http://127.0.0.1:${Number.isInteger(port) && port > 0 && port <= 65535 ? port : 7377}`);
const csp = `default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; frame-src ${viz.origin}; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'`;
protocol.registerSchemesAsPrivileged([{scheme: "score", privileges: {standard: true, secure: true, supportFetchAPI: true}}]);

let window;
let group;
let reading;

function handle(name, fn) {
  ipcMain.handle(name, (event, ...args) => {
    if (!window || event.sender !== window.webContents ||
        event.senderFrame !== window.webContents.mainFrame || event.senderFrame.url !== page) {
      throw new Error("Untrusted frame.");
    }
    return fn(...args);
  });
}

function isVisualizer(url) {
  return url.origin === viz.origin && url.pathname === viz.pathname;
}

function openWindow() {
  window = new BrowserWindow({
    width: 1240, height: 850, minWidth: 680, minHeight: 480,
    title: "Session Score", backgroundColor: "#101213",
    webPreferences: {
      preload: join(import.meta.dirname, "preload.cjs"), sandbox: true, contextIsolation: true,
      nodeIntegration: false, backgroundThrottling: false
    }
  });
  const contents = window.webContents;
  contents.on("will-frame-navigate", event => {
    if (event.isMainFrame ? event.url !== page : !isVisualizer(new URL(event.url))) event.preventDefault();
  });
  contents.on("did-start-navigation", details => {
    if (details.isMainFrame && !details.isSameDocument) group = undefined;
  });
  contents.setWindowOpenHandler(({url}) => {
    if (url === repo || url === viz.href) void shell.openExternal(url);
    return {action: "deny"};
  });
  window.on("closed", () => { group = undefined; window = undefined; app.quit(); });
  void window.loadURL(page);
}

function start() {
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, reply) => reply(false));
  session.defaultSession.setPermissionCheckHandler(() => false);
  protocol.handle("score", async request => {
    const url = new URL(request.url);
    const asset = assets.get(url.pathname);
    if (url.host !== "studio" || request.method !== "GET" || !asset) return new Response(null, {status: 404});
    return new Response(await readFile(join(import.meta.dirname, "../dashboard", asset[0])), {
      headers: {"Content-Type": asset[1], "Content-Security-Policy": csp, "X-Content-Type-Options": "nosniff"}
    });
  });
  handle("score:available", async () => { try { await sessions(); return true; } catch { return false; } });
  handle("score:visualizer", async () => {
    try {
      const res = await fetch(viz, {method: "HEAD", redirect: "manual", signal: AbortSignal.timeout(1000)});
      return res.ok || res.status === 405 ? viz.href : null;
    } catch { return null; }
  });
  handle("score:link", () => { group = new SessionGroup(); });
  handle("score:unlink", () => { group = undefined; });
  handle("score:read", async () => {
    const current = group;
    if (!current || reading === current) return null;
    reading = current;
    try {
      const update = await current.read();
      if (current === group) return {...update, session: "all", observedAt: Date.now()};
    } catch {
      if (current === group) return {session: "all", state: "unknown", events: [], observedAt: Date.now(),
        reason: "Cannot read local Codex sessions. Start a Codex session and check its log folder."};
    } finally { if (reading === current) reading = undefined; }
    return null;
  });
  openWindow();
}

if (app.requestSingleInstanceLock()) {
  app.on("second-instance", () => {
    if (window?.isMinimized()) window.restore();
    window?.focus();
  });
  app.whenReady().then(start);
} else {
  app.quit();
}
