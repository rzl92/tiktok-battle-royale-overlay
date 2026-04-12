import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { app, BrowserWindow, shell } from "electron";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, "..");
const localPort = Number(process.env.DESKTOP_PORT || 3173);
const backendUrl = process.env.BACKEND_URL || "https://rzl92-tiktok-battle-royale-overlay.hf.space";

let server;
let mainWindow;
let simulatorWindow;

async function startLocalFrontend() {
  const local = express();
  local.disable("x-powered-by");
  local.use(express.json({ limit: "256kb" }));
  local.use(express.urlencoded({ extended: true }));

  local.get("/socket.io/socket.io.js", async (_req, res) => {
    try {
      const upstream = await fetch(`${backendUrl}/socket.io/socket.io.js`);
      if (!upstream.ok) {
        res.status(upstream.status).send("Unable to load Socket.IO client");
        return;
      }
      res.type("application/javascript").send(await upstream.text());
    } catch (error) {
      res.status(502).send(`Unable to reach backend: ${error.message}`);
    }
  });

  local.use("/assets", express.static(path.join(rootDir, "assets")));
  local.use("/client", express.static(path.join(rootDir, "client")));
  local.all(["/webhook1", "/webhook2", "/webhook3", "/webhook4", "/join", "/gift", "/ultimate", "/reset", "/avatar", "/avatar-proxy", "/health", "/debug-last"], proxyBackend);
  local.get("/simulator", (_req, res) => res.redirect("/client/simulator.html"));
  local.get("/", (_req, res) => res.redirect("/client/overlay.html"));

  await new Promise((resolve, reject) => {
    server = local.listen(localPort, "127.0.0.1", resolve);
    server.once("error", reject);
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 540,
    height: 960,
    minWidth: 360,
    minHeight: 640,
    backgroundColor: "#05080c",
    title: "TikTok Battle Royale Overlay",
    autoHideMenuBar: true,
    webPreferences: {
      backgroundThrottling: false
    }
  });

  mainWindow.loadURL(`http://127.0.0.1:${localPort}/client/overlay.html?backend=${encodeURIComponent(backendUrl)}`);
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isLocalSimulatorUrl(url)) {
      openSimulatorWindow();
      return { action: "deny" };
    }
    shell.openExternal(url);
    return { action: "deny" };
  });
}

function openSimulatorWindow() {
  if (simulatorWindow && !simulatorWindow.isDestroyed()) {
    simulatorWindow.focus();
    return;
  }

  simulatorWindow = new BrowserWindow({
    width: 720,
    height: 820,
    minWidth: 520,
    minHeight: 620,
    backgroundColor: "#0a0e13",
    title: "TikTok Battle Simulator",
    autoHideMenuBar: true,
    parent: mainWindow || undefined,
    webPreferences: {
      backgroundThrottling: false
    }
  });

  simulatorWindow.loadURL(`http://127.0.0.1:${localPort}/client/simulator.html?backend=${encodeURIComponent(backendUrl)}`);
  simulatorWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.includes("/client/overlay.html")) {
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.focus();
      return { action: "deny" };
    }
    shell.openExternal(url);
    return { action: "deny" };
  });
  simulatorWindow.on("closed", () => {
    simulatorWindow = null;
  });
}

function isLocalSimulatorUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.hostname === "127.0.0.1" && (parsed.pathname === "/simulator" || parsed.pathname === "/client/simulator.html");
  } catch {
    return false;
  }
}

async function proxyBackend(req, res) {
  try {
    const upstreamUrl = new URL(req.originalUrl, backendUrl);
    const method = req.method.toUpperCase();
    const headers = { ...req.headers, host: upstreamUrl.host };
    delete headers["content-length"];

    const upstream = await fetch(upstreamUrl, {
      method,
      headers,
      body: method === "GET" || method === "HEAD" ? undefined : buildProxyBody(req)
    });

    res.status(upstream.status);
    upstream.headers.forEach((value, key) => {
      if (!["content-encoding", "content-length", "transfer-encoding"].includes(key.toLowerCase())) {
        res.setHeader(key, value);
      }
    });
    res.send(Buffer.from(await upstream.arrayBuffer()));
  } catch (error) {
    res.status(502).json({ ok: false, error: `Backend proxy failed: ${error.message}` });
  }
}

function buildProxyBody(req) {
  if (req.is("application/json")) return JSON.stringify(req.body || {});
  if (req.is("application/x-www-form-urlencoded")) return new URLSearchParams(req.body || {}).toString();
  return undefined;
}

app.commandLine.appendSwitch("enable-gpu-rasterization");
app.commandLine.appendSwitch("enable-zero-copy");
app.commandLine.appendSwitch("ignore-gpu-blocklist");
app.commandLine.appendSwitch("disable-background-timer-throttling");

app.whenReady().then(async () => {
  await startLocalFrontend();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  if (server) server.close();
});
