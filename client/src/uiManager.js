const STORAGE_KEY = "tbrSettings";

function loadSettings() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

function saveSetting(key, value) {
  try {
    const current = loadSettings();
    current[key] = value;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  } catch {
    // ignore quota / private-browsing errors
  }
}

function getBackendUrl() {
  const params = new URLSearchParams(window.location.search);
  return (params.get("backend") || window.OVERLAY_BACKEND_URL || "").trim().replace(/\/$/, "");
}

export class UIManager {
  constructor(sound) {
    this.sound = sound;
    this.leaderboard = document.getElementById("leaderboard");
    this.winnerBanner = document.getElementById("winnerBanner");
    this.sfxButton = document.getElementById("sfxButton");
    this.musicButton = document.getElementById("musicButton");
    this.sfxVolume = document.getElementById("sfxVolume");
    this.musicVolume = document.getElementById("musicVolume");
    this.settingsButton = document.getElementById("settingsButton");
    this.settingsPanel = document.getElementById("settingsPanel");
    this.settingsClose = document.getElementById("settingsClose");
    this.roundResetSeconds = document.getElementById("roundResetSeconds");
    this.roundResetSave = document.getElementById("roundResetSave");
    this.roundResetStatus = document.getElementById("roundResetStatus");
    this.resetWinsButton = document.getElementById("resetWinsButton");
    this.resetWinsStatus = document.getElementById("resetWinsStatus");
    this.appMeta = document.getElementById("appMeta");
    this.backendUrl = getBackendUrl();

    this._currentWinner = null;
    this._winnerRenderKey = "";

    this._restoreSync();
    this.renderAudioButtons();
    this.renderGuideUrls();
    this._restoreTogglesAsync(); // fire-and-forget, re-renders buttons when done

    this.sfxButton.addEventListener("click", async () => {
      await this.sound.toggleSfx();
      saveSetting("sfxEnabled", this.sound.sfxEnabled);
      this.renderAudioButtons();
    });

    this.musicButton.addEventListener("click", async () => {
      await this.sound.toggleMusic();
      saveSetting("musicEnabled", this.sound.musicEnabled);
      this.renderAudioButtons();
    });

    this.sfxVolume.addEventListener("input", () => {
      this.sound.setSfxVolume(Number(this.sfxVolume.value) / 100);
      saveSetting("sfxVolume", this.sfxVolume.value);
    });

    this.musicVolume.addEventListener("input", () => {
      this.sound.setMusicVolume(Number(this.musicVolume.value) / 100);
      saveSetting("musicVolume", this.musicVolume.value);
    });

    this.settingsButton.addEventListener("click", () => {
      this.setSettingsOpen(!this.settingsPanel.classList.contains("open"));
    });

    this.settingsClose.addEventListener("click", () => {
      this.setSettingsOpen(false);
    });

    this.roundResetSave.addEventListener("click", () => {
      this.saveRoundResetSeconds();
    });

    this.resetWinsButton.addEventListener("click", () => {
      this.resetAllWins();
    });

    window.addEventListener("keydown", (event) => {
      if (event.key === "Escape") this.setSettingsOpen(false);
    });
  }

  _restoreSync() {
    const s = loadSettings();
    if (s.sfxVolume !== undefined) this.sfxVolume.value = s.sfxVolume;
    if (s.musicVolume !== undefined) this.musicVolume.value = s.musicVolume;
    this.sound.setSfxVolume(Number(this.sfxVolume.value) / 100);
    this.sound.setMusicVolume(Number(this.musicVolume.value) / 100);
  }

  // Async restore: ON/OFF toggle state (requires audio context init)
  // Default is ON for both sfx and music when no saved preference exists.
  async _restoreTogglesAsync() {
    const s = loadSettings();
    const sfxOn = s.sfxEnabled !== undefined ? s.sfxEnabled : true;
    const musicOn = s.musicEnabled !== undefined ? s.musicEnabled : true;
    const tasks = [];
    if (sfxOn && !this.sound.sfxEnabled) tasks.push(this.sound.toggleSfx());
    if (!sfxOn && this.sound.sfxEnabled) tasks.push(this.sound.toggleSfx());
    if (musicOn && !this.sound.musicEnabled) tasks.push(this.sound.toggleMusic());
    if (!musicOn && this.sound.musicEnabled) tasks.push(this.sound.toggleMusic());
    if (tasks.length) {
      await Promise.all(tasks);
      this.renderAudioButtons(); // re-render after async toggles settle
    }
  }

  renderAudioButtons() {
    this.setToggle(this.sfxButton, "SFX", this.sound.sfxEnabled);
    this.setToggle(this.musicButton, "MUSIC", this.sound.musicEnabled);
  }

  setToggle(button, label, enabled) {
    button.textContent = `${label} ${enabled ? "ON" : "OFF"}`;
    button.classList.toggle("is-on", enabled);
    button.classList.toggle("is-off", !enabled);
  }

  renderGuideUrls() {
    const webhookBaseUrl = this.backendUrl || window.location.origin;
    const overlayUrl = this.backendUrl
      ? `${window.location.origin}/client/overlay.html?backend=${encodeURIComponent(this.backendUrl)}`
      : `${window.location.origin}/client/overlay.html`;
    const simulatorUrl = this.backendUrl
      ? `${window.location.origin}/client/simulator.html?backend=${encodeURIComponent(this.backendUrl)}`
      : `${window.location.origin}/client/simulator.html`;
    document.getElementById("overlayUrl").textContent = overlayUrl;
    document.getElementById("joinWebhookUrl").textContent = `${webhookBaseUrl}/webhook1`;
    document.getElementById("giftWebhookUrl").textContent = `${webhookBaseUrl}/webhook2`;
    document.getElementById("ultimateWebhookUrl").textContent = `${webhookBaseUrl}/webhook3`;
    document.getElementById("simulatorLink").href = simulatorUrl;
  }

  setConfig(config) {
    if (config?.round?.resetSeconds !== undefined) {
      this.roundResetSeconds.value = Math.max(0, Number(config.round.resetSeconds) || 0);
    }
    if (config?.app) {
      const version = config.app.version ? `v${escapeHtml(config.app.version)}` : "";
      const credit = config.app.credit ? escapeHtml(config.app.credit) : "";
      this.appMeta.innerHTML = [version, credit].filter(Boolean).join(" &middot; ");
    }
  }

  async saveRoundResetSeconds() {
    const seconds = Math.max(0, Math.min(120, Math.round(Number(this.roundResetSeconds.value) || 0)));
    this.roundResetSeconds.value = seconds;
    this.roundResetSave.disabled = true;
    this.roundResetStatus.textContent = "Saving timer...";
    try {
      const response = await fetch(`${this.backendUrl || window.location.origin}/settings/round`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resetSeconds: seconds })
      });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || "Unable to save timer");
      this.roundResetSeconds.value = data.resetSeconds;
      this.roundResetStatus.textContent = `Reset timer saved: ${data.resetSeconds} seconds.`;
    } catch (error) {
      this.roundResetStatus.textContent = `Save failed: ${error.message}`;
    } finally {
      this.roundResetSave.disabled = false;
    }
  }

  async resetAllWins() {
    if (!window.confirm("Reset all player Wins to 0?")) return;
    this.resetWinsButton.disabled = true;
    this.resetWinsStatus.textContent = "Resetting Wins...";
    try {
      const response = await fetch(`${this.backendUrl || window.location.origin}/settings/wins/reset`, {
        method: "POST",
        headers: { "Content-Type": "application/json" }
      });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || "Unable to reset Wins");
      this.resetWinsStatus.textContent = `Wins reset to 0 for ${data.records} players.`;
    } catch (error) {
      this.resetWinsStatus.textContent = `Reset failed: ${error.message}`;
    } finally {
      this.resetWinsButton.disabled = false;
    }
  }

  setSettingsOpen(open) {
    this.settingsPanel.classList.toggle("open", open);
    this.settingsPanel.setAttribute("aria-hidden", open ? "false" : "true");
  }

  updateLeaderboard(entries) {
    this.leaderboard.replaceChildren(
      ...entries.map((entry, index) => {
        const item = document.createElement("li");
        item.innerHTML = `
          <span class="rank">#${index + 1}</span>
          <span>
            <span class="boardName">${escapeHtml(entry.username)}</span>
            <span class="boardMeta">${formatCompact(entry.hp)} HP</span>
          </span>
          <span class="boardKills">${entry.wins ?? entry.kills ?? 0} Wins</span>
        `;
        return item;
      })
    );
  }

  updateWinner(winner, resetAt) {
    if (!winner) {
      this.winnerBanner.hidden = true;
      this._currentWinner = null;
      this._winnerRenderKey = "";
      return;
    }

    this._currentWinner = winner;
    const resetAtNumber = Number(resetAt || 0);
    const secondsLeft = resetAtNumber > 0
      ? Math.max(0, Math.ceil((resetAtNumber - Date.now()) / 1000))
      : null;
    const renderKey = `${winner.username}:${winner.hp}:${winner.wins ?? winner.kills}:${secondsLeft}`;
    if (renderKey !== this._winnerRenderKey) {
      this._winnerRenderKey = renderKey;
      this._renderWinnerBanner(winner, secondsLeft);
    }
  }

  _renderWinnerBanner(winner, secondsLeft) {
    this.winnerBanner.hidden = false;
    const countdownHtml = secondsLeft !== null
      ? `<div class="winner-countdown">Resetting in <span class="winner-countdown-num">${secondsLeft}</span> seconds</div>`
      : `<div class="winner-countdown">Reset from the simulator when ready</div>`;

    const avatarSrc = winner.avatarUrl
      ? (winner.avatarUrl.startsWith("http://") || winner.avatarUrl.startsWith("https://")
          ? `/avatar-proxy?url=${encodeURIComponent(winner.avatarUrl)}`
          : escapeHtml(winner.avatarUrl))
      : null;
    const initial = escapeHtml(winner.username.slice(0, 1).toUpperCase());
    const avatarHtml = avatarSrc
      ? `<div class="winner-avatar-wrap"><div class="winner-avatar-placeholder">${initial}</div><img class="winner-avatar" src="${avatarSrc}" alt="" onerror="this.style.display='none'"></div>`
      : `<div class="winner-avatar-placeholder">${initial}</div>`;

    this.winnerBanner.innerHTML = `
      <div class="winner-title">&#127942; Battle Winner</div>
      ${avatarHtml}
      <div class="winner-name">${escapeHtml(winner.username)}</div>
      <div class="winner-meta">${winner.wins ?? winner.kills ?? 0} Wins &middot; ${formatCompact(winner.hp)} HP remaining</div>
      ${countdownHtml}
    `;
  }

  addEvent(event) {
    if (event.type === "gift") return;
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatCompact(value) {
  const number = Math.max(0, Math.floor(Number(value) || 0));
  if (number < 1000) return String(number);
  const compact = number / 1000;
  return `${Number.isInteger(compact) ? compact.toFixed(0) : compact.toFixed(1)}K`;
}
