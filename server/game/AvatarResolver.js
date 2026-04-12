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
    return null;
  }

  resolveLatest(username) {
    const key = normalizeKey(username);
    if (this.manualAvatars.has(key)) return this.manualAvatars.get(key);
    const cached = this.fetchCache.get(key);
    if (cached && Date.now() < cached.expiresAt - MIN_TTL_MS) return cached.url;
    return null;
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

}

// Scrape the TikTok profile page and extract an avatar URL.
// Tries multiple strategies to handle different page structures TikTok serves.
async function fetchTikTokAvatarUrl(username) {
  const html = await fetchProfileHtml(username);
  if (!html) return null;

  // Strategy 1: regex scan for avatar field names embedded in JSON blobs
  // TikTok embeds user data in multiple formats depending on region/A-B tests
  for (const field of ["avatarLarger", "avatarMedium", "avatarThumb"]) {
    const match = html.match(new RegExp(`"${field}":"([^"]+)"`));
    if (match) {
      const url = decodeEscapes(match[1]);
      if (url.startsWith("https://")) return { url, expiresAt: extractExpiry(url) };
    }
  }

  // Strategy 2: parse SIGI_STATE (newer TikTok page structure used in many regions)
  const sigiMatch = html.match(/<script id="SIGI_STATE"[^>]*>(\{.+?\})<\/script>/s);
  if (sigiMatch) {
    try {
      const state = JSON.parse(sigiMatch[1]);
      // User data lives under UserModule.users or UserPage.uniqueId keyed objects
      const users = state?.UserModule?.users || state?.ItemModule || {};
      for (const key of Object.keys(users)) {
        const u = users[key];
        const url = u?.avatarLarger || u?.avatarMedium || u?.avatarThumb || u?.author?.avatarLarger;
        if (url && url.startsWith("https://")) return { url, expiresAt: extractExpiry(url) };
      }
    } catch { /* malformed JSON, continue */ }
  }

  // Strategy 3: look for any TikTok CDN image URL referencing a profile picture
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
