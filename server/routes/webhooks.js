import express from "express";
import { sanitizeUsername } from "../game/PlayerManager.js";

const USERNAME_PATHS = [
  "username",
  "nickname",
  "uniqueId",
  "userId",
  "displayName",
  "name",
  "userName",
  "viewerName",
  "user.username",
  "user.nickname",
  "user.uniqueId",
  "user.userId",
  "user.displayName",
  "user.name",
  "data.username",
  "data.nickname",
  "data.uniqueId",
  "data.userId",
  "data.displayName",
  "data.name",
  "event.username",
  "event.nickname",
  "event.uniqueId",
  "event.userId",
  "event.displayName",
  "event.name"
];

const COIN_PATHS = [
  "coins",
  "coin",
  "amount",
  "giftCount",
  "repeatCount",
  "diamondCount",
  "data.coins",
  "data.coin",
  "data.amount",
  "data.giftCount",
  "data.repeatCount",
  "data.diamondCount",
  "gift.coins",
  "gift.amount",
  "gift.repeatCount",
  "gift.diamondCount"
];

const AVATAR_PATHS = [
  "profilePictureUrl",
  "profilePicture",
  "avatarUrl",
  "avatar",
  "avatarThumb",
  "picture_url",
  "userAvatar",
  "userImage",
  "thumbnail_url",
  "user.profilePictureUrl",
  "user.profilePicture",
  "user.avatarUrl",
  "user.avatar",
  "data.profilePictureUrl",
  "data.profilePicture",
  "data.avatarUrl",
  "data.avatar"
];

export function createWebhookRouter({ playerManager, battleEngine }) {
  const router = express.Router();
  const debugRequests = [];

  router.all(["/webhook1", "/join", "/api/join"], (req, res) => {
    const debugRecord = rememberDebugRequest(debugRequests, req);
    const input = normalizeInput(req);
    debugRecord.normalized = input.debug;
    if (!assertValidUsername(input, res)) return;

    const result = playerManager.join(input.username);
    if (!result.player) return res.status(400).json(failurePayload("join", input, result.error));

    applyAvatar(playerManager, input, result.player.username);
    const event = battleEngine.pushEvent({
      type: result.created ? "join" : "alreadyJoined",
      playerId: result.player.id,
      username: result.player.username,
      x: result.player.x,
      y: result.player.y
    });
    battleEngine.io.emit("debug", `${result.player.username} join battle`);

    res.json(successPayload("join", input, result, event, battleEngine, playerManager));
  });

  router.all(["/webhook2", "/gift", "/api/gift"], (req, res) => {
    const debugRecord = rememberDebugRequest(debugRequests, req);
    const input = normalizeInput(req);
    debugRecord.normalized = input.debug;
    if (!assertValidUsername(input, res, "gift")) return;

    const result = playerManager.boost(input.username, input.coins);
    if (!result.player) return res.status(400).json(failurePayload("gift", input, result.error));

    applyAvatar(playerManager, input, result.player.username);
    const event = battleEngine.pushEvent({
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
      ...successPayload("gift", input, result, event, battleEngine, playerManager),
      coins: result.coins,
      hpAdded: result.bonus,
      auraLeveled: result.auraLeveled
    });
  });

  router.all(["/webhook3", "/ultimate", "/api/ultimate"], (req, res) => {
    const debugRecord = rememberDebugRequest(debugRequests, req);
    const input = normalizeInput(req);
    debugRecord.normalized = input.debug;
    if (!assertValidUsername(input, res, "ultimate")) return;

    applyAvatar(playerManager, input, input.username);
    const result = battleEngine.triggerUltimate(input.username);
    if (!result.ok && result.cooldownMs) {
      return res.status(429).json({
        ok: false,
        action: "ultimate",
        error: "Ultimate is on cooldown",
        cooldownMs: result.cooldownMs,
        player: summarize(result.player)
      });
    }
    if (!result.ok) return res.status(400).json(failurePayload("ultimate", input, result.error));

    res.json({
      ok: true,
      action: "ultimate",
      usernameRaw: input.usernameRaw,
      username: result.player.username,
      eliminated: result.eliminated,
      players: playerManager.getAlivePlayers().length,
      socketClients: getSocketCount(battleEngine.io),
      player: summarize(result.player)
    });
  });

  router.all(["/webhook4", "/reset", "/api/reset"], (req, res) => {
    const event = battleEngine.manualReset("manual");
    res.json({
      ok: true,
      action: "reset",
      message: "Arena reset",
      eventId: event?.id || null,
      players: playerManager.getAlivePlayers().length,
      socketClients: getSocketCount(battleEngine.io)
    });
  });

  router.all("/debug-webhook", (req, res) => {
    const record = rememberDebugRequest(debugRequests, req);
    record.normalized = normalizeInput(req).debug;
    res.json({ ok: true, received: record });
  });

  router.get("/debug-last", (req, res) => {
    res.json({ ok: true, requests: debugRequests.slice(-20).reverse() });
  });

  router.post("/avatar", (req, res) => {
    const input = normalizeInput(req);
    if (!assertValidUsername(input, res, "avatar")) return;
    const avatarUrl = playerManager.setAvatar(input.username, input.avatarUrl);
    if (!avatarUrl) return res.status(400).json(failurePayload("avatar", input, "Invalid avatarUrl"));
    res.json({ ok: true, action: "avatar", username: input.username, avatarUrl });
  });

  return router;
}

function normalizeInput(req) {
  const body = typeof req.body === "object" && req.body ? req.body : {};
  const input = { ...body, ...req.query };
  const usernameCandidates = collectPathValues(input, USERNAME_PATHS);
  const usernameRaw = pickFirstValidUsername(usernameCandidates);
  const username = isPlaceholder(usernameRaw) ? "" : sanitizeUsername(usernameRaw);
  const coinsRaw = firstScalar(collectPathValues(input, COIN_PATHS)) ?? 0;
  const avatarUrl = pickFirstUrl(collectPathValues(input, AVATAR_PATHS));

  return {
    raw: input,
    usernameRaw,
    username,
    coins: coinsRaw,
    avatarUrl,
    hasPlaceholderUsername: usernameCandidates.some((value) => isPlaceholder(value)),
    debug: {
      usernameCandidates,
      usernameRaw,
      username,
      coinsRaw,
      avatarUrl
    }
  };
}

function assertValidUsername(input, res, action = "join") {
  if (input.username) return true;

  const error = input.hasPlaceholderUsername
    ? "Username placeholder was not replaced by the webhook sender"
    : "Missing username";
  const status = input.hasPlaceholderUsername ? 422 : 400;
  res.status(status).json({
    ok: false,
    action,
    error,
    usernameRaw: input.usernameRaw || null,
    acceptedFields: USERNAME_PATHS.slice(0, 8),
    tip: "Send a real value in username, nickname, uniqueId, userId, displayName, or name."
  });
  return false;
}

function successPayload(action, input, result, event, battleEngine, playerManager) {
  return {
    ok: true,
    action,
    usernameRaw: input.usernameRaw,
    username: result.player.username,
    created: !!result.created,
    eventId: event?.id || null,
    players: playerManager.getAlivePlayers().length,
    socketClients: getSocketCount(battleEngine.io),
    player: summarize(result.player)
  };
}

function failurePayload(action, input, error) {
  return {
    ok: false,
    action,
    error,
    usernameRaw: input.usernameRaw || null,
    username: input.username || null
  };
}

function applyAvatar(playerManager, input, username) {
  if (input.avatarUrl) playerManager.setAvatar(username, input.avatarUrl);
  else playerManager.resolveAvatarAsync(username);
}

function collectPathValues(root, paths) {
  const values = [];
  for (const pathName of paths) {
    const value = getPath(root, pathName);
    if (isScalar(value)) values.push(String(value).trim());
  }
  return values.filter(Boolean);
}

function pickFirstValidUsername(values) {
  for (const value of values) {
    if (isPlaceholder(value)) continue;
    if (sanitizeUsername(value)) return value;
  }
  return firstScalar(values) || "";
}

function firstScalar(values) {
  return values.find((value) => String(value || "").trim()) || "";
}

function pickFirstUrl(values) {
  for (const value of values) {
    const url = String(value || "").trim();
    if (url.startsWith("https://") || url.startsWith("http://")) return url;
  }
  return null;
}

function getPath(root, pathName) {
  return pathName.split(".").reduce((value, key) => {
    if (!value || typeof value !== "object") return undefined;
    return value[key];
  }, root);
}

function isScalar(value) {
  return ["string", "number", "boolean"].includes(typeof value);
}

function isPlaceholder(value) {
  const text = String(value || "").trim();
  return /^\{[^{}]+\}$/.test(text) || /^\$\{[^{}]+\}$/.test(text) || /^{{[^{}]+}}$/.test(text);
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
  if (!player) return null;
  return {
    username: player.username,
    className: player.className,
    hp: Math.max(0, Math.floor(player.hp)),
    kills: player.kills,
    auraLevel: player.auraLevel,
    avatarUrl: player.avatarUrl
  };
}

function getSocketCount(io) {
  return io?.engine?.clientsCount || 0;
}
