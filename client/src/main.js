import { Renderer } from "./renderer.js?v=20260412-smooth-3";
import { SoundManager } from "./soundManager.js?v=20260412-smooth-3";
import { UIManager } from "./uiManager.js?v=20260412-smooth-3";

const canvas = document.getElementById("arena");
const root = document.getElementById("overlayRoot");

const params = new URLSearchParams(window.location.search);
const backendUrl = (params.get("backend") || window.OVERLAY_BACKEND_URL || "").trim().replace(/\/$/, "");
const socketUrl = backendUrl || window.location.origin;

const statusDot = document.createElement("div");
statusDot.style.position = "fixed";
statusDot.style.top = "10px";
statusDot.style.right = "10px";
statusDot.style.width = "8px";
statusDot.style.height = "8px";
statusDot.style.borderRadius = "50%";
statusDot.style.backgroundColor = "gray";
statusDot.style.zIndex = "9999";
statusDot.title = "Connection Status";
document.body.appendChild(statusDot);

const joinLog = document.createElement("div");
joinLog.style.position = "fixed";
joinLog.style.top = "18px";
joinLog.style.left = "18px";
joinLog.style.background = "rgba(0,0,0,0.72)";
joinLog.style.color = "#85ff9c";
joinLog.style.padding = "10px 16px";
joinLog.style.borderRadius = "5px";
joinLog.style.fontFamily = "monospace";
joinLog.style.fontSize = "14px";
joinLog.style.fontWeight = "800";
joinLog.style.zIndex = "10000";
joinLog.style.opacity = "0";
joinLog.style.transition = "opacity 120ms ease";
document.body.appendChild(joinLog);
let joinLogTimer = null;

console.log("Initializing Socket.IO to:", socketUrl);

const socket = io(socketUrl, {
  transports: ["websocket", "polling"],
  reconnectionAttempts: 10,
  reconnectionDelay: 2000
});

socket.on("connect", () => {
  console.log("Socket connected:", socket.id);
  statusDot.style.backgroundColor = "#00ff00";
});

socket.on("disconnect", (reason) => {
  console.warn("Socket disconnected:", reason);
  statusDot.style.backgroundColor = "#ff0000";
});

socket.on("connect_error", (err) => {
  console.error("Socket connection error:", err.message);
  statusDot.style.backgroundColor = "#ffaa00";
});

socket.on("debug", (msg) => {
  console.log("Server log:", msg);
  joinLog.textContent = msg;
  joinLog.style.opacity = "1";
  clearTimeout(joinLogTimer);
  joinLogTimer = setTimeout(() => {
    joinLog.style.opacity = "0";
  }, 2200);
});

const sound = new SoundManager();
const ui = new UIManager(sound);
const renderer = new Renderer(canvas, sound);

let latestState = { players: [], leaderboard: [] };

socket.on("config", ({ config, transparent }) => {
  renderer.setConfig(config);
  ui.setConfig(config);
  sound.setConfig(config.audio);
  if (transparent) root.classList.add("transparent");
});

socket.on("state", (state) => {
  latestState = state;
  renderer.setState(state);
  ui.updateLeaderboard(state.leaderboard || []);
  ui.updateWinner(state.roundWinner, state.resetAt);
  ui.updateBattleTimer(state.battleTimer);
});

socket.on("events", (events) => {
  for (const event of events) {
    renderer.addEvent(event);
    sound.playEvent(event);
    ui.addEvent(event);
  }
});

function frame(time) {
  renderer.render(time, latestState);
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
