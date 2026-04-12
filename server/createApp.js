import path from "node:path";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import { createServer } from "node:http";
import { Server } from "socket.io";
import { gameConfig } from "../config/gameConfig.js";
import { PlayerManager } from "./game/PlayerManager.js";
import { BattleEngine } from "./game/BattleEngine.js";
import { createWebhookRouter } from "./routes/webhooks.js";

export function createBattleServer({
  rootDir,
  config = gameConfig,
  dataDir = process.env.DATA_DIR || path.join(rootDir || process.cwd(), "data"),
  staticClient = false,
  transparent = false,
  tickRate = Number(process.env.TICK_RATE || 30),
  corsOrigin = process.env.CORS_ORIGIN || "*"
} = {}) {
  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: { origin: corsOrigin }
  });

  app.disable("x-powered-by");
  app.use(cors({ origin: corsOrigin }));
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false
    })
  );
  app.use(express.json({ limit: "256kb" }));
  app.use(express.urlencoded({ extended: true }));
  app.use((err, req, res, next) => {
    if (err instanceof SyntaxError && err.status === 400 && "body" in err) {
      return res.status(400).json({ ok: false, error: "Invalid JSON body" });
    }
    return next(err);
  });

  const playerManager = new PlayerManager(config, { dataDir });
  const battleEngine = new BattleEngine({ io, playerManager, config, transparent });

  if (staticClient) {
    app.use("/assets", express.static(path.join(rootDir, "assets")));
    app.use("/client", express.static(path.join(rootDir, "client")));
    app.get("/simulator", (req, res) => {
      res.sendFile(path.join(rootDir, "client", "simulator.html"));
    });
  }

  app.use("/", createWebhookRouter({ playerManager, battleEngine }));
  app.get("/avatar-proxy", createAvatarProxyHandler());
  app.get("/health", (req, res) => {
    res.json({
      ok: true,
      mode: staticClient ? "desktop" : "backend",
      players: playerManager.getAlivePlayers().length,
      socketClients: getSocketCount(io),
      roundWinner: battleEngine.roundWinner,
      resetAt: battleEngine.resetAt,
      uptime: process.uptime()
    });
  });

  if (staticClient) {
    app.get("/", (req, res) => res.redirect("/client/overlay.html"));
  } else {
    app.get("/", (req, res) => {
      res.json({
        ok: true,
        service: "TikTok Battle Royale backend",
        endpoints: {
          join: "/webhook1?username=viewer",
          gift: "/webhook2?username=viewer&coins=10",
          ultimate: "/webhook3?username=viewer",
          reset: "/reset",
          health: "/health",
          debug: "/debug-last"
        },
        socketClients: getSocketCount(io)
      });
    });
  }

  io.on("connection", (socket) => {
    socket.emit("config", { config, transparent });
    socket.emit("state", battleEngine.getSnapshot());
    socket.emit("events", battleEngine.getRecentEvents());
  });

  battleEngine.start(tickRate);

  return { app, httpServer, io, playerManager, battleEngine };
}

function createAvatarProxyHandler() {
  return async (req, res) => {
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

      const contentType = upstream.headers.get("content-type") || "image/jpeg";
      if (!contentType.startsWith("image/")) return res.status(400).end("Not an image");

      res.setHeader("Content-Type", contentType);
      res.setHeader("Cache-Control", "public, max-age=86400");
      res.end(Buffer.from(await upstream.arrayBuffer()));
    } catch {
      res.status(502).end("Proxy error");
    }
  };
}

export function getSocketCount(io) {
  return io?.engine?.clientsCount || 0;
}
