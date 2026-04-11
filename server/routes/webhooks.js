import express from "express";

export function createWebhookRouter({ playerManager, battleEngine }) {
  const router = express.Router();

  router.get("/webhook1", (req, res) => {
    const result = playerManager.join(req.query.username);
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

  router.get("/webhook2", (req, res) => {
    const result = playerManager.boost(req.query.username, req.query.coins);
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

  router.get("/webhook3", (req, res) => {
    const result = battleEngine.triggerUltimate(req.query.username);
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

  router.post("/avatar", (req, res) => {
    const avatarUrl = playerManager.setAvatar(req.body.username, req.body.avatarUrl);
    if (!avatarUrl) return res.status(400).json({ ok: false, error: "Invalid username or avatarUrl" });
    res.json({ ok: true, username: req.body.username, avatarUrl });
  });

  return router;
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
