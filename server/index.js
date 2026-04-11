import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import { createServer } from "node:http";
import { Server } from "socket.io";
import { gameConfig } from "../config/gameConfig.js";
import { PlayerManager } from "./game/PlayerManager.js";
import { BattleEngine } from "./game/BattleEngine.js";
import { createWebhookRouter } from "./routes/webhooks.js";
import { createSimulatorRouter } from "./routes/simulator.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, "..");

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: process.env.CORS_ORIGIN || "*" }
});

const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || "0.0.0.0";

app.use(cors({ origin: process.env.CORS_ORIGIN || "*" }));
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false
  })
);
app.use(express.json({ limit: "256kb" }));
app.use(express.urlencoded({ extended: true }));

const playerManager = new PlayerManager(gameConfig);
const battleEngine = new BattleEngine({ io, playerManager, config: gameConfig });

app.use("/assets", express.static(path.join(rootDir, "assets")));
app.use("/client", express.static(path.join(rootDir, "client")));
app.use("/", createWebhookRouter({ playerManager, battleEngine }));
app.use("/", createSimulatorRouter({ playerManager, battleEngine }));

app.get("/", (req, res) => res.redirect("/client/overlay.html"));

// Proxy TikTok CDN avatar images to avoid browser CORS restrictions
app.get("/avatar-proxy", async (req, res) => {
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
    const buf = await upstream.arrayBuffer();
    res.end(Buffer.from(buf));
  } catch {
    res.status(502).end("Proxy error");
  }
});

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    players: playerManager.getAlivePlayers().length,
    uptime: process.uptime()
  });
});

io.on("connection", (socket) => {
  socket.emit("config", {
    config: gameConfig,
    transparent: String(process.env.OVERLAY_TRANSPARENT || "false") === "true"
  });
  socket.emit("state", battleEngine.getSnapshot());
  socket.emit("events", battleEngine.getRecentEvents());
});

battleEngine.start(Number(process.env.TICK_RATE || 30));

httpServer.listen(port, host, () => {
  console.log(`TikTok Battle Royale overlay running at http://localhost:${port}`);
  console.log(`Overlay:   http://localhost:${port}/client/overlay.html`);
  console.log(`Simulator: http://localhost:${port}/simulator`);
});
