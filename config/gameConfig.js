export const gameConfig = {
  arena: {
    width: 1080,
    height: 1920,
    safePadding: 70
  },
  player: {
    baseHP: 15,
    giftHPPerCoin: 25,
    baseRadius: 24,
    maxRenderedRadius: 280,
    respawnInvulnerabilityMs: 1200
  },
  formulas: {
    sizeScale(hp) {
      return 1 + Math.min(hp / 220, 12);
    },
    damage(hp, classConfig) {
      return Math.max(1, Math.floor((2 + Math.floor(hp * 0.03)) * classConfig.damageMultiplier));
    },
    attackRange(radius, classConfig) {
      return Math.floor(radius + classConfig.attackRange);
    },
    moveSpeed(classConfig, hp) {
      const giantPenalty = Math.min(hp / 7000, 0.7);
      return Math.max(28, classConfig.speed * (1 - giantPenalty));
    }
  },
  aura: {
    thresholds: [
      { level: 1, hp: 1000, color: "#3df5ff", label: "Awakened" },
      { level: 2, hp: 3000, color: "#ffe45c", label: "Overcharged" },
      { level: 3, hp: 5000, color: "#ff4fd8", label: "Ascendant" }
    ]
  },
  combat: {
    targetScanIntervalMs: 450,
    attackCooldownMs: 780,
    maxPlayers: 200,
    idleWanderTurnChance: 0.03
  },
  physics: {
    friction: 0.988,
    steering: 0.075,
    orbitStrength: 0.34,
    collisionBounce: 0.92,
    collisionPush: 0.72,
    hitKnockback: 320,
    attackerRecoil: 90,
    maxVelocity: 580,
    spinJitter: 0.022,
    collisionCellSize: 280
  },
  ultimate: {
    cooldownMs: 45000,
    radius: 360,
    randomVictimsIfNoNearby: 7,
    maxEliminations: 18,
    damage: 999999,
    shockwaveMs: 1250
  },
  round: {
    resetSeconds: Number(process.env.ROUND_RESET_SECONDS || 8)
  },
  leaderboard: {
    limit: 3
  },
  audio: {
    masterVolume: 0.72,
    ambienceVolume: 0.13,
    sfxVolume: 0.82
  },
  classes: {
    Swordsman: {
      color: "#42d6ff",
      accent: "#e8fbff",
      damageTakenMultiplier: 1,
      damageMultiplier: 1,
      speed: 120,
      attackRange: 64,
      attackCooldownMultiplier: 1,
      ability: "Balanced duelist"
    },
    Tank: {
      color: "#66e68b",
      accent: "#eaffef",
      damageTakenMultiplier: 0.78,
      damageMultiplier: 0.82,
      speed: 84,
      attackRange: 58,
      attackCooldownMultiplier: 1.08,
      ability: "Hard to eliminate"
    },
    Assassin: {
      color: "#ff4f78",
      accent: "#fff0f4",
      damageTakenMultiplier: 1.12,
      damageMultiplier: 1.22,
      speed: 172,
      attackRange: 72,
      attackCooldownMultiplier: 0.72,
      ability: "Fast strikes"
    },
    Berserker: {
      color: "#ffb12f",
      accent: "#fff6df",
      damageTakenMultiplier: 0.96,
      damageMultiplier: 1.15,
      speed: 126,
      attackRange: 66,
      attackCooldownMultiplier: 0.94,
      ability: "Scales hard with HP"
    },
    Mage: {
      color: "#b96cff",
      accent: "#f8efff",
      damageTakenMultiplier: 1.04,
      damageMultiplier: 1.06,
      speed: 108,
      attackRange: 168,
      attackCooldownMultiplier: 1.2,
      ability: "Ranged burst"
    }
  }
};
