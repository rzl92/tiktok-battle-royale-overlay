import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import cors from "cors";
import { createServer } from "node:http";
import { Server } from "socket.io";
import { app, BrowserWindow, shell } from "electron";
import { gameConfig } from "../config/gameConfig.js";
import { PlayerManager } from "../server/game/PlayerManager.js";
import { BattleEngine } from "../server/game/BattleEngine.js";
import { createWebhookRouter } from "../server/routes/webhooks.js";
import { createSimulatorRouter } from "../server/routes/simulator.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, "..");
const localPort = Number(process.env.DESKTOP_PORT || 3000);

let httpServer;
let mainWindow;
let simulatorWindow;

async function startLocalServer() {
  const expressApp = express();
  httpServer = createServer(expressApp);

  const io = new Server(httpServer, {
    cors: { origin: "*" }
  });

  expressApp.disable("x-powered-by");
  expressApp.use(cors({ origin: "*" }));
  expressApp.use(express.json({ limit: "256kb" }));
  expressApp.use(express.urlencoded({ extended: true }));

  const playerManager = new PlayerManager(gameConfig);
  const battleEngine = new BattleEngine({ io, playerManager, config: gameConfig });

  expressApp.use("/assets", express.static(path.join(rootDir, "assets")));
  expressApp.use("/client", express.static(path.join(rootDir, "client")));
  expressApp.use("/", createWebhookRouter({ playerManager, battleEngine }));
  expressApp.use("/", createSimulatorRouter({ playerManager, battleEngine }));

  expressApp.get("/avatar-proxy", async (req, res) => {
    const url = String(req.query.url || "").trim();
    if (!url.startsWith("https://") && !url.startsWith("http://")) {
      return res.status(400).end("Bad url");
    }
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 7000);
      const upstream = await fetch(url, {
        signal: controller.signal,
        headers: { "User-Agent": "Mozilla/5.0 (compatible; TikTokBattleRoyaleBot/1.0)" }
      });
      clearTimeout(timer);
      const ct = upstream.headers.get("content-type") || "image/jpeg";
      if (!ct.startsWith("image/")) return res.status(400).end("Not an image");
      res.setHeader("Content-Type", ct);
      res.setHeader("Cache-Control", "public, max-age=86400");
      res.end(Buffer.from(await upstream.arrayBuffer()));
    } catch {
      res.status(502).end("Proxy error");
    }
  });

  expressApp.get("/health", (req, res) => {
    res.json({ ok: true, players: playerManager.getAlivePlayers().length, uptime: process.uptime() });
  });

  expressApp.get("/", (req, res) => res.redirect("/client/overlay.html"));

  io.on("connection", (socket) => {
    socket.emit("config", { config: gameConfig, transparent: false });
    socket.emit("state", battleEngine.getSnapshot());
    socket.emit("events", battleEngine.getRecentEvents());
  });

  battleEngine.start(Number(process.env.TICK_RATE || 30));

  await new Promise((resolve, reject) => {
    httpServer.listen(localPort, "127.0.0.1", resolve);
    httpServer.once("error", reject);
  });

  console.log(`Local server running at http://127.0.0.1:${localPort}`);
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

  mainWindow.loadURL(`http://127.0.0.1:${localPort}/client/overlay.html`);
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

  simulatorWindow.loadURL(`http://127.0.0.1:${localPort}/client/simulator.html`);
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

app.commandLine.appendSwitch("enable-gpu-rasterization");
app.commandLine.appendSwitch("enable-zero-copy");
app.commandLine.appendSwitch("ignore-gpu-blocklist");
app.commandLine.appendSwitch("disable-background-timer-throttling");

app.whenReady().then(async () => {
  await startLocalServer();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  if (httpServer) httpServer.close();
});
