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
            <span class="boardMeta">${entry.hp} HP</span>
          </span>
          <span class="boardKills">${entry.kills} P</span>
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
    const renderKey = `${winner.username}:${winner.hp}:${winner.kills}:${secondsLeft}`;
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
      <div class="winner-meta">${winner.kills} kills &middot; ${winner.hp} HP remaining</div>
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
