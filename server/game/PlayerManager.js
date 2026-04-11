import { AvatarResolver } from "./AvatarResolver.js";

export class PlayerManager {
  constructor(config) {
    this.config = config;
    this.players = new Map();
    this.avatarResolver = new AvatarResolver();
    this.classNames = Object.keys(config.classes);
  }

  join(username) {
    const cleanName = sanitizeUsername(username);
    if (!cleanName) return { player: null, created: false, error: "Missing username" };

    const existing = this.players.get(cleanName.toLowerCase());
    if (existing && existing.alive) return { player: existing, created: false };
    if (existing && !existing.alive) {
      this.players.delete(cleanName.toLowerCase());
    }

    if (this.getAlivePlayers().length >= this.config.combat.maxPlayers) {
      return { player: null, created: false, error: "Arena is full" };
    }

    const className = this.pickClass(cleanName);
    const classConfig = this.config.classes[className];
    const hp = this.config.player.baseHP;
    const player = {
      id: makeId(cleanName),
      username: cleanName,
      key: cleanName.toLowerCase(),
      className,
      classConfig,
      hp,
      maxSeenHP: hp,
      kills: 0,
      alive: true,
      x: rand(this.config.arena.safePadding, this.config.arena.width - this.config.arena.safePadding),
      y: rand(this.config.arena.safePadding + 120, this.config.arena.height - this.config.arena.safePadding),
      vx: rand(-90, 90),
      vy: rand(-90, 90),
      targetId: null,
      lastAttackAt: 0,
      lastLaserAt: 0,
      lastTargetScanAt: 0,
      lastUltimateAt: -Infinity,
      joinedAt: Date.now(),
      auraLevel: getAuraLevel(hp, this.config),
      avatarUrl: this.avatarResolver.resolve(cleanName)
    };
    this.recalculateDerivedStats(player);
    this.players.set(player.key, player);
    return { player, created: true };
  }

  boost(username, coins) {
    const joined = this.join(username);
    if (!joined.player) return joined;
    const safeCoins = clamp(Number.parseInt(coins, 10) || 0, 0, 100000);
    const bonus = safeCoins * this.config.player.giftHPPerCoin;
    const oldAura = joined.player.auraLevel;
    joined.player.hp += bonus;
    joined.player.maxSeenHP = Math.max(joined.player.maxSeenHP, joined.player.hp);
    this.recalculateDerivedStats(joined.player);
    return {
      player: joined.player,
      created: joined.created,
      bonus,
      coins: safeCoins,
      auraLeveled: joined.player.auraLevel > oldAura
    };
  }

  setAvatar(username, avatarUrl) {
    const cleanName = sanitizeUsername(username);
    const url = this.avatarResolver.setManualAvatar(cleanName, avatarUrl);
    if (!url) return null;
    const player = this.players.get(cleanName.toLowerCase());
    if (player) player.avatarUrl = url;
    return url;
  }

  // Fire-and-forget: fetch TikTok avatar in background and update player if found
  resolveAvatarAsync(username) {
    const cleanName = sanitizeUsername(username);
    if (!cleanName) return;
    this.avatarResolver.fetchAndStore(cleanName).then(() => {
      const player = this.players.get(cleanName.toLowerCase());
      if (player) {
        const url = this.avatarResolver.resolveLatest(cleanName);
        if (url) player.avatarUrl = url;
      }
    }).catch(() => {});
  }

  getByUsername(username) {
    return this.players.get(String(username || "").trim().toLowerCase()) || null;
  }

  getAlivePlayers() {
    return [...this.players.values()].filter((player) => player.alive);
  }

  removeDead(player) {
    player.alive = false;
    this.players.delete(player.key);
  }

  resetArena() {
    this.players.clear();
  }

  recalculateDerivedStats(player) {
    player.sizeScale = this.config.formulas.sizeScale(player.hp);
    player.radius = Math.min(
      this.config.player.maxRenderedRadius,
      Math.floor(this.config.player.baseRadius * player.sizeScale)
    );
    player.damage = this.config.formulas.damage(player.hp, player.classConfig);
    player.attackRange = this.config.formulas.attackRange(player.radius, player.classConfig);
    player.speed = this.config.formulas.moveSpeed(player.classConfig, player.hp);
    player.auraLevel = getAuraLevel(player.hp, this.config);
  }

  pickClass(username) {
    let hash = 0;
    for (const char of username) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
    return this.classNames[hash % this.classNames.length];
  }
}

export function sanitizeUsername(value) {
  return String(value || "")
    .replace(/[^\p{L}\p{N}_ .-]/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 24);
}

export function getAuraLevel(hp, config) {
  let level = 0;
  for (const threshold of config.aura.thresholds) {
    if (hp >= threshold.hp) level = threshold.level;
  }
  return level;
}

function makeId(username) {
  return `${username.toLowerCase().replace(/[^a-z0-9]/g, "")}-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 7)}`;
}

function rand(min, max) {
  return min + Math.random() * (max - min);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
