const SOUND_PATHS = {
  spinLoop: ["/assets/sounds/gasing-spin-1.mp3"],
  spinWhoosh: ["/assets/sounds/gasing-spin-whoosh.mp3"],
  attackWhoosh: ["/assets/sounds/gasing-whoosh-attack-1.mp3", "/assets/sounds/gasing-whoosh-attack-2.mp3"],
  metalHit: ["/assets/sounds/gasing-metal-hit-1.mp3", "/assets/sounds/gasing-metal-hit-2.mp3"],
  heavyImpact: ["/assets/sounds/gasing-impact-heavy.mp3"],
  ultimateImpact: ["/assets/sounds/gasing-ultimate-impact.mp3"],
  ultimateCharge: ["/assets/sounds/ultimate-energy-charge.mp3"],
  ultimateRise: ["/assets/sounds/ultimate-cinematic-rise.mp3"],
  ultimateBoom: ["/assets/sounds/ultimate-explosion-boom.mp3"],
  ultimateMagic: ["/assets/sounds/ultimate-magic-burst.mp3"],
  bgm: ["/assets/sounds/battle-bgm.mp3"]
};

export class SoundManager {
  constructor() {
    this.ctx = null;
    this.buffers = new Map();
    this.loaded = false;
    this.loading = null;
    this.sfxEnabled = false;
    this.musicEnabled = false;
    this.sfxVolume = 0.35;
    this.musicVolumeLevel = 1;
    this.config = { masterVolume: 0.72, ambienceVolume: 0.13, sfxVolume: 0.82 };
    this.spinSource = null;
    this.spinGain = null;
    this.bgmSource = null;
    this.bgmGain = null;
    this.lastHitAt = 0;
    this.lastWhooshAt = 0;
    this.lastLaserAt = 0;
    this.activeOneShots = 0;
  }

  setConfig(config) {
    this.config = { ...this.config, ...config };
    this.updateLoopGains();
  }

  setSfxVolume(value) {
    this.sfxVolume = clamp(value, 0, 1);
    this.updateLoopGains();
  }

  setMusicVolume(value) {
    this.musicVolumeLevel = clamp(value, 0, 1);
    this.updateLoopGains();
  }

  async toggleSfx() {
    await this.ensureReady();
    this.sfxEnabled = !this.sfxEnabled;
    if (this.sfxEnabled) this.startSpinLoop();
    else this.stopSpinLoop();
    return this.sfxEnabled;
  }

  async toggleMusic() {
    await this.ensureReady();
    this.musicEnabled = !this.musicEnabled;
    if (this.musicEnabled) {
      const started = this.startBgm();
      if (!started) this.syntheticBgmLoop();
    }
    else this.stopBgm();
    return this.musicEnabled;
  }

  async ensureReady() {
    if (!this.ctx) this.ctx = new AudioContext();
    if (this.ctx.state === "suspended") await this.ctx.resume();
    if (!this.loading) this.loading = this.loadSounds();
    await this.loading;
  }

  async loadSounds() {
    const urls = Object.values(SOUND_PATHS).flat();
    await Promise.all(
      urls.map(async (url) => {
        try {
          const response = await fetch(url);
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const arrayBuffer = await response.arrayBuffer();
          const buffer = await this.ctx.decodeAudioData(arrayBuffer);
          this.buffers.set(url, buffer);
        } catch (error) {
          console.warn(`Sound failed to load: ${url}`, error);
        }
      })
    );
    this.loaded = true;
  }

  playEvent(event) {
    if (!this.sfxEnabled) return;
    this.ensureReady().then(() => {
      if (!this.sfxEnabled) return;
      if (event.type === "hit") this.hit(event.hitType);
      if (event.type === "death") this.death();
      if (event.type === "gift") this.power(event.auraLeveled);
      if (event.type === "ultimate") this.ultimate();
      if (event.type === "winner") this.winner();
      if (event.type === "laser") this.laser();
    });
  }

  hit(kind) {
    const now = performance.now();
    if (now - this.lastWhooshAt > 110) {
      this.playRandom("attackWhoosh", { volume: 0.16, rate: kind === "burst" ? 0.9 : random(0.92, 1.14) });
      this.lastWhooshAt = now;
    }
    if (now - this.lastHitAt > 80) {
      this.playRandom("metalHit", { volume: 0.18, rate: random(0.92, 1.08), delay: 0.018 });
      this.lastHitAt = now;
    }
  }

  death() {
    this.playRandom("heavyImpact", { volume: 0.26, rate: random(0.9, 1.05) });
    this.playRandom("metalHit", { volume: 0.14, rate: 0.78, delay: 0.08 });
  }

  power(big) {
    this.healPing(big);
    if (big) this.playRandom("ultimateImpact", { volume: 0.12, rate: 1.25, delay: 0.16 });
  }

  healPing(big) {
    const volume = big ? 0.16 : 0.12;
    this.tone(880, 0.07, "triangle", volume);
    this.tone(1320, 0.08, "sine", volume * 0.9, 0.055);
    this.filteredNoise(0.035, 2400, volume * 0.28, "bandpass");
  }

  ultimate() {
    this.playRandom("ultimateCharge", { volume: 0.56, rate: 0.9 });
    this.playRandom("ultimateRise", { volume: 0.46, rate: 0.88, delay: 0.08 });
    this.playRandom("spinWhoosh", { volume: 0.38, rate: 0.68, delay: 0.12 });
    this.playRandom("ultimateMagic", { volume: 0.48, rate: 1.02, delay: 0.22 });
    this.playRandom("ultimateBoom", { volume: 0.72, rate: 0.86, delay: 0.34 });
    this.playRandom("ultimateImpact", { volume: 0.42, rate: 0.78, delay: 0.42 });
    this.playRandom("metalHit", { volume: 0.18, rate: 0.68, delay: 0.5 });
  }

  laser() {
    // Throttle to avoid audio spam when many tops fire simultaneously
    const now = performance.now();
    if (now - this.lastLaserAt < 80) return;
    this.lastLaserAt = now;
    // Short electric zap: high-pitch descending tone + brief noise burst
    this.rampTone(1800 + Math.random() * 400, 420, 0.09, "sawtooth", 0.06);
    this.filteredNoise(0.04, 6000 + Math.random() * 2000, 0.04, "bandpass");
  }

  winner() {
    this.playRandom("ultimateImpact", { volume: 0.24, rate: 1.12 });
    this.tone(660, 0.15, "triangle", 0.05, 0.08);
    this.tone(880, 0.22, "triangle", 0.05, 0.24);
  }

  startSpinLoop() {
    if (this.spinSource) return true;
    if (!this.ctx) return false;
    const buffer = this.getBuffer("spinLoop");
    if (!buffer) {
      this.syntheticSpinLoop();
      return true;
    }

    const source = this.ctx.createBufferSource();
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();
    source.buffer = buffer;
    source.loop = true;
    source.playbackRate.value = 0.88;
    filter.type = "lowpass";
    filter.frequency.value = 1800;
    gain.gain.value = this.volume(this.config.ambienceVolume * 0.45);
    source.connect(filter).connect(gain).connect(this.ctx.destination);
    source.start();
    this.spinSource = source;
    this.spinGain = gain;
    return true;
  }

  stopSpinLoop() {
    if (!this.spinSource) return;
    try {
      this.spinSource.stop();
    } catch {
      // Already stopped.
    }
    this.spinSource = null;
    this.spinGain = null;
  }

  startBgm() {
    if (this.bgmSource) return true;
    if (!this.ctx) return false;
    const buffer = this.getBuffer("bgm");
    if (!buffer) return false;

    const source = this.ctx.createBufferSource();
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();
    source.buffer = buffer;
    source.loop = true;
    filter.type = "lowpass";
    filter.frequency.value = 5200;
    gain.gain.value = this.musicGain(1);
    source.connect(filter).connect(gain).connect(this.ctx.destination);
    source.start();
    this.bgmSource = source;
    this.bgmGain = gain;
    return true;
  }

  stopBgm() {
    if (!this.bgmSource) return;
    try {
      this.bgmSource.stop();
    } catch {
      // Already stopped.
    }
    this.bgmSource = null;
    this.bgmGain = null;
  }

  updateLoopGains() {
    if (this.spinGain) this.spinGain.gain.value = this.volume(this.config.ambienceVolume * 0.45);
    if (this.bgmGain) this.bgmGain.gain.value = this.musicGain(1);
  }

  playRandom(group, options = {}) {
    const urls = SOUND_PATHS[group] || [];
    const url = urls[Math.floor(Math.random() * urls.length)];
    const buffer = this.buffers.get(url);
    if (!buffer) {
      this.fallback(group);
      return;
    }
    this.playBuffer(buffer, options);
  }

  getBuffer(group) {
    const url = SOUND_PATHS[group]?.[0];
    return url ? this.buffers.get(url) : null;
  }

  playBuffer(buffer, { volume = 0.5, rate = 1, delay = 0 } = {}) {
    if (this.activeOneShots > 16) return;
    const source = this.ctx.createBufferSource();
    const gain = this.ctx.createGain();
    source.buffer = buffer;
    source.playbackRate.value = rate;
    gain.gain.value = this.volume(volume);
    source.connect(gain).connect(this.ctx.destination);
    this.activeOneShots += 1;
    source.onended = () => {
      this.activeOneShots = Math.max(0, this.activeOneShots - 1);
    };
    source.start(this.ctx.currentTime + delay);
  }

  fallback(group) {
    if (group === "metalHit" || group === "attackWhoosh") this.swordClang();
    if (group === "heavyImpact" || group === "ultimateImpact") this.noise(0.22, 260, 0.22);
    if (group.startsWith("ultimate")) this.noise(0.36, 340, 0.34);
    if (group === "spinWhoosh") this.rampTone(170, 780, 0.34, "sawtooth", 0.14);
  }

  syntheticSpinLoop() {
    if (this.spinSource) return true;
    if (!this.ctx) return false;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = "sawtooth";
    osc.frequency.value = 72;
    gain.gain.value = this.volume(this.config.ambienceVolume * 0.38);
    osc.connect(gain).connect(this.ctx.destination);
    osc.start();
    this.spinSource = osc;
    this.spinGain = gain;
    return true;
  }

  syntheticBgmLoop() {
    if (this.bgmSource) return true;
    if (!this.ctx) return false;

    const master = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();
    const bass = this.ctx.createOscillator();
    const lead = this.ctx.createOscillator();
    const lfo = this.ctx.createOscillator();
    const lfoGain = this.ctx.createGain();

    bass.type = "sawtooth";
    bass.frequency.value = 55;
    lead.type = "square";
    lead.frequency.value = 110;
    lfo.type = "sine";
    lfo.frequency.value = 3.5;
    lfoGain.gain.value = 18;
    filter.type = "lowpass";
    filter.frequency.value = 900;
    master.gain.value = this.musicGain(0.8);

    lfo.connect(lfoGain).connect(filter.frequency);
    bass.connect(filter);
    lead.connect(filter);
    filter.connect(master).connect(this.ctx.destination);

    bass.start();
    lead.start();
    lfo.start();

    this.bgmSource = {
      stop() {
        bass.stop();
        lead.stop();
        lfo.stop();
      }
    };
    this.bgmGain = master;
    return true;
  }

  swordClang() {
    this.filteredNoise(0.045, 5200 + Math.random() * 1800, 0.05, "highpass");
    this.tone(1760 + Math.random() * 240, 0.055, "triangle", 0.045);
    setTimeout(() => this.tone(2920 + Math.random() * 360, 0.04, "sine", 0.03), 18);
  }

  tone(freq, duration, type, gainValue, delay = 0) {
    const start = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(this.volume(gainValue), start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    osc.connect(gain).connect(this.ctx.destination);
    osc.start(start);
    osc.stop(start + duration);
  }

  rampTone(from, to, duration, type, gainValue) {
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(from, now);
    osc.frequency.exponentialRampToValueAtTime(to, now + duration);
    gain.gain.setValueAtTime(this.volume(gainValue), now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(gain).connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + duration);
  }

  noise(duration, filterFreq, gainValue) {
    this.filteredNoise(duration, filterFreq, gainValue, "lowpass");
  }

  filteredNoise(duration, filterFreq, gainValue, filterType) {
    const sampleRate = this.ctx.sampleRate;
    const buffer = this.ctx.createBuffer(1, sampleRate * duration, sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    }
    const source = this.ctx.createBufferSource();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();
    filter.type = filterType;
    filter.frequency.value = filterFreq;
    filter.Q.value = filterType === "bandpass" ? 7 : 1;
    gain.gain.value = this.volume(gainValue);
    source.buffer = buffer;
    source.connect(filter).connect(gain).connect(this.ctx.destination);
    source.start();
  }

  volume(value) {
    return value * this.config.masterVolume * this.config.sfxVolume * this.sfxVolume;
  }

  musicGain(value) {
    return value * this.config.masterVolume * 1.8 * this.musicVolumeLevel;
  }
}

function random(min, max) {
  return min + Math.random() * (max - min);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));
}
