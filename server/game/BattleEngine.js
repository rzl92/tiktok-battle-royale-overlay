export class BattleEngine {
  constructor({ io, playerManager, config }) {
    this.io = io;
    this.playerManager = playerManager;
    this.config = config;
    this.events = [];
    this.roundWinner = null;
    this.resetAt = 0;
    this.lastTick = Date.now();
    this.broadcastAccumulator = 0;
    this.hitEventBudget = 0;
    this.sparkEventBudget = 0;
  }

  start(tickRate) {
    const interval = 1000 / tickRate;
    setInterval(() => this.tick(), interval);
  }

  tick() {
    const now = Date.now();
    const dt = Math.min(0.08, (now - this.lastTick) / 1000);
    this.lastTick = now;

    const players = this.playerManager.getAlivePlayers();
    this.hitEventBudget = players.length > 100 ? 28 : players.length > 60 ? 42 : 90;
    this.sparkEventBudget = players.length > 80 ? 4 : players.length > 40 ? 8 : 14;
    if (players.length > 1) {
      this.roundWinner = null;
      this.resetAt = 0;
      this.updatePlayers(players, now, dt);
    } else if (players.length === 1) {
      this.handleWinner(players[0], now);
    }

    this.broadcastAccumulator += dt;
    if (this.broadcastAccumulator >= 1 / 12) {
      this.broadcastAccumulator = 0;
      this.io.emit("state", this.getSnapshot());
    }
  }

  updatePlayers(players, now, dt) {
    const byId = new Map(players.map((player) => [player.id, player]));

    for (const player of players) {
      if (now - player.lastTargetScanAt > this.config.combat.targetScanIntervalMs) {
        player.targetId = this.findTarget(player, players)?.id || null;
        player.lastTargetScanAt = now;
      }

      const target = byId.get(player.targetId);
      if (!target) {
        this.wander(player, dt);
        continue;
      }

      const dx = target.x - player.x;
      const dy = target.y - player.y;
      const distance = Math.hypot(dx, dy) || 1;
      const nx = dx / distance;
      const ny = dy / distance;

      // Effective attack range: use whichever is larger — the stored attackRange stat OR
      // the actual physical contact distance between the two tops (radius + target.radius).
      // Without this, a small top facing a giant can never enter attack mode because the
      // giant's body pushes it back before it reaches its own small attackRange threshold.
      const physicalContactDist = player.radius + target.radius;
      const effectiveRange = Math.max(player.attackRange, physicalContactDist * 1.1);

      if (distance > effectiveRange * 0.92) {
        const orbit = distance < effectiveRange * 2.2 ? this.config.physics.orbitStrength : 0.08;
        const desiredX = nx * player.speed + -ny * player.speed * orbit;
        const desiredY = ny * player.speed + nx * player.speed * orbit;
        this.steer(player, desiredX, desiredY);
        this.move(player, dt);
      } else {
        const circle = Math.random() < 0.5 ? 1 : -1;
        this.steer(player, -ny * player.speed * 0.55 * circle, nx * player.speed * 0.55 * circle);
        this.move(player, dt);
        this.tryAttack(player, target, now);
      }
    }

    this.resolveCollisions(players);
  }

  findTarget(player, players) {
    let best = null;
    let bestScore = Infinity;
    let randomPick = null;
    let seen = 0;

    for (const candidate of players) {
      if (candidate.id === player.id || !candidate.alive) continue;
      seen += 1;
      if (Math.random() < 1 / seen) randomPick = candidate;

      let score = distanceSq(player, candidate) + candidate.hp * 3.5;
      // Sticky bias: current target gets 30% score discount so we don't flip too often
      if (candidate.id === player.targetId) score *= 0.7;
      if (score < bestScore) {
        bestScore = score;
        best = candidate;
      }
    }

    if (!best) return null;
    // 80% pick best (closest/weakest), 20% pick random for variety
    return Math.random() < 0.80 ? best : randomPick || best;
  }

  tryAttack(attacker, target, now) {
    // Jitter ±22% so attack timing feels natural and asymmetric
    const jitter = 0.78 + Math.random() * 0.44;
    const cooldown = this.config.combat.attackCooldownMs * attacker.classConfig.attackCooldownMultiplier * jitter;
    if (now - attacker.lastAttackAt < cooldown) return;
    attacker.lastAttackAt = now;

    const variance = 0.85 + Math.random() * 0.35;
    const rawDamage = Math.max(1, Math.floor(attacker.damage * variance * target.classConfig.damageTakenMultiplier));
    // Every top can always chip the target: minimum 1% of target's current HP per hit.
    // This ensures no top is immortal regardless of HP gap, while big tops still dominate.
    const minDamage = Math.max(1, Math.ceil(target.hp * 0.010));
    const damage = Math.max(rawDamage, minDamage);
    this.damagePlayer({ attacker, target, damage, type: attacker.className === "Mage" ? "burst" : "strike" });

    const dx = target.x - attacker.x;
    const dy = target.y - attacker.y;
    const distance = Math.hypot(dx, dy) || 1;
    const nx = dx / distance;
    const ny = dy / distance;
    const force = this.config.physics.hitKnockback + Math.min(260, attacker.damage * 4);
    target.vx += nx * force;
    target.vy += ny * force;
    attacker.vx -= nx * this.config.physics.attackerRecoil;
    attacker.vy -= ny * this.config.physics.attackerRecoil;
    this.capVelocity(target);
    this.capVelocity(attacker);
  }

  damagePlayer({ attacker, target, damage, type }) {
    target.hp -= damage;
    target.maxSeenHP = Math.max(target.maxSeenHP, target.hp);
    this.playerManager.recalculateDerivedStats(target);
    if (this.hitEventBudget > 0) {
      this.hitEventBudget -= 1;
      this.pushEvent({
        type: "hit",
        attackerId: attacker.id,
        targetId: target.id,
        x: target.x,
        y: target.y,
        damage,
        hitType: type
      });
    }

    // Retaliation: if target is still alive, immediately switch its focus to the attacker
    // so combat feels mutual rather than one-sided.
    if (target.alive && target.targetId !== attacker.id && Math.random() < 0.75) {
      target.targetId = attacker.id;
      target.lastTargetScanAt = Date.now(); // defer next scan so target stays locked
    }

    if (target.hp <= 0 && target.alive) {
      this.eliminate(target, attacker, type);
    }
  }

  triggerUltimate(username) {
    const joined = this.playerManager.join(username);
    const caster = joined.player;
    if (!caster) return { ok: false, error: joined.error || "Unable to create caster" };

    const now = Date.now();
    const remaining = this.config.ultimate.cooldownMs - (now - caster.lastUltimateAt);
    if (remaining > 0) {
      return { ok: false, player: caster, cooldownMs: remaining };
    }
    caster.lastUltimateAt = now;

    const enemies = [];
    const nearby = [];
    const radiusSq = this.config.ultimate.radius * this.config.ultimate.radius;

    for (const player of this.playerManager.getAlivePlayers()) {
      if (player.id === caster.id) continue;
      enemies.push(player);
      if (distanceSq(caster, player) <= radiusSq) nearby.push(player);
    }

    const victims = (nearby.length ? nearby : shuffle(enemies).slice(0, this.config.ultimate.randomVictimsIfNoNearby)).slice(
      0,
      this.config.ultimate.maxEliminations
    );

    this.pushEvent({
      type: "ultimate",
      casterId: caster.id,
      casterName: caster.username,
      x: caster.x,
      y: caster.y,
      radius: this.config.ultimate.radius,
      victimIds: victims.map((victim) => victim.id)
    });

    for (const victim of victims) {
      this.eliminate(victim, caster, "ultimate");
    }

    return { ok: true, player: caster, eliminated: victims.length };
  }

  eliminate(target, killer, cause) {
    if (!target.alive) return;
    killer.kills += 1;
    this.playerManager.removeDead(target);
    this.pushEvent({
      type: "death",
      killerId: killer.id,
      killerName: killer.username,
      targetId: target.id,
      targetName: target.username,
      x: target.x,
      y: target.y,
      cause
    });
  }

  handleWinner(winner, now) {
    if (!this.roundWinner) {
      this.roundWinner = {
        username: winner.username,
        kills: winner.kills,
        className: winner.className,
        hp: Math.max(0, Math.floor(winner.hp))
      };
      this.resetAt = 0;
      this.pushEvent({ type: "winner", winner: this.roundWinner, resetAt: 0 });
    }
  }

  manualReset() {
    this.pushEvent({ type: "roundReset" });
    this.playerManager.resetArena();
    this.roundWinner = null;
    this.resetAt = 0;
  }

  wander(player, dt) {
    if (Math.random() < this.config.combat.idleWanderTurnChance) {
      const angle = Math.random() * Math.PI * 2;
      player.vx += Math.cos(angle) * player.speed * 0.45;
      player.vy += Math.sin(angle) * player.speed * 0.45;
    }
    player.vx += (Math.random() - 0.5) * player.speed * this.config.physics.spinJitter;
    player.vy += (Math.random() - 0.5) * player.speed * this.config.physics.spinJitter;
    this.move(player, dt);
  }

  move(player, dt) {
    player.vx *= this.config.physics.friction;
    player.vy *= this.config.physics.friction;
    this.capVelocity(player);

    player.x += player.vx * dt;
    player.y += player.vy * dt;

    const pad = this.config.arena.safePadding + player.radius;
    if (player.x < pad || player.x > this.config.arena.width - pad) {
      player.vx *= -this.config.physics.collisionBounce;
      player.x = clamp(player.x, pad, this.config.arena.width - pad);
    }
    if (player.y < pad + 100 || player.y > this.config.arena.height - pad) {
      player.vy *= -this.config.physics.collisionBounce;
      player.y = clamp(player.y, pad + 100, this.config.arena.height - pad);
    }
  }

  steer(player, desiredX, desiredY) {
    const steering = this.config.physics.steering;
    player.vx += (desiredX - player.vx) * steering;
    player.vy += (desiredY - player.vy) * steering;
  }

  resolveCollisions(players) {
    const cellSize = this.config.physics.collisionCellSize;
    const grid = new Map();

    for (const player of players) {
      const cx = Math.floor(player.x / cellSize);
      const cy = Math.floor(player.y / cellSize);
      const key = `${cx},${cy}`;
      if (!grid.has(key)) grid.set(key, []);
      grid.get(key).push(player);
    }

    const checked = new Set();
    for (const [key, bucket] of grid.entries()) {
      const [cx, cy] = key.split(",").map(Number);
      for (let ox = -1; ox <= 1; ox += 1) {
        for (let oy = -1; oy <= 1; oy += 1) {
          const other = grid.get(`${cx + ox},${cy + oy}`);
          if (!other) continue;
          this.resolveBuckets(bucket, other, checked);
        }
      }
    }
  }

  resolveBuckets(a, b, checked) {
    for (const p1 of a) {
      for (const p2 of b) {
        if (p1.id === p2.id) continue;
        const pairKey = p1.id < p2.id ? `${p1.id}:${p2.id}` : `${p2.id}:${p1.id}`;
        if (checked.has(pairKey)) continue;
        checked.add(pairKey);
        this.resolvePair(p1, p2);
      }
    }
  }

  resolvePair(a, b) {
    // 0.97 so physics fires just as tops visually touch (near-perfect surface contact)
    const minDist = (a.radius + b.radius) * 0.97;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const distSq = dx * dx + dy * dy;
    if (distSq <= 0.0001 || distSq >= minDist * minDist) return;

    const dist = Math.sqrt(distSq);
    const nx = dx / dist;
    const ny = dy / dist;
    const overlap = minDist - dist;
    const massA = Math.max(1, a.radius);
    const massB = Math.max(1, b.radius);
    const totalMass = massA + massB;
    const push = overlap * this.config.physics.collisionPush;

    a.x -= nx * push * (massB / totalMass);
    a.y -= ny * push * (massB / totalMass);
    b.x += nx * push * (massA / totalMass);
    b.y += ny * push * (massA / totalMass);

    const relativeVx = b.vx - a.vx;
    const relativeVy = b.vy - a.vy;
    const separatingVelocity = relativeVx * nx + relativeVy * ny;
    if (separatingVelocity > 0) return;

    const impulse = (-(1 + this.config.physics.collisionBounce) * separatingVelocity) / (1 / massA + 1 / massB);
    const impulseX = impulse * nx;
    const impulseY = impulse * ny;
    a.vx -= impulseX / massA;
    a.vy -= impulseY / massA;
    b.vx += impulseX / massB;
    b.vy += impulseY / massB;
    this.capVelocity(a);
    this.capVelocity(b);

    // Spark at contact surface point (only if collision has meaningful speed)
    const impactSpeed = Math.abs(separatingVelocity);
    if (this.sparkEventBudget > 0 && impactSpeed > 40) {
      this.sparkEventBudget -= 1;
      // Contact point: on surface of a toward b
      this.pushEvent({
        type: "spark",
        x: a.x + nx * a.radius,
        y: a.y + ny * a.radius,
        angle: Math.atan2(ny, nx),
        speed: Math.min(1, impactSpeed / 300)
      });
    }
  }

  capVelocity(player) {
    const max = this.config.physics.maxVelocity;
    const speed = Math.hypot(player.vx, player.vy);
    if (speed <= max || speed <= 0) return;
    player.vx = (player.vx / speed) * max;
    player.vy = (player.vy / speed) * max;
  }

  pushEvent(event) {
    const enriched = { ...event, id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, at: Date.now() };
    this.events.push(enriched);
    this.events = this.events.slice(-80);
    this.io.emit("events", [enriched]);
  }

  getRecentEvents() {
    return this.events.slice(-25);
  }

  getSnapshot() {
    const players = this.playerManager.getAlivePlayers();
    const publicPlayers = players.map((player) => publicPlayer(player));
    return {
      now: Date.now(),
      players: publicPlayers,
      leaderboard: publicPlayers
        .slice()
        .sort((a, b) => b.kills - a.kills || b.hp - a.hp)
        .slice(0, this.config.leaderboard.limit),
      roundWinner: this.roundWinner,
      resetAt: this.resetAt
    };
  }
}

function publicPlayer(player) {
  return {
    id: player.id,
    username: player.username,
    className: player.className,
    hp: Math.max(0, Math.floor(player.hp)),
    maxSeenHP: Math.max(1, Math.floor(player.maxSeenHP)),
    kills: player.kills,
    x: player.x,
    y: player.y,
    radius: player.radius,
    sizeScale: player.sizeScale,
    damage: player.damage,
    attackRange: player.attackRange,
    auraLevel: player.auraLevel,
    avatarUrl: player.avatarUrl,
    color: player.classConfig.color,
    accent: player.classConfig.accent
  };
}

function distanceSq(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function shuffle(items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}
