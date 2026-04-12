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

async function startLocalFrontend() {
  const local = express();
  local.disable("x-powered-by");

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
  local.get("/", (_req, res) => res.redirect("/client/overlay.html"));

  await new Promise((resolve, reject) => {
    server = local.listen(localPort, "127.0.0.1", resolve);
    server.once("error", reject);
  });
}

function createWindow() {
  const win = new BrowserWindow({
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

  win.loadURL(`http://127.0.0.1:${localPort}/client/overlay.html?backend=${encodeURIComponent(backendUrl)}`);
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
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
