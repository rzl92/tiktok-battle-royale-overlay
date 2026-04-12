import { Renderer } from "./renderer.js";
import { SoundManager } from "./soundManager.js";
import { UIManager } from "./uiManager.js";

const canvas = document.getElementById("arena");
const root = document.getElementById("overlayRoot");
const socket = io();

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
