import crypto from "node:crypto";

const TIKTOK_PROFILE_BASE = "https://www.tiktok.com/@";
const FETCH_TIMEOUT_MS = 8000;
const FALLBACK_TTL_MS = 60 * 60 * 1000; // 1 hour fallback if no expiry found
const MIN_TTL_MS = 5 * 60 * 1000;       // re-fetch if less than 5 minutes left

export class AvatarResolver {
  constructor() {
    this.manualAvatars = new Map();
    // key -> { url, expiresAt }
    this.fetchCache = new Map();
    this.pendingFetches = new Set();
  }

  setManualAvatar(username, avatarUrl) {
    const key = normalizeKey(username);
    if (!key || !isSafeUrl(avatarUrl)) return null;
    this.manualAvatars.set(key, avatarUrl);
    this.fetchCache.set(key, { url: avatarUrl, expiresAt: Date.now() + FALLBACK_TTL_MS });
    return avatarUrl;
  }

  resolve(username) {
    const key = normalizeKey(username);
    if (this.manualAvatars.has(key)) return this.manualAvatars.get(key);
    const cached = this.fetchCache.get(key);
    if (cached && Date.now() < cached.expiresAt - MIN_TTL_MS) return cached.url;
    return this._placeholderUrl(key);
  }

  resolveLatest(username) {
    const key = normalizeKey(username);
    if (this.manualAvatars.has(key)) return this.manualAvatars.get(key);
    const cached = this.fetchCache.get(key);
    if (cached && Date.now() < cached.expiresAt - MIN_TTL_MS) return cached.url;
    return this._placeholderUrl(key);
  }

  // Fire-and-forget: scrape TikTok profile in background
  async fetchAndStore(username) {
    const key = normalizeKey(username);
    if (!key) return;
    if (this.manualAvatars.has(key)) return;
    if (this.pendingFetches.has(key)) return;

    const cached = this.fetchCache.get(key);
    if (cached && Date.now() < cached.expiresAt - MIN_TTL_MS) return;

    this.pendingFetches.add(key);
    try {
      const result = await fetchTikTokAvatarUrl(username);
      if (result) {
        this.fetchCache.set(key, result); // { url, expiresAt }
      }
    } catch {
      // silently ignore — overlay keeps working with placeholder
    } finally {
      this.pendingFetches.delete(key);
    }
  }

  _placeholderUrl(key) {
    const seed = crypto.createHash("sha1").update(key || "viewer").digest("hex").slice(0, 8);
    return `/assets/avatars/avatar.svg?seed=${seed}`;
  }
}

// Scrape the TikTok profile page and extract avatarLarger URL
async function fetchTikTokAvatarUrl(username) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const resp = await fetch(`${TIKTOK_PROFILE_BASE}${encodeURIComponent(username)}`, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
      }
    });
    if (!resp.ok) return null;
    const html = await resp.text();

    // Extract "avatarLarger":"<url>" from embedded JSON
    const match = html.match(/"avatarLarger":"([^"]+)"/);
    if (!match) return null;

    // Decode unicode escapes (e.g. \u002F -> /)
    const rawUrl = match[1].replace(/\\u([0-9a-fA-F]{4})/g, (_, code) =>
      String.fromCharCode(Number.parseInt(code, 16))
    );

    if (!rawUrl.startsWith("https://") && !rawUrl.startsWith("http://")) return null;

    // Parse x-expires to set cache TTL aligned with TikTok's signed URL expiry
    const expiresAt = extractExpiry(rawUrl);
    return { url: rawUrl, expiresAt };
  } finally {
    clearTimeout(timer);
  }
}

// Extract x-expires unix timestamp from signed TikTok CDN URL
function extractExpiry(url) {
  try {
    const match = url.match(/[?&]x-expires=(\d+)/);
    if (match) {
      const expSec = Number(match[1]);
      if (expSec > 1e9) return expSec * 1000; // convert seconds → ms
    }
  } catch {
    // ignore
  }
  return Date.now() + FALLBACK_TTL_MS;
}

function normalizeKey(value) {
  return String(value || "").trim().toLowerCase();
}

function isSafeUrl(value) {
  const url = String(value || "").trim();
  return url.startsWith("https://") || url.startsWith("http://") || url.startsWith("/assets/");
}
