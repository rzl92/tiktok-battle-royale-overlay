import crypto from "node:crypto";

export class AvatarResolver {
  constructor() {
    this.manualAvatars = new Map();
  }

  setManualAvatar(username, avatarUrl) {
    const key = normalizeKey(username);
    if (!key || !isSafeUrl(avatarUrl)) return null;
    this.manualAvatars.set(key, avatarUrl);
    return avatarUrl;
  }

  resolve(username) {
    const key = normalizeKey(username);
    if (this.manualAvatars.has(key)) {
      return this.manualAvatars.get(key);
    }

    // Placeholder logic: real TikTok avatar fetching needs an upstream provider
    // or TikFinity payload data. Nickname alone is not enough for reliable lookup.
    const seed = crypto.createHash("sha1").update(key || "viewer").digest("hex").slice(0, 8);
    return `/assets/avatars/avatar.svg?seed=${seed}`;
  }
}

function normalizeKey(value) {
  return String(value || "").trim().toLowerCase();
}

function isSafeUrl(value) {
  const url = String(value || "").trim();
  return url.startsWith("https://") || url.startsWith("http://") || url.startsWith("/assets/");
}
