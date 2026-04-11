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
    this.renderAudioButtons();
    this.renderGuideUrls();

    this.sfxButton.addEventListener("click", async () => {
      await this.sound.toggleSfx();
      this.renderAudioButtons();
    });

    this.musicButton.addEventListener("click", async () => {
      await this.sound.toggleMusic();
      this.renderAudioButtons();
    });

    this.sfxVolume.addEventListener("input", () => {
      this.sound.setSfxVolume(Number(this.sfxVolume.value) / 100);
    });

    this.musicVolume.addEventListener("input", () => {
      this.sound.setMusicVolume(Number(this.musicVolume.value) / 100);
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

    this.sound.setSfxVolume(Number(this.sfxVolume.value) / 100);
    this.sound.setMusicVolume(Number(this.musicVolume.value) / 100);
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
      this.winnerBanner.hidden = true;
      return;
    }
    this.winnerBanner.hidden = false;
    this.winnerBanner.innerHTML = `
      <div class="winner-title">&#127942; Battle Winner</div>
      <div class="winner-name">${escapeHtml(winner.username)}</div>
      <div class="winner-meta">${winner.kills} kills &middot; ${winner.hp} HP remaining</div>
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
