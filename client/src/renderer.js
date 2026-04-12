const TWO_PI = Math.PI * 2;
const MAX_EFFECTS = 70;
const INTERPOLATION_DELAY_MS = 120;
const MAX_EXTRAPOLATION_MS = 50;
const PLAYER_SAMPLE_LIMIT = 8;

// HP tier palette. Players with the same HP range get the same color.
const HP_COLORS = [
  { color: "#68717d", accent: "#d5dbe2" },
  { color: "#c7e8ff", accent: "#ffffff" },
  { color: "#42d6ff", accent: "#caf5ff" },
  { color: "#44e87c", accent: "#cdfae0" },
  { color: "#f5d020", accent: "#fffacc" },
  { color: "#ff8c00", accent: "#ffe5cc" },
  { color: "#ff3d6e", accent: "#ffd0dc" },
  { color: "#c060ff", accent: "#e8ccff" },
  { color: "#00e5c9", accent: "#ccfff8" },
  { color: "#3d7fff", accent: "#cce0ff" },
  { color: "#ff30e8", accent: "#ffc0fb" },
  { color: "#ffd84d", accent: "#fff6c2" }
];

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d", { alpha: true, desynchronized: true });
    this.config = null;
    this.state = { players: [], leaderboard: [] };
    this.effects = [];
    this.displayPlayers = new Map();
    this.avatarCache = new Map();
    this.fastSpriteCache = new Map();
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
  }

  syncDisplayPlayers(players) {
    const now = performance.now();
    const alive = new Set();
    for (const player of players) {
      alive.add(player.id);
      const current = this.displayPlayers.get(player.id);
      const palette = hpPalette(player.hp);
      if (!current) {
        this.displayPlayers.set(player.id, {
          ...player,
          samples: [{ time: now, x: player.x, y: player.y }],
          color: palette.color,
          accent: palette.accent
        });
      } else {
        current.samples.push({ time: now, x: player.x, y: player.y });
        if (current.samples.length > PLAYER_SAMPLE_LIMIT) {
          current.samples.splice(0, current.samples.length - PLAYER_SAMPLE_LIMIT);
        }

        Object.assign(current, player, {
          x: current.x,
          y: current.y,
          samples: current.samples,
          color: palette.color,
          accent: palette.accent
        });
      }
    }

    for (const id of this.displayPlayers.keys()) {
      if (!alive.has(id)) this.displayPlayers.delete(id);
    }
  }

  addEvent(event) {
    if (event.type === "laser") {
      this.pushEffect({ kind: "laser", x: event.x, y: event.y, tx: event.tx, ty: event.ty, color: event.color || "#fff", life: 560, max: 560 });
    }
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

  updateCamera(dt) {
    // Follow the leading player's interpolated (display) position at 60fps
    const leaders = this.state.leaderboard || [];
    const targetId = leaders[0]?.id;
    const target = (targetId && this.displayPlayers.get(targetId))
      || [...this.displayPlayers.values()].sort((a, b) => b.hp - a.hp)[0];
    if (!target) return;
    // Frame-rate-independent alpha: same feel at any fps
    const alpha = 1 - Math.pow(0.001, dt / 1800);
    this.camera.x += (target.x - this.camera.x) * alpha;
    this.camera.y += (target.y - this.camera.y) * alpha;
  }

  render(time) {
    const dt = Math.min(40, time - (this.lastTime || time));
    this.lastTime = time;
    const ctx = this.ctx;
    const width = window.innerWidth;
    const height = window.innerHeight;
    const displayPlayers = this.updateDisplayPositions(dt);
    this.updateCamera(dt);
    const detail = getDetailLevel(displayPlayers.length);

    if (this.backgroundDirty) this.drawBackground();
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(this.background, 0, 0, width, height);

    const sorted = [...displayPlayers].sort((a, b) => a.radius - b.radius);
    const nameBudget = detail === "ultra" ? 3 : detail === "low" ? 5 : detail === "medium" ? 10 : 999;
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
    const renderTime = performance.now() - INTERPOLATION_DELAY_MS;
    for (const player of this.displayPlayers.values()) {
      const position = samplePlayerPosition(player.samples, renderTime);
      player.x = position.x;
      player.y = position.y;
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
    const profile = topProfile(player);
    const spin = time * profile.spin + player.x * 0.017;
    const wobble = Math.sin(time * 0.006 + player.y * 0.04) * r * 0.035;
    const x = screen.x;
    const y = screen.y + wobble;

    if (detail === "ultra") {
      this.drawFastTop(x, y, r, player, spin, showName);
      this.drawHpRing(player, x, y, r);
      return;
    }

    if (detail === "low") {
      this.drawFastTop(x, y, r, player, spin, showName);
      this.drawHpRing(player, x, y, r);
      return;
    }

    if (profile.blades <= 0) {
      this.drawBareTop(x, y, r, player, spin, showName);
      this.drawHpRing(player, x, y, r);
      if (r > 14 && (detail === "high" || showName)) this.drawAvatar(player, x, y, r * 0.52);
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

    this.drawHpRing(player, x, y, r);
    if (r > 14 && (detail === "high" || showName || player.auraLevel > 0)) this.drawAvatar(player, x, y, r * 0.52);
    if (showName) this.drawNameplate(player, x, y, r);
  }

  drawSimpleTop(x, y, r, player, spin, showName) {
    const ctx = this.ctx;
    const tier = hpTier(player.hp);
    const blades = tier < 2 ? 0 : player.auraLevel > 0 ? 6 : 4;
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

  drawFastTop(x, y, r, player, spin, showName) {
    const ctx = this.ctx;
    const sprite = this.getFastTopSprite(player, r);

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(spin);
    ctx.drawImage(sprite.canvas, -sprite.size / 2, -sprite.size / 2, sprite.size, sprite.size);
    ctx.restore();

    if (showName && r > 16) this.drawCompactName(player, x, y, r);
  }

  drawBareTop(x, y, r, player, spin, showName) {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(spin * 0.35);
    ctx.fillStyle = player.color;
    ctx.strokeStyle = "#061016";
    ctx.lineWidth = Math.max(2, r * 0.055);
    for (let i = 0; i < 3; i += 1) {
      const a = (i / 3) * TWO_PI;
      ctx.beginPath();
      ctx.arc(Math.cos(a) * r * 0.72, Math.sin(a) * r * 0.72, r * 0.12, 0, TWO_PI);
      ctx.fill();
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.82, 0, TWO_PI);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = player.accent;
    ctx.globalAlpha = 0.72;
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.38, 0, TWO_PI);
    ctx.fill();
    ctx.globalAlpha = 1;

    ctx.fillStyle = "#eefaff";
    ctx.beginPath();
    ctx.arc(0, 0, Math.max(3, r * 0.14), 0, TWO_PI);
    ctx.fill();
    ctx.restore();

    if (showName && r > 16) this.drawCompactName(player, x, y, r);
  }

  getFastTopSprite(player, r) {
    const bucketR = Math.max(10, Math.round(r / 4) * 4);
    const auraLevel = player.auraLevel > 0 ? 1 : 0;
    const tier = hpTier(player.hp);
    const key = `${bucketR}:${player.color}:${player.accent}:${auraLevel}:${tier}`;
    const cached = this.fastSpriteCache.get(key);
    if (cached) return cached;

    const pad = bucketR * 0.3;
    const size = Math.ceil((bucketR * 2.6 + pad * 2) / 2) * 2;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d", { alpha: true });
    const r2 = bucketR;
    const blades = tier < 2 ? 0 : Math.min(8, 3 + Math.floor(tier / 2) + auraLevel);

    ctx.translate(size / 2, size / 2);

    if (blades <= 0) {
      ctx.fillStyle = player.color;
      ctx.strokeStyle = "#061016";
      ctx.lineWidth = Math.max(1.5, r2 * 0.055);
      for (let i = 0; i < 3; i += 1) {
        const a = (i / 3) * TWO_PI;
        ctx.beginPath();
        ctx.arc(Math.cos(a) * r2 * 0.72, Math.sin(a) * r2 * 0.72, r2 * 0.12, 0, TWO_PI);
        ctx.fill();
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(0, 0, r2 * 0.82, 0, TWO_PI);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = player.accent;
      ctx.globalAlpha = 0.72;
      ctx.beginPath();
      ctx.arc(0, 0, r2 * 0.38, 0, TWO_PI);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = "#eefaff";
      ctx.beginPath();
      ctx.arc(0, 0, Math.max(3, r2 * 0.14), 0, TWO_PI);
      ctx.fill();
      const sprite = { canvas, size };
      this.fastSpriteCache.set(key, sprite);
      return sprite;
    }

    if (player.auraLevel > 0) {
      ctx.globalAlpha = 0.18;
      ctx.fillStyle = this.getAuraColor(player);
      ctx.beginPath();
      ctx.arc(0, 0, r2 * 1.25, 0, TWO_PI);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    ctx.fillStyle = player.color;
    ctx.strokeStyle = "#061016";
    ctx.lineWidth = Math.max(1.5, r2 * 0.045);
    for (let i = 0; i < blades; i += 1) {
      const angle = (i / blades) * TWO_PI;
      ctx.beginPath();
      ctx.moveTo(Math.cos(angle - 0.18) * r2 * 0.55, Math.sin(angle - 0.18) * r2 * 0.55);
      ctx.lineTo(Math.cos(angle) * r2 * 1.18, Math.sin(angle) * r2 * 1.18);
      ctx.lineTo(Math.cos(angle + 0.18) * r2 * 0.55, Math.sin(angle + 0.18) * r2 * 0.55);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    ctx.fillStyle = player.accent;
    ctx.beginPath();
    ctx.arc(0, 0, r2 * 0.72, 0, TWO_PI);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#eefaff";
    ctx.beginPath();
    ctx.arc(0, 0, Math.max(3, r2 * 0.18), 0, TWO_PI);
    ctx.fill();

    const sprite = { canvas, size };
    this.fastSpriteCache.set(key, sprite);
    if (this.fastSpriteCache.size > 160) this.fastSpriteCache.delete(this.fastSpriteCache.keys().next().value);
    return sprite;
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

  drawHpRing(player, x, y, r) {
    const ctx = this.ctx;
    const ratio = Math.max(0, Math.min(1, player.hp / Math.max(player.maxSeenHP, player.hp, 1)));
    const ringR = r * 1.08;
    const line = Math.max(3, Math.min(12, r * 0.065));
    const start = -Math.PI / 2;
    const end = start + TWO_PI * ratio;

    ctx.save();
    ctx.lineCap = "round";
    ctx.lineWidth = line;
    ctx.strokeStyle = "rgba(0, 0, 0, 0.56)";
    ctx.beginPath();
    ctx.arc(x, y, ringR, 0, TWO_PI);
    ctx.stroke();

    ctx.strokeStyle = hpBarColor(ratio, player.hp, this.getAuraColor(player));
    ctx.beginPath();
    ctx.arc(x, y, ringR, start, end);
    ctx.stroke();

    ctx.lineWidth = Math.max(1, line * 0.28);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.42)";
    ctx.beginPath();
    ctx.arc(x, y, ringR, 0, TWO_PI);
    ctx.stroke();
    ctx.restore();
  }

  drawNameplate(player, x, y, r) {
    const ctx = this.ctx;
    const width = Math.max(86, Math.min(172, r * 2.55));
    const top = y - r - 43;

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
    ctx.restore();
  }

  drawCompactName(player, x, y, r) {
    const ctx = this.ctx;
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "rgba(3, 8, 13, 0.68)";
    roundRect(ctx, x - 42, y - r - 25, 84, 19, 6);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.font = "800 10px system-ui";
    ctx.fillText(trimName(player.username), x, y - r - 15);
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

      if (effect.kind === "spark" && detail !== "low" && detail !== "ultra") {
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

      if (effect.kind === "hit" && detail !== "low" && detail !== "ultra") {
        ctx.strokeStyle = `rgba(235, 251, 255, ${0.85 * t})`;
        ctx.lineWidth = 2 + 7 * t;
        ctx.beginPath();
        ctx.arc(point.x, point.y, 14 + 44 * (1 - t), -0.75, 0.9);
        ctx.stroke();

        ctx.fillStyle = `rgba(255, 63, 82, ${t})`;
        ctx.font = "500 22px system-ui";
        ctx.textAlign = "center";
        ctx.fillText(`-${effect.damage}`, point.x, point.y - 26 * (1 - t));
      }

      if (effect.kind === "laser" && detail !== "ultra") {
        const endPt = this.worldToScreen({ x: effect.tx, y: effect.ty });
        drawElectricBolt(ctx, point.x, point.y, endPt.x, endPt.y, t, point.scale);
      }

      if ((effect.kind === "burst" || effect.kind === "power") && detail !== "low" && detail !== "ultra") {
        ctx.globalCompositeOperation = "lighter";
        ctx.strokeStyle = hexToRgba(effect.color, 0.75 * t);
        ctx.lineWidth = 4 + 8 * t;
        ctx.beginPath();
        ctx.arc(point.x, point.y, 18 + 82 * (1 - t), 0, TWO_PI);
        ctx.stroke();
      }

      if (effect.kind === "lightning" && detail !== "ultra") {
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

// 20 distinct gear profiles ? assigned per-player via ID hash for maximum visual variety
const GEAR_PROFILES = [
  { blades: 3,  length: 1.05, width: 0.30, base: 0.60, panels: 3,  hook: 0.26, spin: 0.019 }, //  0 tri-claw
  { blades: 3,  length: 0.88, width: 0.24, base: 0.65, panels: 3,  hook: 0.14, spin: 0.017 }, //  1 tri-wide
  { blades: 4,  length: 0.88, width: 0.20, base: 0.68, panels: 4,  hook: 0.15, spin: 0.014 }, //  2 quad classic
  { blades: 4,  length: 0.58, width: 0.30, base: 0.72, panels: 4,  hook: 0.06, spin: 0.010 }, //  3 quad stubby
  { blades: 5,  length: 0.94, width: 0.12, base: 0.66, panels: 5,  hook: 0.22, spin: 0.017 }, //  4 penta sharp
  { blades: 5,  length: 0.72, width: 0.18, base: 0.70, panels: 5,  hook: 0.10, spin: 0.012 }, //  5 penta star
  { blades: 6,  length: 0.64, width: 0.16, base: 0.68, panels: 6,  hook: 0.14, spin: 0.012 }, //  6 hex classic
  { blades: 6,  length: 0.50, width: 0.26, base: 0.76, panels: 6,  hook: 0.05, spin: 0.009 }, //  7 hex squat
  { blades: 7,  length: 0.86, width: 0.20, base: 0.70, panels: 7,  hook: 0.17, spin: 0.013 }, //  8 sept berserker
  { blades: 7,  length: 0.60, width: 0.15, base: 0.72, panels: 7,  hook: 0.08, spin: 0.011 }, //  9 sept round
  { blades: 8,  length: 0.68, width: 0.18, base: 0.70, panels: 8,  hook: 0.13, spin: 0.013 }, // 10 oct medium
  { blades: 8,  length: 0.44, width: 0.24, base: 0.74, panels: 8,  hook: 0.07, spin: 0.009 }, // 11 oct tank
  { blades: 9,  length: 0.56, width: 0.13, base: 0.66, panels: 9,  hook: 0.20, spin: 0.011 }, // 12 nine mage
  { blades: 9,  length: 0.80, width: 0.10, base: 0.64, panels: 9,  hook: 0.24, spin: 0.014 }, // 13 nine slim
  { blades: 10, length: 0.74, width: 0.11, base: 0.64, panels: 10, hook: 0.18, spin: 0.016 }, // 14 ten assassin
  { blades: 10, length: 0.54, width: 0.16, base: 0.68, panels: 10, hook: 0.10, spin: 0.013 }, // 15 ten fan
  { blades: 11, length: 0.62, width: 0.10, base: 0.66, panels: 11, hook: 0.12, spin: 0.014 }, // 16 eleven
  { blades: 12, length: 0.52, width: 0.09, base: 0.68, panels: 12, hook: 0.09, spin: 0.015 }, // 17 twelve fine
  { blades: 5,  length: 1.14, width: 0.14, base: 0.58, panels: 5,  hook: 0.28, spin: 0.020 }, // 18 penta dragon
  { blades: 4,  length: 1.00, width: 0.22, base: 0.62, panels: 4,  hook: 0.20, spin: 0.018 }, // 19 quad hawk
];

function samplePlayerPosition(samples = [], renderTime) {
  if (samples.length === 0) return { x: 0, y: 0 };
  if (samples.length === 1 || renderTime <= samples[0].time) {
    return { x: samples[0].x, y: samples[0].y };
  }

  for (let i = 0; i < samples.length - 1; i += 1) {
    const from = samples[i];
    const to = samples[i + 1];
    if (renderTime <= to.time) {
      const span = Math.max(1, to.time - from.time);
      const t = (renderTime - from.time) / span;
      return {
        x: lerp(from.x, to.x, t),
        y: lerp(from.y, to.y, t)
      };
    }
  }

  const latest = samples[samples.length - 1];
  const previous = samples[samples.length - 2];
  if (!previous) return { x: latest.x, y: latest.y };

  const span = Math.max(1, latest.time - previous.time);
  const overrun = Math.min(MAX_EXTRAPOLATION_MS, Math.max(0, renderTime - latest.time));
  const t = overrun / span;
  return {
    x: latest.x + (latest.x - previous.x) * t,
    y: latest.y + (latest.y - previous.y) * t
  };
}

function lerp(from, to, t) {
  return from + (to - from) * t;
}

function topProfile(player) {
  const tier = hpTier(player.hp);
  if (tier < 2) return { blades: 0, length: 0, width: 0, base: 0.78, panels: 0, hook: 0, spin: 0.007 };

  const hash = stableHash(player.id);
  const ranges = [
    [0, 3],
    [2, 7],
    [4, 11],
    [8, 15],
    [12, 19]
  ];
  const range = ranges[Math.min(ranges.length - 1, Math.floor((tier - 2) / 2))];
  const index = range[0] + (hash % (range[1] - range[0] + 1));
  return GEAR_PROFILES[index];
}

function hpPalette(hp) {
  return HP_COLORS[hpTier(hp)];
}

function hpTier(hp) {
  if (hp < 50) return 0;
  if (hp <= 100) return 1;
  return Math.max(2, Math.min(HP_COLORS.length - 1, Math.floor((hp - 1) / 100) + 1));
}

function strongest(players = []) {
  return [...players].sort((a, b) => b.hp - a.hp)[0] || null;
}

function getDetailLevel(count) {
  if (count >= 140) return "ultra";
  if (count >= 70) return "low";
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

// Electric bolt for laser attacks ? forked, flickering, re-randomized every frame
function drawElectricBolt(ctx, x1, y1, x2, y2, t, scale) {
  const pts = buildBoltPts(x1, y1, x2, y2, 11, 0.22);

  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  // Wide diffuse glow
  ctx.strokeStyle = `rgba(60, 160, 255, ${t * 0.50})`;
  ctx.lineWidth = (14 + 8 * t) * scale;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.stroke();

  // Mid glow
  ctx.strokeStyle = `rgba(140, 210, 255, ${t * 0.75})`;
  ctx.lineWidth = (4 + 3 * t) * scale;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.stroke();

  // Bright white-cyan core
  ctx.strokeStyle = `rgba(230, 250, 255, ${t * 0.98})`;
  ctx.lineWidth = (1.5 + t * 0.8) * scale;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.stroke();

  // Fork branches (2?3 smaller bolts from random midpoints)
  const dx = x2 - x1;
  const dy = y2 - y1;
  const blen = Math.hypot(dx, dy);
  const forks = 2 + (Math.random() < 0.4 ? 1 : 0);
  for (let f = 0; f < forks; f++) {
    const si = 2 + Math.floor(Math.random() * (pts.length - 4));
    const pt = pts[si];
    const fAngle = Math.atan2(dy, dx) + (Math.random() - 0.5) * 1.6;
    const fLen = blen * (0.10 + Math.random() * 0.22);
    const fPts = buildBoltPts(pt.x, pt.y, pt.x + Math.cos(fAngle) * fLen, pt.y + Math.sin(fAngle) * fLen, 5, 0.25);
    ctx.strokeStyle = `rgba(100, 200, 255, ${t * 0.60})`;
    ctx.lineWidth = (1.2 + t * 0.6) * scale;
    ctx.beginPath();
    ctx.moveTo(fPts[0].x, fPts[0].y);
    for (let i = 1; i < fPts.length; i++) ctx.lineTo(fPts[i].x, fPts[i].y);
    ctx.stroke();
  }

  // Source spark
  ctx.fillStyle = `rgba(180, 230, 255, ${t * 0.90})`;
  ctx.beginPath();
  ctx.arc(x1, y1, (5 + 3 * t) * scale, 0, TWO_PI);
  ctx.fill();

  // Impact flash at endpoint
  ctx.fillStyle = `rgba(255, 255, 220, ${t * 0.95})`;
  ctx.beginPath();
  ctx.arc(x2, y2, (8 + 6 * t) * scale, 0, TWO_PI);
  ctx.fill();

  ctx.restore();
}

function buildBoltPts(x1, y1, x2, y2, segments, jitterFrac) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const jitter = len * jitterFrac;
  const px = -dy / len;
  const py = dx / len;
  const pts = [{ x: x1, y: y1 }];
  for (let i = 1; i < segments; i++) {
    const frac = i / segments;
    const offset = (Math.random() - 0.5) * jitter * (1 - Math.abs(frac - 0.5) * 1.3);
    pts.push({ x: x1 + dx * frac + px * offset, y: y1 + dy * frac + py * offset });
  }
  pts.push({ x: x2, y: y2 });
  return pts;
}

// Returns health bar fill color based on HP ratio.
// High HP players with aura keep their aura color. Everyone else:
// 75-100% green ? 50-75% yellow ? 25-50% orange ? 0-25% red
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
