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
    this.countdownEnabled = document.getElementById("countdownEnabled");
    this.countdownSeconds = document.getElementById("countdownSeconds");

    this._countdownTimer = null;
    this._countdownRemaining = 0;
    this._currentWinner = null;

    // Restore sync settings first (volumes, countdown), then async toggles
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

    this.countdownEnabled.addEventListener("change", () => {
      saveSetting("countdownEnabled", this.countdownEnabled.checked);
    });

    this.countdownSeconds.addEventListener("input", () => {
      saveSetting("countdownSeconds", this.countdownSeconds.value);
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

  // Synchronous restore: volumes + countdown (safe to do before render)
  _restoreSync() {
    const s = loadSettings();
    if (s.sfxVolume !== undefined) this.sfxVolume.value = s.sfxVolume;
    if (s.musicVolume !== undefined) this.musicVolume.value = s.musicVolume;
    this.sound.setSfxVolume(Number(this.sfxVolume.value) / 100);
    this.sound.setMusicVolume(Number(this.musicVolume.value) / 100);
    if (s.countdownEnabled !== undefined) this.countdownEnabled.checked = s.countdownEnabled;
    if (s.countdownSeconds !== undefined) this.countdownSeconds.value = s.countdownSeconds;
  }

  // Async restore: ON/OFF toggle state (requires audio context init)
  async _restoreTogglesAsync() {
    const s = loadSettings();
    const tasks = [];
    if (s.sfxEnabled === true && !this.sound.sfxEnabled) tasks.push(this.sound.toggleSfx());
    if (s.sfxEnabled === false && this.sound.sfxEnabled) tasks.push(this.sound.toggleSfx());
    if (s.musicEnabled === true && !this.sound.musicEnabled) tasks.push(this.sound.toggleMusic());
    if (s.musicEnabled === false && this.sound.musicEnabled) tasks.push(this.sound.toggleMusic());
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
    const baseUrl = window.location.origin;
    document.getElementById("overlayUrl").textContent = `${baseUrl}/client/overlay.html`;
    document.getElementById("giftWebhookUrl").textContent = `${baseUrl}/webhook2`;
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
          <span class="boardKills">${entry.kills} K</span>
        `;
        return item;
      })
    );
  }

  updateWinner(winner) {
    if (!winner) {
      this._stopCountdown();
      this.winnerBanner.hidden = true;
      this._currentWinner = null;
      return;
    }

    const isNew = !this._currentWinner || this._currentWinner.username !== winner.username;
    this._currentWinner = winner;

    if (isNew) {
      this._stopCountdown();
      if (this.countdownEnabled.checked) {
        const secs = Math.max(3, Math.min(120, Number(this.countdownSeconds.value) || 15));
        this._startCountdown(winner, secs);
      } else {
        this._renderWinnerBanner(winner, null);
      }
    }
  }

  _startCountdown(winner, totalSeconds) {
    this._countdownRemaining = totalSeconds;
    this._renderWinnerBanner(winner, this._countdownRemaining);

    this._countdownTimer = setInterval(() => {
      this._countdownRemaining -= 1;
      this._renderWinnerBanner(winner, this._countdownRemaining);

      if (this._countdownRemaining <= 0) {
        this._stopCountdown();
        fetch("/reset").catch(() => {});
      }
    }, 1000);
  }

  _stopCountdown() {
    if (this._countdownTimer !== null) {
      clearInterval(this._countdownTimer);
      this._countdownTimer = null;
    }
    this._countdownRemaining = 0;
  }

  _renderWinnerBanner(winner, secondsLeft) {
    this.winnerBanner.hidden = false;
    const countdownHtml = secondsLeft !== null
      ? `<div class="winner-countdown">Resetting in <span class="winner-countdown-num">${secondsLeft}</span> seconds</div>`
      : `<div class="winner-countdown">Reset manually via Simulator</div>`;

    this.winnerBanner.innerHTML = `
      <div class="winner-title">&#127942; Battle Winner</div>
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
