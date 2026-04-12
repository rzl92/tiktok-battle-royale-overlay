import { Renderer } from "./renderer.js";
import { SoundManager } from "./soundManager.js";
import { UIManager } from "./uiManager.js";

const canvas = document.getElementById("arena");
const root = document.getElementById("overlayRoot");

const params = new URLSearchParams(window.location.search);
const backendUrl = (params.get("backend") || window.OVERLAY_BACKEND_URL || "").trim().replace(/\/$/, "");

// Connection status indicator
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

const socketUrl = backendUrl || window.location.origin;

console.log("Initializing Socket.IO to:", socketUrl);

const socket = io(socketUrl, {
  transports: ["websocket", "polling"],
  reconnectionAttempts: 10,
  reconnectionDelay: 2000
});

socket.on("connect", () => {
  console.log("✅ Socket connected to:", socket.id);
  statusDot.style.backgroundColor = "#00ff00";
});

socket.on("disconnect", (reason) => {
  console.warn("❌ Socket disconnected:", reason);
  statusDot.style.backgroundColor = "#ff0000";
});

socket.on("connect_error", (err) => {
  console.error("⚠️ Connection error:", err.message);
  statusDot.style.backgroundColor = "#ffaa00";
});

socket.on("debug", (msg) => {
  console.log("🖥️ Server Log:", msg);
  const notification = document.createElement("div");
  notification.style.position = "fixed";
  notification.style.bottom = "20px";
  notification.style.left = "20px";
  notification.style.background = "rgba(0,0,0,0.8)";
  notification.style.color = "#00ff00";
  notification.style.padding = "10px 20px";
  notification.style.borderRadius = "5px";
  notification.style.fontFamily = "monospace";
  notification.style.zIndex = "10000";
  notification.textContent = msg;
  document.body.appendChild(notification);
  setTimeout(() => notification.remove(), 3000);
});

const sound = new SoundManager();
const ui = new UIManager(sound);
const renderer = new Renderer(canvas, sound);

let latestState = { players: [], leaderboard: [] };

socket.on("config", ({ config, transparent }) => {
  renderer.setConfig(config);
  sound.setConfig(config.audio);
  if (transparent) root.classList.add("transparent");
});

socket.on("state", (state) => {
  latestState = state;
  renderer.setState(state);
  ui.updateLeaderboard(state.leaderboard || []);
  ui.updateWinner(state.roundWinner);
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
