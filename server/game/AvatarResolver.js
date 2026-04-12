const TIKTOK_PROFILE_BASE = "https://www.tiktok.com/@";
const FETCH_TIMEOUT_MS = 8000;
const FALLBACK_TTL_MS = 60 * 60 * 1000;
const NEGATIVE_TTL_MS = 10 * 60 * 1000;
const MIN_TTL_MS = 5 * 60 * 1000;

export class AvatarResolver {
  constructor() {
    this.manualAvatars = new Map();
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
    return null;
  }

  resolveLatest(username) {
    const key = normalizeKey(username);
    if (this.manualAvatars.has(key)) return this.manualAvatars.get(key);
    const cached = this.fetchCache.get(key);
    if (cached && Date.now() < cached.expiresAt - MIN_TTL_MS) return cached.url;
    return null;
  }

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
      this.fetchCache.set(key, result || { url: null, expiresAt: Date.now() + FALLBACK_TTL_MS });
    } catch {
      this.fetchCache.set(key, { url: null, expiresAt: Date.now() + NEGATIVE_TTL_MS });
    } finally {
      this.pendingFetches.delete(key);
    }
  }
}

async function fetchTikTokAvatarUrl(username) {
  const html = await fetchProfileHtml(username);
  if (!html) return null;

  for (const field of ["avatarLarger", "avatarMedium", "avatarThumb"]) {
    const match = html.match(new RegExp(`"${field}":"([^"]+)"`));
    if (match) {
      const url = decodeEscapes(match[1]);
      if (url.startsWith("https://")) return { url, expiresAt: extractExpiry(url) };
    }
  }

  const sigiMatch = html.match(/<script id="SIGI_STATE"[^>]*>(\{.+?\})<\/script>/s);
  if (sigiMatch) {
    try {
      const state = JSON.parse(sigiMatch[1]);
      const users = state?.UserModule?.users || state?.ItemModule || {};
      for (const key of Object.keys(users)) {
        const user = users[key];
        const url = user?.avatarLarger || user?.avatarMedium || user?.avatarThumb || user?.author?.avatarLarger;
        if (url && url.startsWith("https://")) return { url, expiresAt: extractExpiry(url) };
      }
    } catch {
      // Continue with CDN fallback.
    }
  }

  const cdnMatch = html.match(/"(https:\/\/p[0-9]+-sign\.tiktokcdn(?:-us)?\.com\/tos-[^"]{20,}\.(?:jpeg|jpg|webp)[^"]*?)"/);
  if (cdnMatch) {
    const url = decodeEscapes(cdnMatch[1]);
    return { url, expiresAt: extractExpiry(url) };
  }

  return null;
}

async function fetchProfileHtml(username) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const resp = await fetch(`${TIKTOK_PROFILE_BASE}${encodeURIComponent(username)}`, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "gzip, deflate, br",
        "Cache-Control": "no-cache",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "none",
        "Sec-Ch-Ua": '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
        "Sec-Ch-Ua-Mobile": "?0",
        "Sec-Ch-Ua-Platform": '"Windows"',
        "Upgrade-Insecure-Requests": "1"
      }
    });
    if (!resp.ok) return null;
    return await resp.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function decodeEscapes(str) {
  return str.replace(/\\u([0-9a-fA-F]{4})/g, (_, code) =>
    String.fromCharCode(Number.parseInt(code, 16))
  );
}

function extractExpiry(url) {
  try {
    const match = url.match(/[?&]x-expires=(\d+)/);
    if (match) {
      const expSec = Number(match[1]);
      if (expSec > 1e9) return expSec * 1000;
    }
  } catch {
    // Use fallback TTL below.
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
