import crypto from "node:crypto";

const TIKTOK_OEMBED = "https://www.tiktok.com/oembed?url=https://www.tiktok.com/@";
const FETCH_TIMEOUT_MS = 6000;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export class AvatarResolver {
  constructor() {
    this.manualAvatars = new Map();
    // Cache: key -> { url, expiresAt }
    this.fetchCache = new Map();
    this.pendingFetches = new Set();
  }

  setManualAvatar(username, avatarUrl) {
    const key = normalizeKey(username);
    if (!key || !isSafeUrl(avatarUrl)) return null;
    this.manualAvatars.set(key, avatarUrl);
    this.fetchCache.set(key, { url: avatarUrl, expiresAt: Date.now() + CACHE_TTL_MS });
    return avatarUrl;
  }

  resolve(username) {
    const key = normalizeKey(username);
    if (this.manualAvatars.has(key)) return this.manualAvatars.get(key);

    const cached = this.fetchCache.get(key);
    if (cached && Date.now() < cached.expiresAt) return cached.url;

    return this._placeholderUrl(key);
  }

  // Called from webhooks when no avatar is in payload — fire-and-forget
  async fetchAndStore(username) {
    const key = normalizeKey(username);
    if (!key) return;
    if (this.manualAvatars.has(key)) return;
    if (this.pendingFetches.has(key)) return;

    const cached = this.fetchCache.get(key);
    if (cached && Date.now() < cached.expiresAt) return;

    this.pendingFetches.add(key);
    try {
      const url = await fetchTikTokAvatarUrl(username);
      if (url) {
        this.fetchCache.set(key, { url, expiresAt: Date.now() + CACHE_TTL_MS });
      }
    } catch {
      // silently ignore — overlay keeps working with placeholder
    } finally {
      this.pendingFetches.delete(key);
    }
  }

  // Return resolved URL including freshly fetched cache if available
  resolveLatest(username) {
    const key = normalizeKey(username);
    if (this.manualAvatars.has(key)) return this.manualAvatars.get(key);
    const cached = this.fetchCache.get(key);
    if (cached && Date.now() < cached.expiresAt) return cached.url;
    return this._placeholderUrl(key);
  }

  _placeholderUrl(key) {
    const seed = crypto.createHash("sha1").update(key || "viewer").digest("hex").slice(0, 8);
    return `/assets/avatars/avatar.svg?seed=${seed}`;
  }
}

async function fetchTikTokAvatarUrl(username) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const resp = await fetch(`${TIKTOK_OEMBED}${encodeURIComponent(username)}`, {
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; TikTokBattleRoyaleBot/1.0)" }
    });
    if (!resp.ok) return null;
    const json = await resp.json();
    const thumb = json?.thumbnail_url || json?.author_thumbnail || null;
    if (thumb && (thumb.startsWith("https://") || thumb.startsWith("http://"))) return thumb;
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function normalizeKey(value) {
  return String(value || "").trim().toLowerCase();
}

function isSafeUrl(value) {
  const url = String(value || "").trim();
  return url.startsWith("https://") || url.startsWith("http://") || url.startsWith("/assets/");
}
