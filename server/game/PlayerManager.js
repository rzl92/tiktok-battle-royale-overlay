import { AvatarResolver } from "./AvatarResolver.js";
import fs from "node:fs";
import path from "node:path";

export class PlayerManager {
  constructor(config, { dataDir = process.env.DATA_DIR || path.join(process.cwd(), "data") } = {}) {
    this.config = config;
    this.players = new Map();
    this.records = new Map();
    this.recordsFile = process.env.WINS_FILE || path.join(dataDir, "wins.json");
    this.saveRecordsTimer = null;
    this.avatarResolver = new AvatarResolver();
    this.classNames = Object.keys(config.classes);
    this.loadRecords();
  }

  join(username) {
    const cleanName = sanitizeUsername(username);
    if (!cleanName) return { player: null, created: false, error: "Missing username" };

    const key = cleanName.toLowerCase();
    const record = this.getOrCreateRecord(cleanName);
    const existing = this.players.get(key);
    if (existing && existing.alive) return { player: existing, created: false };
    if (existing && !existing.alive) {
      this.players.delete(key);
    }

    if (this.getAlivePlayers().length >= this.config.combat.maxPlayers) {
      return { player: null, created: false, error: "Arena is full" };
    }

    const className = record.className || this.pickClass(cleanName);
    const classConfig = this.config.classes[className];
    const hp = this.config.player.baseHP;
    const player = {
      id: makeId(cleanName),
      username: cleanName,
      key,
      className,
      classConfig,
      hp,
      maxSeenHP: hp,
      kills: record.wins,
      wins: record.wins,
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
    record.username = cleanName;
    record.className = className;
    record.avatarUrl = player.avatarUrl || record.avatarUrl || null;
    this.scheduleSaveRecords();
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
    if (bonus > 0) this.applyBoostImpulse(joined.player, bonus);
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
    const key = cleanName.toLowerCase();
    const record = this.getOrCreateRecord(cleanName);
    record.avatarUrl = url;
    this.scheduleSaveRecords();
    const player = this.players.get(key);
    if (player) player.avatarUrl = url;
    return url;
  }

  // Fire-and-forget: fetch TikTok avatar in background and update player if found
  resolveAvatarAsync(username) {
    const cleanName = sanitizeUsername(username);
    if (!cleanName) return;
    this.avatarResolver.fetchAndStore(cleanName).then(() => {
      const player = this.players.get(cleanName.toLowerCase());
      const record = this.records.get(cleanName.toLowerCase());
      const latest = this.avatarResolver.resolveLatest(cleanName);
      if (record && latest) {
        record.avatarUrl = latest;
        this.scheduleSaveRecords();
      }
      if (player) {
        if (latest) player.avatarUrl = latest;
      }
    }).catch(() => {});
  }

  getByUsername(username) {
    return this.players.get(String(username || "").trim().toLowerCase()) || null;
  }

  getAlivePlayers() {
    return [...this.players.values()].filter((player) => player.alive);
  }

  addWin(player) {
    if (!player) return 0;
    const record = this.getOrCreateRecord(player.username);
    record.wins += 1;
    record.username = player.username;
    record.className = player.className;
    record.avatarUrl = player.avatarUrl || record.avatarUrl || null;
    player.wins = record.wins;
    player.kills = record.wins;
    this.scheduleSaveRecords();
    return record.wins;
  }

  async resetWins() {
    const alivePlayers = this.getAlivePlayers();
    const clearedRecords = this.records.size;
    this.records.clear();
    for (const player of alivePlayers) {
      player.wins = 0;
      player.kills = 0;
    }
    await this.saveRecordsNow();
    return { records: clearedRecords, players: alivePlayers.length };
  }

  getRecords() {
    return [...this.records.values()].map((record) => ({ ...record }));
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

  applyBoostImpulse(player, bonus) {
    const angle = Math.random() * Math.PI * 2;
    const base = this.config.physics.boostImpulseBase || 220;
    const maxBoost = this.config.physics.boostImpulseMax || 680;
    const force = Math.min(maxBoost, base + Math.sqrt(Math.max(0, bonus)) * 18);
    player.vx += Math.cos(angle) * force;
    player.vy += Math.sin(angle) * force;
    const speed = Math.hypot(player.vx, player.vy);
    const maxVelocity = this.config.physics.maxVelocity || 760;
    if (speed > maxVelocity) {
      player.vx = (player.vx / speed) * maxVelocity;
      player.vy = (player.vy / speed) * maxVelocity;
    }
    player.lastTargetScanAt = 0;
  }

  pickClass(username) {
    let hash = 0;
    for (const char of username) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
    return this.classNames[hash % this.classNames.length];
  }

  getOrCreateRecord(username) {
    const cleanName = sanitizeUsername(username);
    const key = cleanName.toLowerCase();
    let record = this.records.get(key);
    if (!record) {
      record = {
        key,
        username: cleanName,
        wins: 0,
        className: this.pickClass(cleanName),
        avatarUrl: this.avatarResolver.resolve(cleanName) || null
      };
      this.records.set(key, record);
      this.scheduleSaveRecords();
    }
    return record;
  }

  loadRecords() {
    try {
      if (!fs.existsSync(this.recordsFile)) return;
      const payload = JSON.parse(fs.readFileSync(this.recordsFile, "utf8"));
      const records = Array.isArray(payload?.records) ? payload.records : [];
      for (const item of records) {
        const username = sanitizeUsername(item.username);
        if (!username) continue;
        const key = username.toLowerCase();
        const className = this.config.classes[item.className] ? item.className : this.pickClass(username);
        this.records.set(key, {
          key,
          username,
          wins: Math.max(0, Math.floor(Number(item.wins) || 0)),
          className,
          avatarUrl: typeof item.avatarUrl === "string" ? item.avatarUrl : null
        });
      }
    } catch (error) {
      console.warn("Unable to load wins records:", error.message);
    }
  }

  scheduleSaveRecords() {
    clearTimeout(this.saveRecordsTimer);
    this.saveRecordsTimer = setTimeout(() => {
      this.saveRecordsNow().catch((error) => console.warn("Unable to save wins records:", error.message));
    }, 250);
  }

  async saveRecordsNow() {
    clearTimeout(this.saveRecordsTimer);
    const payload = JSON.stringify({ version: 1, records: this.getRecords() }, null, 2);
    await fs.promises.mkdir(path.dirname(this.recordsFile), { recursive: true });
    await fs.promises.writeFile(this.recordsFile, payload);
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
