import express from "express";

export function createWebhookRouter({ playerManager, battleEngine }) {
  const router = express.Router();
  const debugRequests = [];

  router.all(["/webhook1", "/join"], (req, res) => {
    rememberDebugRequest(debugRequests, req);
    const input = getInput(req);
    const result = playerManager.join(input.username);
    if (!result.player) return res.status(400).json({ ok: false, error: result.error });
    battleEngine.pushEvent({
      type: result.created ? "join" : "alreadyJoined",
      playerId: result.player.id,
      username: result.player.username,
      x: result.player.x,
      y: result.player.y
    });
    res.json({ ok: true, created: result.created, player: summarize(result.player) });
  });

  router.all(["/webhook2", "/gift"], (req, res) => {
    rememberDebugRequest(debugRequests, req);
    const input = getInput(req);
    const result = playerManager.boost(input.username, input.coins);
    if (!result.player) return res.status(400).json({ ok: false, error: result.error });
    battleEngine.pushEvent({
      type: "gift",
      playerId: result.player.id,
      username: result.player.username,
      coins: result.coins,
      bonus: result.bonus,
      auraLeveled: result.auraLeveled,
      x: result.player.x,
      y: result.player.y
    });
    res.json({
      ok: true,
      created: result.created,
      coins: result.coins,
      hpAdded: result.bonus,
      auraLeveled: result.auraLeveled,
      player: summarize(result.player)
    });
  });

  router.all(["/webhook3", "/ultimate"], (req, res) => {
    rememberDebugRequest(debugRequests, req);
    const input = getInput(req);
    const result = battleEngine.triggerUltimate(input.username);
    if (!result.ok && result.cooldownMs) {
      return res.status(429).json({
        ok: false,
        error: "Ultimate is on cooldown",
        cooldownMs: result.cooldownMs,
        player: summarize(result.player)
      });
    }
    if (!result.ok) return res.status(400).json({ ok: false, error: result.error });
    res.json({ ok: true, eliminated: result.eliminated, player: summarize(result.player) });
  });

  router.all("/debug-webhook", (req, res) => {
    const record = rememberDebugRequest(debugRequests, req);
    res.json({ ok: true, received: record });
  });

  router.get("/debug-last", (req, res) => {
    res.json({ ok: true, requests: debugRequests.slice(-20).reverse() });
  });

  router.post("/avatar", (req, res) => {
    const input = getInput(req);
    const avatarUrl = playerManager.setAvatar(input.username, input.avatarUrl);
    if (!avatarUrl) return res.status(400).json({ ok: false, error: "Invalid username or avatarUrl" });
    res.json({ ok: true, username: input.username, avatarUrl });
  });

  return router;
}

function getInput(req) {
  return {
    ...req.query,
    ...(typeof req.body === "object" && req.body ? req.body : {})
  };
}

function rememberDebugRequest(debugRequests, req) {
  const record = {
    at: new Date().toISOString(),
    method: req.method,
    path: req.path,
    query: req.query,
    body: typeof req.body === "object" && req.body ? req.body : {},
    userAgent: req.get("user-agent") || "",
    ip: req.ip
  };
  debugRequests.push(record);
  debugRequests.splice(0, Math.max(0, debugRequests.length - 50));
  return record;
}

function summarize(player) {
  return {
    username: player.username,
    className: player.className,
    hp: Math.max(0, Math.floor(player.hp)),
    kills: player.kills,
    auraLevel: player.auraLevel,
    avatarUrl: player.avatarUrl
  };
}
