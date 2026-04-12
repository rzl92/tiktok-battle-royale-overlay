import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { app, BrowserWindow, shell } from "electron";
import electronUpdater from "electron-updater";
import { createBattleServer } from "../server/createApp.js";

const { autoUpdater } = electronUpdater;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, "..");
const localPort = Number(process.env.DESKTOP_PORT || 3000);
const defaultBackendUrl = "https://rzl92-tiktok-battle-royale-overlay.hf.space";
const backendUrl = String(process.env.BACKEND_URL ?? process.env.OVERLAY_BACKEND_URL ?? defaultBackendUrl)
  .trim()
  .replace(/\/$/, "");

let httpServer;
let mainWindow;
let simulatorWindow;

async function startLocalServer() {
  ({ httpServer } = createBattleServer({
    rootDir,
    dataDir: app.getPath("userData"),
    staticClient: true,
    transparent: false
  }));

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

  const overlayUrl = new URL(`http://127.0.0.1:${localPort}/client/overlay.html`);
  if (backendUrl) overlayUrl.searchParams.set("backend", backendUrl);
  mainWindow.loadURL(overlayUrl.toString());
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

  const simulatorUrl = new URL(`http://127.0.0.1:${localPort}/client/simulator.html`);
  if (backendUrl) simulatorUrl.searchParams.set("backend", backendUrl);
  simulatorWindow.loadURL(simulatorUrl.toString());
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

function setupAutoUpdater() {
  if (!app.isPackaged) return;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowPrerelease = false;
  autoUpdater.on("error", (error) => console.warn("Auto-update error:", error.message));
  autoUpdater.on("update-downloaded", () => {
    console.log("Update downloaded; it will install when the app exits.");
  });
  autoUpdater.checkForUpdatesAndNotify().catch((error) => {
    console.warn("Auto-update check failed:", error.message);
  });
}

app.commandLine.appendSwitch("enable-gpu-rasterization");
app.commandLine.appendSwitch("enable-zero-copy");
app.commandLine.appendSwitch("ignore-gpu-blocklist");
app.commandLine.appendSwitch("disable-background-timer-throttling");
app.setAppUserModelId("com.rzl92.tiktokbattleroyaleoverlay");

app.whenReady().then(async () => {
  await startLocalServer();
  createWindow();
  setupAutoUpdater();

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
