const TWO_PI = Math.PI * 2;
const MAX_EFFECTS = 70;

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d", { alpha: true });
    this.config = null;
    this.state = { players: [], leaderboard: [] };
    this.effects = [];
    this.displayPlayers = new Map();
    this.avatarCache = new Map();
    this.camera = { x: 540, y: 960 };
    this.lastTime = 0;
    this.background = document.createElement("canvas");
    this.backgroundDirty = true;

    this.resize();
    window.addEventListener("resize", () => this.resize());
  }

  setConfig(config) {
    this.config = config;
    this.backgroundDirty = true;
  }

  setState(state) {
    this.state = state || { players: [], leaderboard: [] };
    this.syncDisplayPlayers(this.state.players || []);
    this.updateCamera();
  }

  syncDisplayPlayers(players) {
    const alive = new Set();
    for (const player of players) {
      alive.add(player.id);
      const current = this.displayPlayers.get(player.id);
      if (!current) {
        this.displayPlayers.set(player.id, { ...player, targetX: player.x, targetY: player.y });
      } else {
        Object.assign(current, player, {
          x: current.x,
          y: current.y,
          targetX: player.x,
          targetY: player.y
        });
      }
    }

    for (const id of this.displayPlayers.keys()) {
      if (!alive.has(id)) this.displayPlayers.delete(id);
    }
  }

  addEvent(event) {
    if (event.type === "spark") {
      this.pushEffect({ kind: "spark", x: event.x, y: event.y, angle: event.angle || 0, speed: event.speed || 0.5, life: 240, max: 240 });
    }
    if (event.type === "hit") {
      this.pushEffect({ kind: "hit", x: event.x, y: event.y, damage: event.damage, life: 360, max: 360 });
    }
    if (event.type === "death") {
      this.pushEffect({ kind: "burst", x: event.x, y: event.y, color: "#ff3d6e", life: 620, max: 620 });
    }
    if (event.type === "gift") {
      this.pushEffect({
        kind: "power",
        x: event.x,
        y: event.y,
        color: event.auraLeveled ? "#ffd84d" : "#4df7ff",
        life: 760,
        max: 760
      });
    }
    if (event.type === "ultimate") {
      this.pushEffect({ kind: "flash", life: 320, max: 320 });
      this.pushEffect({
        kind: "lightning",
        x: event.x,
        y: event.y,
        rays: event.rays || [],
        life: 900,
        max: 900
      });
    }
  }

  pushEffect(effect) {
    this.effects.push(effect);
    if (this.effects.length > MAX_EFFECTS) {
      this.effects.splice(0, this.effects.length - MAX_EFFECTS);
    }
  }

  resize() {
    const dpr = 1;
    this.canvas.width = Math.floor(window.innerWidth * dpr);
    this.canvas.height = Math.floor(window.innerHeight * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    this.background.width = Math.floor(window.innerWidth * dpr);
    this.background.height = Math.floor(window.innerHeight * dpr);
    this.background.getContext("2d").setTransform(dpr, 0, 0, dpr, 0, 0);
    this.backgroundDirty = true;
  }

  updateCamera() {
    const leaders = this.state.leaderboard || [];
    const targetId = leaders[0]?.id;
    const target = (this.state.players || []).find((player) => player.id === targetId) || strongest(this.state.players);
    if (!target) return;
    this.camera.x += (target.x - this.camera.x) * 0.018;
    this.camera.y += (target.y - this.camera.y) * 0.018;
  }

  render(time) {
    const dt = Math.min(40, time - (this.lastTime || time));
    this.lastTime = time;

    const ctx = this.ctx;
    const width = window.innerWidth;
    const height = window.innerHeight;
    const players = this.state.players || [];
    const displayPlayers = this.updateDisplayPositions(dt);
    const detail = getDetailLevel(displayPlayers.length);

    if (this.backgroundDirty) this.drawBackground();
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(this.background, 0, 0, width, height);

    const sorted = [...displayPlayers].sort((a, b) => a.radius - b.radius);
    const nameBudget = detail === "low" ? 6 : detail === "medium" ? 12 : 999;
    const featured = new Set(
      [...displayPlayers]
        .sort((a, b) => b.kills - a.kills || b.hp - a.hp)
        .slice(0, nameBudget)
        .map((player) => player.id)
    );

    for (const player of sorted) {
      this.drawTop(player, time, featured.has(player.id) || detail === "high", detail);
    }

    this.drawEffects(dt, detail);
  }

  updateDisplayPositions(dt) {
    const alpha = Math.min(0.38, 1 - Math.pow(0.001, dt / 220));
    for (const player of this.displayPlayers.values()) {
      player.x += (player.targetX - player.x) * alpha;
      player.y += (player.targetY - player.y) * alpha;
    }
    return [...this.displayPlayers.values()];
  }

  drawBackground() {
    const ctx = this.background.getContext("2d");
    const width = window.innerWidth;
    const height = window.innerHeight;
    ctx.clearRect(0, 0, width, height);

    const bg = ctx.createLinearGradient(0, 0, width, height);
    bg.addColorStop(0, "#071015");
    bg.addColorStop(0.42, "#16120d");
    bg.addColorStop(1, "#061614");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);

    ctx.save();
    ctx.globalAlpha = 0.12;
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1;
    const step = Math.max(58, Math.min(width, height) / 12);
    for (let x = -step; x < width + step; x += step) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x - width * 0.2, height);
      ctx.stroke();
    }
    for (let y = -step; y < height + step; y += step) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y - height * 0.1);
      ctx.stroke();
    }
    ctx.restore();


    this.backgroundDirty = false;
  }

  drawTop(player, time, showName, detail) {
    const ctx = this.ctx;
    const screen = this.worldToScreen(player);
    const r = Math.max(10, player.radius * screen.scale);
    const profile = topProfile(player.id, player.className);
    const spin = time * profile.spin + player.x * 0.017;
    const wobble = Math.sin(time * 0.006 + player.y * 0.04) * r * 0.035;
    const x = screen.x;
    const y = screen.y + wobble;

    if (detail === "low") {
      this.drawSimpleTop(x, y, r, player, spin, showName);
      return;
    }

    if (player.auraLevel > 0) this.drawAura(x, y, r, player, time, detail);
    if (detail === "high") this.drawShadow(x, y, r);
    if (detail !== "medium" || player.auraLevel > 0) this.drawSpeedLines(x, y, r, spin, player);

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(spin);
    ctx.shadowColor = player.auraLevel ? this.getAuraColor(player) : player.color;
    ctx.shadowBlur = player.auraLevel ? 16 + player.auraLevel * 8 : 8;

    this.drawAttackRing(r, player, profile);
    this.drawMetalDisk(r, player, profile);
    this.drawCenterCore(r, player, spin);
    ctx.restore();

    if (r > 14 && (detail === "high" || showName || player.auraLevel > 0)) this.drawAvatar(player, x, y, r * 0.52);
    if (showName) this.drawNameplate(player, x, y, r);
  }

  drawSimpleTop(x, y, r, player, spin, showName) {
    const ctx = this.ctx;
    const blades = player.auraLevel > 0 ? 6 : 4;
    const auraColor = this.getAuraColor(player);

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(spin);

    if (player.auraLevel > 0) {
      ctx.globalCompositeOperation = "lighter";
      ctx.fillStyle = hexToRgba(auraColor, 0.18);
      ctx.beginPath();
      ctx.arc(0, 0, r * (1.35 + player.auraLevel * 0.12), 0, TWO_PI);
      ctx.fill();
      ctx.globalCompositeOperation = "source-over";
    }

    ctx.fillStyle = player.color;
    ctx.strokeStyle = "#061016";
    ctx.lineWidth = Math.max(2, r * 0.045);
    for (let i = 0; i < blades; i += 1) {
      const a = (i / blades) * TWO_PI;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a - 0.15) * r * 0.62, Math.sin(a - 0.15) * r * 0.62);
      ctx.lineTo(Math.cos(a + 0.1) * r * 1.38, Math.sin(a + 0.1) * r * 1.38);
      ctx.lineTo(Math.cos(a + 0.2) * r * 0.62, Math.sin(a + 0.2) * r * 0.62);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    const disk = ctx.createRadialGradient(-r * 0.22, -r * 0.24, 1, 0, 0, r * 0.82);
    disk.addColorStop(0, player.accent);
    disk.addColorStop(0.55, player.color);
    disk.addColorStop(1, "#081018");
    ctx.fillStyle = disk;
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.78, 0, TWO_PI);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#eefaff";
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.22, 0, TWO_PI);
    ctx.fill();
    ctx.restore();

    if (showName) this.drawNameplate(player, x, y, r);
  }

  drawAttackRing(r, player, profile) {
    const ctx = this.ctx;
    ctx.save();
    ctx.strokeStyle = "#061016";
    ctx.lineWidth = Math.max(2, r * 0.045);

    for (let i = 0; i < profile.blades; i += 1) {
      const angle = (i / profile.blades) * TWO_PI;
      const blade = buildBlade(r, angle, profile);
      const gradient = ctx.createLinearGradient(blade.root.x, blade.root.y, blade.tip.x, blade.tip.y);
      gradient.addColorStop(0, "#111a22");
      gradient.addColorStop(0.34, player.color);
      gradient.addColorStop(0.72, player.accent);
      gradient.addColorStop(1, "#ffffff");

      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.moveTo(blade.back.x, blade.back.y);
      ctx.quadraticCurveTo(blade.shoulderA.x, blade.shoulderA.y, blade.edgeA.x, blade.edgeA.y);
      ctx.lineTo(blade.tip.x, blade.tip.y);
      ctx.quadraticCurveTo(blade.edgeB.x, blade.edgeB.y, blade.shoulderB.x, blade.shoulderB.y);
      ctx.lineTo(blade.back.x, blade.back.y);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.strokeStyle = "rgba(255, 255, 255, 0.42)";
      ctx.lineWidth = Math.max(1, r * 0.018);
      ctx.beginPath();
      ctx.moveTo(blade.root.x, blade.root.y);
      ctx.lineTo(blade.tip.x, blade.tip.y);
      ctx.stroke();
      ctx.strokeStyle = "#061016";
      ctx.lineWidth = Math.max(2, r * 0.045);
    }

    ctx.strokeStyle = "rgba(230, 248, 255, 0.38)";
    ctx.lineWidth = Math.max(2, r * 0.03);
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.92, 0, TWO_PI);
    ctx.stroke();
    ctx.restore();
  }

  drawMetalDisk(r, player, profile) {
    const ctx = this.ctx;
    const disk = ctx.createRadialGradient(-r * 0.28, -r * 0.3, r * 0.08, 0, 0, r * 0.88);
    disk.addColorStop(0, "#ffffff");
    disk.addColorStop(0.18, player.accent);
    disk.addColorStop(0.48, player.color);
    disk.addColorStop(0.8, "#222d36");
    disk.addColorStop(1, "#081018");
    ctx.fillStyle = disk;
    ctx.strokeStyle = "#061016";
    ctx.lineWidth = Math.max(2, r * 0.06);
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.78, 0, TWO_PI);
    ctx.fill();
    ctx.stroke();

    for (let i = 0; i < profile.panels; i += 1) {
      ctx.save();
      ctx.rotate((i / profile.panels) * TWO_PI);
      ctx.fillStyle = i % 2 ? "rgba(255, 255, 255, 0.2)" : hexToRgba(player.accent, 0.48);
      ctx.beginPath();
      ctx.moveTo(-r * 0.08, -r * 0.72);
      ctx.lineTo(r * 0.16, -r * 0.25);
      ctx.lineTo(r * 0.09, r * 0.48);
      ctx.lineTo(-r * 0.09, r * 0.48);
      ctx.lineTo(-r * 0.16, -r * 0.25);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    ctx.strokeStyle = "rgba(255, 255, 255, 0.48)";
    ctx.lineWidth = Math.max(1, r * 0.025);
    for (const ring of [0.36, 0.55, 0.72]) {
      ctx.beginPath();
      ctx.arc(0, 0, r * ring, 0, TWO_PI);
      ctx.stroke();
    }
  }

  drawCenterCore(r, player, spin) {
    const ctx = this.ctx;
    ctx.rotate(-spin * 0.65);
    ctx.fillStyle = "#eefaff";
    ctx.strokeStyle = "#061016";
    ctx.lineWidth = Math.max(2, r * 0.04);
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.25, 0, TWO_PI);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = player.color;
    for (let i = 0; i < 6; i += 1) {
      const angle = (i / 6) * TWO_PI;
      ctx.beginPath();
      ctx.arc(Math.cos(angle) * r * 0.34, Math.sin(angle) * r * 0.34, Math.max(1.8, r * 0.035), 0, TWO_PI);
      ctx.fill();
    }
  }

  drawAura(x, y, r, player, time, detail) {
    const ctx = this.ctx;
    const color = this.getAuraColor(player);
    const level = player.auraLevel;
    const pulse = 0.5 + Math.sin(time * 0.009) * 0.5;

    ctx.save();
    ctx.globalCompositeOperation = "lighter";

    const glow = ctx.createRadialGradient(x, y, r * 0.45, x, y, r * (1.5 + level * 0.22));
    glow.addColorStop(0, hexToRgba(color, 0.18));
    glow.addColorStop(0.52, hexToRgba(color, 0.12));
    glow.addColorStop(1, "rgba(255, 255, 255, 0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(x, y, r * (1.5 + level * 0.24), 0, TWO_PI);
    ctx.fill();

    const spikes = detail === "medium" ? 8 + level * 2 : 10 + level * 4;
    ctx.fillStyle = hexToRgba(color, 0.24);
    for (let i = 0; i < spikes; i += 1) {
      const angle = (i / spikes) * TWO_PI + time * 0.002;
      const inner = r * (0.98 + (i % 2) * 0.08);
      const outer = r * (1.45 + level * 0.16 + pulse * 0.12);
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(angle - 0.08) * inner, y + Math.sin(angle - 0.08) * inner);
      ctx.lineTo(x + Math.cos(angle) * outer, y + Math.sin(angle) * outer);
      ctx.lineTo(x + Math.cos(angle + 0.08) * inner, y + Math.sin(angle + 0.08) * inner);
      ctx.closePath();
      ctx.fill();
    }

    ctx.strokeStyle = hexToRgba(color, 0.45);
    ctx.lineWidth = 2 + level;
    const rings = detail === "medium" ? 1 : level + 1;
    for (let i = 0; i < rings; i += 1) {
      ctx.beginPath();
      ctx.arc(x, y, r * (1.08 + i * 0.18 + pulse * 0.06), 0, TWO_PI);
      ctx.stroke();
    }
    ctx.restore();
  }

  drawShadow(x, y, r) {
    const ctx = this.ctx;
    ctx.save();
    ctx.fillStyle = "rgba(0, 0, 0, 0.34)";
    ctx.beginPath();
    ctx.ellipse(x, y + r * 0.58, r * 0.9, r * 0.24, 0, 0, TWO_PI);
    ctx.fill();
    ctx.restore();
  }

  drawSpeedLines(x, y, r, spin, player) {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(spin * 0.38);
    ctx.globalCompositeOperation = "lighter";
    ctx.strokeStyle = hexToRgba(player.accent, 0.18);
    ctx.lineWidth = Math.max(2, r * 0.04);
    for (let i = 0; i < 5; i += 1) {
      ctx.rotate(TWO_PI / 5);
      ctx.beginPath();
      ctx.arc(0, 0, r * (0.96 + i * 0.045), -0.2, 1.18);
      ctx.stroke();
    }
    ctx.restore();
  }

  drawAvatar(player, x, y, r) {
    const ctx = this.ctx;
    const image = this.getImage(player.avatarUrl);
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TWO_PI);
    ctx.clip();
    if (image?.complete && image.naturalWidth) {
      ctx.drawImage(image, x - r, y - r, r * 2, r * 2);
    } else {
      const fallback = ctx.createRadialGradient(x - r * 0.25, y - r * 0.25, 1, x, y, r);
      fallback.addColorStop(0, player.accent);
      fallback.addColorStop(1, player.color);
      ctx.fillStyle = fallback;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
      ctx.fillStyle = "rgba(0, 0, 0, 0.42)";
      ctx.font = `900 ${Math.max(12, r * 0.95)}px system-ui`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(player.username.slice(0, 1).toUpperCase(), x, y);
    }
    ctx.restore();

    ctx.strokeStyle = "rgba(255, 255, 255, 0.78)";
    ctx.lineWidth = Math.max(1.5, r * 0.1);
    ctx.beginPath();
    ctx.arc(x, y, r + 1, 0, TWO_PI);
    ctx.stroke();
  }

  drawNameplate(player, x, y, r) {
    const ctx = this.ctx;
    const width = Math.max(86, Math.min(172, r * 2.55));
    const top = y - r - 43;
    const hpPercent = Math.max(0.04, Math.min(1, player.hp / Math.max(player.maxSeenHP, player.hp, 1)));

    ctx.save();
    ctx.fillStyle = "rgba(3, 8, 13, 0.72)";
    roundRect(ctx, x - width / 2, top, width, 32, 8);
    ctx.fill();

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#ffffff";
    ctx.font = "900 14px system-ui";
    ctx.fillText(trimName(player.username), x, top + 10);
    ctx.fillStyle = "#b9c9d6";
    ctx.font = "800 10px system-ui";
    ctx.fillText(`${player.hp} HP / ${player.kills} P`, x, top + 23);

    ctx.fillStyle = "rgba(0, 0, 0, 0.75)";
    roundRect(ctx, x - width / 2, top + 36, width, 8, 4);
    ctx.fill();
    ctx.fillStyle = hpBarColor(hpPercent, player.hp, this.getAuraColor(player));
    roundRect(ctx, x - width / 2, top + 36, width * hpPercent, 8, 4);
    ctx.fill();
    ctx.restore();
  }

  drawEffects(dt, detail) {
    const ctx = this.ctx;
    this.effects = this.effects.filter((effect) => {
      effect.life -= dt;
      const t = Math.max(0, effect.life / effect.max);

      if (effect.kind === "flash") {
        ctx.fillStyle = `rgba(255, 244, 174, ${0.2 * t})`;
        ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);
        return effect.life > 0;
      }

      const point = this.worldToScreen(effect);
      ctx.save();
      ctx.globalCompositeOperation = effect.kind === "ultimate" ? "lighter" : "source-over";

      if (effect.kind === "spark" && detail !== "low") {
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        // 8 spokes radiating from contact point, half spread symmetrically
        const spokes = 8;
        const baseAngle = effect.angle;
        const spreadHalf = Math.PI * 0.55; // 110-degree fan on each side
        const maxLen = (10 + effect.speed * 18) * point.scale;
        for (let i = 0; i < spokes; i++) {
          const a = baseAngle + Math.PI + (i / (spokes - 1) - 0.5) * spreadHalf * 2;
          const len = maxLen * t * (0.6 + 0.4 * Math.sin((i / spokes) * Math.PI));
          const r = Math.floor(255);
          const g = Math.floor(160 + 95 * t);
          ctx.strokeStyle = `rgba(${r},${g},40,${t * 0.9})`;
          ctx.lineWidth = (1.2 + t) * point.scale;
          ctx.beginPath();
          ctx.moveTo(point.x, point.y);
          ctx.lineTo(point.x + Math.cos(a) * len, point.y + Math.sin(a) * len);
          ctx.stroke();
        }
        // Small bright flash dot at contact
        ctx.fillStyle = `rgba(255,255,200,${t * 0.8})`;
        ctx.beginPath();
        ctx.arc(point.x, point.y, 3 * t * point.scale, 0, TWO_PI);
        ctx.fill();
        ctx.restore();
      }

      if (effect.kind === "hit" && detail !== "low") {
        ctx.strokeStyle = `rgba(235, 251, 255, ${0.85 * t})`;
        ctx.lineWidth = 2 + 7 * t;
        ctx.beginPath();
        ctx.arc(point.x, point.y, 14 + 44 * (1 - t), -0.75, 0.9);
        ctx.stroke();

        ctx.fillStyle = `rgba(255, 241, 168, ${t})`;
        ctx.font = "900 23px system-ui";
        ctx.textAlign = "center";
        ctx.fillText(`-${effect.damage}`, point.x, point.y - 26 * (1 - t));
      }

      if ((effect.kind === "burst" || effect.kind === "power") && detail !== "low") {
        ctx.globalCompositeOperation = "lighter";
        ctx.strokeStyle = hexToRgba(effect.color, 0.75 * t);
        ctx.lineWidth = 4 + 8 * t;
        ctx.beginPath();
        ctx.arc(point.x, point.y, 18 + 82 * (1 - t), 0, TWO_PI);
        ctx.stroke();
      }

      if (effect.kind === "lightning") {
        ctx.globalCompositeOperation = "lighter";
        for (const ray of effect.rays) {
          const ex = effect.x + Math.cos(ray.angle) * ray.length;
          const ey = effect.y + Math.sin(ray.angle) * ray.length;
          const endPt = this.worldToScreen({ x: ex, y: ey });
          drawLightningBolt(ctx, point.x, point.y, endPt.x, endPt.y, t, ray.hit, point.scale);
        }
        // Expanding discharge ring at caster
        const ringR = (18 + 90 * (1 - t)) * point.scale;
        ctx.strokeStyle = `rgba(180, 230, 255, ${t * 0.7})`;
        ctx.lineWidth = (2 + 4 * t) * point.scale;
        ctx.beginPath();
        ctx.arc(point.x, point.y, ringR, 0, TWO_PI);
        ctx.stroke();
        // Bright core flash at caster origin
        const coreR = 12 * t * point.scale;
        ctx.fillStyle = `rgba(255, 255, 220, ${t * 0.9})`;
        ctx.beginPath();
        ctx.arc(point.x, point.y, coreR, 0, TWO_PI);
        ctx.fill();
      }

      ctx.restore();
      return effect.life > 0;
    });
  }

  worldToScreen(point) {
    const arena = this.config?.arena || { width: 1080, height: 1920 };
    const scale = Math.min(window.innerWidth / arena.width, window.innerHeight / arena.height) * 1.06;
    const parallaxX = (this.camera.x - arena.width / 2) * 0.045;
    const parallaxY = (this.camera.y - arena.height / 2) * 0.045;
    return {
      x: window.innerWidth / 2 + (point.x - arena.width / 2 - parallaxX) * scale,
      y: window.innerHeight / 2 + (point.y - arena.height / 2 - parallaxY) * scale,
      scale
    };
  }

  getAuraColor(player) {
    const threshold = this.config?.aura?.thresholds?.find((item) => item.level === player.auraLevel);
    return threshold?.color || player.color;
  }

  getImage(url) {
    if (!url) return null;
    if (this.avatarCache.has(url)) return this.avatarCache.get(url);
    const proxied = (url.startsWith("http://") || url.startsWith("https://"))
      ? `/avatar-proxy?url=${encodeURIComponent(url)}`
      : url;
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.src = proxied;
    this.avatarCache.set(url, image);
    return image;
  }
}

function buildBlade(r, angle, profile) {
  const base = r * profile.base;
  const length = r * profile.length;
  const width = r * profile.width;
  const hook = profile.hook;

  const root = polar(angle, base);
  const back = polar(angle - 0.18, base * 0.95);
  const shoulderA = polar(angle - 0.08, base + length * 0.24);
  const edgeA = offsetPolar(angle, base + length * 0.4, width);
  const tip = polar(angle + hook, base + length);
  const edgeB = offsetPolar(angle, base + length * 0.38, -width);
  const shoulderB = polar(angle + 0.13, base + length * 0.18);
  return { root, back, shoulderA, edgeA, tip, edgeB, shoulderB };
}

function polar(angle, radius) {
  return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
}

function offsetPolar(angle, radius, offset) {
  return {
    x: Math.cos(angle) * radius - Math.sin(angle) * offset,
    y: Math.sin(angle) * radius + Math.cos(angle) * offset
  };
}

function topProfile(id, className) {
  const profiles = {
    Swordsman: { blades: 6, length: 0.64, width: 0.16, base: 0.68, panels: 6, hook: 0.14, spin: 0.012 },
    Tank: { blades: 8, length: 0.44, width: 0.22, base: 0.74, panels: 8, hook: 0.08, spin: 0.009 },
    Assassin: { blades: 10, length: 0.74, width: 0.11, base: 0.64, panels: 10, hook: 0.18, spin: 0.016 },
    Berserker: { blades: 7, length: 0.86, width: 0.2, base: 0.7, panels: 7, hook: 0.16, spin: 0.013 },
    Mage: { blades: 9, length: 0.56, width: 0.13, base: 0.66, panels: 9, hook: 0.2, spin: 0.011 }
  };
  const profile = profiles[className] || profiles.Swordsman;
  const variant = stableHash(id) % 3;
  return {
    ...profile,
    length: profile.length + variant * 0.035,
    hook: profile.hook + variant * 0.018
  };
}

function strongest(players = []) {
  return [...players].sort((a, b) => b.hp - a.hp)[0] || null;
}

function getDetailLevel(count) {
  if (count >= 90) return "low";
  if (count >= 45) return "medium";
  return "high";
}

function stableHash(value) {
  let hash = 2166136261;
  for (const char of String(value)) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function roundRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
}

// Draws a zigzag lightning bolt from (x1,y1) to (x2,y2).
// Re-randomizes every frame so it flickers naturally.
function drawLightningBolt(ctx, x1, y1, x2, y2, t, isHit, scale) {
  const segments = 7;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  const jitter = len * 0.14;
  // perpendicular direction for zigzag offset
  const px = -dy / len;
  const py = dx / len;

  const pts = [{ x: x1, y: y1 }];
  for (let i = 1; i < segments; i++) {
    const frac = i / segments;
    const offset = (Math.random() - 0.5) * jitter * (1 - Math.abs(frac - 0.5) * 1.4);
    pts.push({
      x: x1 + dx * frac + px * offset,
      y: y1 + dy * frac + py * offset
    });
  }
  pts.push({ x: x2, y: y2 });

  // Outer glow
  ctx.save();
  ctx.strokeStyle = isHit
    ? `rgba(255, 200, 60, ${t * 0.35})`
    : `rgba(100, 180, 255, ${t * 0.25})`;
  ctx.lineWidth = (5 + 3 * t) * scale;
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.stroke();

  // Bright core
  ctx.strokeStyle = isHit
    ? `rgba(255, 245, 140, ${t * 0.95})`
    : `rgba(200, 235, 255, ${t * 0.85})`;
  ctx.lineWidth = (1.5 + t) * scale;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.stroke();

  // Impact flash at endpoint if it hit someone
  if (isHit) {
    ctx.fillStyle = `rgba(255, 240, 80, ${t * 0.8})`;
    ctx.beginPath();
    ctx.arc(x2, y2, (6 + 4 * t) * scale, 0, TWO_PI);
    ctx.fill();
  }
  ctx.restore();
}

// Returns health bar fill color based on HP ratio.
// High HP players with aura keep their aura color. Everyone else:
// 75-100% green → 50-75% yellow → 25-50% orange → 0-25% red
function hpBarColor(ratio, hp, auraColor) {
  if (hp >= 1000) return auraColor;
  if (ratio > 0.75) return "#36ec88";
  if (ratio > 0.50) return "#f0d020";
  if (ratio > 0.25) return "#ff8c20";
  return "#ff3030";
}

function hexToRgba(hex, alpha) {
  const clean = hex.replace("#", "");
  const bigint = Number.parseInt(clean, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function trimName(name) {
  return name.length > 13 ? `${name.slice(0, 12)}.` : name;
}
