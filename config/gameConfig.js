const BASE_RADIUS = 104;
const MAX_RADIUS = 340;
const SIZE_CAP_HP = 1000;

export const gameConfig = {
  arena: {
    width: 1080,
    height: 1920,
    safePadding: 70
  },
  player: {
    baseHP: 25,
    giftHPPerCoin: 25,
    baseRadius: BASE_RADIUS,
    maxRenderedRadius: MAX_RADIUS,
    sizeCapHP: SIZE_CAP_HP,
    respawnInvulnerabilityMs: 1200
  },
  formulas: {
    sizeScale(hp) {
      const t = clamp(Number(hp) / SIZE_CAP_HP, 0, 1);
      const eased = t * t * (3 - 2 * t);
      const maxScale = MAX_RADIUS / BASE_RADIUS;
      return 1 + (maxScale - 1) * eased;
    },
    damage(hp, classConfig) {
      const baseDamage = hp <= 100 ? 1 : 1 + Math.floor(Math.max(0, hp - 101) / 140);
      const gearBlades = hp <= 25 ? 0 : Math.min(10, 2 + Math.floor(Math.max(0, hp - 26) / 100));
      const gearBonus = gearBlades <= 0 ? 0.7 : 0.9 + (gearBlades - 2) * 0.08;
      const hpPressure = 1 + Math.min(hp / 5000, 0.55);
      return Math.max(1, Math.floor(baseDamage * gearBonus * hpPressure * classConfig.damageMultiplier));
    },
    attackRange(radius, classConfig) {
      // Base = touching distance for two equal tops (2*radius).
      // Small class bonus so melee attacks when tops actually touch.
      return Math.floor(radius * 2 + classConfig.attackRange * 0.28);
    },
    moveSpeed(classConfig, hp) {
      const giantPenalty = Math.min(hp / 9000, 0.55);
      return Math.max(42, classConfig.speed * (1 - giantPenalty));
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
    targetScanIntervalMs: 60,
    attackCooldownMs: 1200,
    maxPlayers: 200,
    idleWanderTurnChance: 0.09,
    attackContactScale: 1.28,
    giantSlayerBonusHpStep: 500,
    giantSlayerMaxBonus: 12,
    wanderDurationMs: [80, 220],
    attackDurationMs: [5000, 9000],
    engageChance: 1,
    engageRadiusMultiplier: 12,
    postCollisionWanderMs: [35, 90],
    collisionDamageMinSpeed: 180,
    collisionDamageCooldownMs: 1000
  },
  physics: {
    friction: 0.996,
    steering: 0.24,
    orbitStrength: 0.58,
    collisionBounce: 1.16,
    collisionPush: 0.34,
    hitKnockback: 380,
    attackerRecoil: 130,
    maxVelocity: 1280,
    spinJitter: 0.12,
    collisionCellSize: 700,
    collisionContactScale: 0.86,
    centerPullStrength: 0.055,
    centerPullDeadzone: 240,
    boostImpulseBase: 220,
    boostImpulseMax: 680
  },
  laser: {
    cooldownMs: 2200,
    damageMult: 1,
    maxRange: 1200,
    minHp: 100
  },
  ultimate: {
    cooldownMs: 0,
    rayCount: 16,
    maxRange: 950,
    damageMult: 4,
    dashForce: 660
  },
  round: {
    resetSeconds: Number(process.env.ROUND_RESET_SECONDS || 8)
  },
  battleTimer: {
    enabled: false,
    durationSeconds: Number(process.env.BATTLE_TIMER_SECONDS || 0)
  },
  app: {
    version: "1.0.0",
    credit: "created by rizaru.plays"
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
      speed: 150,
      attackRange: 64,
      attackCooldownMultiplier: 1,
      ability: "Balanced duelist"
    },
    Tank: {
      color: "#66e68b",
      accent: "#eaffef",
      damageTakenMultiplier: 0.78,
      damageMultiplier: 0.82,
      speed: 112,
      attackRange: 58,
      attackCooldownMultiplier: 1.08,
      ability: "Hard to eliminate"
    },
    Assassin: {
      color: "#ff4f78",
      accent: "#fff0f4",
      damageTakenMultiplier: 1.12,
      damageMultiplier: 1.22,
      speed: 215,
      attackRange: 72,
      attackCooldownMultiplier: 0.72,
      ability: "Fast strikes"
    },
    Berserker: {
      color: "#ffb12f",
      accent: "#fff6df",
      damageTakenMultiplier: 0.96,
      damageMultiplier: 1.15,
      speed: 160,
      attackRange: 66,
      attackCooldownMultiplier: 0.94,
      ability: "Scales hard with HP"
    },
    Mage: {
      color: "#b96cff",
      accent: "#f8efff",
      damageTakenMultiplier: 1.04,
      damageMultiplier: 1.06,
      speed: 140,
      attackRange: 168,
      attackCooldownMultiplier: 1.2,
      ability: "Ranged burst"
    }
  }
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));
}
