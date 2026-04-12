---
title: Tiktok Battle Royale Backend
emoji: 🌀
colorFrom: blue
colorTo: yellow
sdk: docker
app_port: 7860
pinned: false
---

# TikTok Battle Royale

Desktop-first TikTok battle royale overlay. The portable Electron app renders the arena and simulator locally. The deployed Hugging Face Space is backend-only: webhook API, Socket.IO state, health, reset, and debug endpoints.

## Runtime Shape

- Desktop app: serves local UI assets, renders the battle overlay, opens the simulator, and connects to `BACKEND_URL` when configured.
- Backend server: owns battle state in memory, accepts TikFinity webhooks, and streams snapshots/events over Socket.IO.
- Public web overlay: intentionally not served by the production backend.

## Local Desktop

```powershell
npm install
npm run desktop
```

Set remote backend in `.env`:

```text
BACKEND_URL=https://rzl92-tiktok-battle-royale-overlay.hf.space
```

Leave `BACKEND_URL` empty to run everything locally on `http://127.0.0.1:3000`.
The portable EXE defaults to the Hugging Face backend if no `.env` is present.

## Portable EXE

```powershell
npm run build:portable
```

Or double-click:

```text
Build Portable EXE.cmd
```

The generated EXE is written to `dist/`.

## Deploy Backend

```powershell
npm run deploy -- -Message "Deploy backend"
```

Or double-click:

```text
Deploy Backend.cmd
```

The deploy script runs checks, commits changes when present, pushes to GitHub, and pushes to Hugging Face.

## Backend Endpoints

Join:

```text
https://rzl92-tiktok-battle-royale-overlay.hf.space/webhook1?username={nickname}
```

Gift:

```text
https://rzl92-tiktok-battle-royale-overlay.hf.space/webhook2?username={nickname}&coins={giftCount}
```

Ultimate:

```text
https://rzl92-tiktok-battle-royale-overlay.hf.space/webhook3?username={nickname}
```

Reset:

```text
https://rzl92-tiktok-battle-royale-overlay.hf.space/reset
```

Health:

```text
https://rzl92-tiktok-battle-royale-overlay.hf.space/health
```

Last webhook debug records:

```text
https://rzl92-tiktok-battle-royale-overlay.hf.space/debug-last
```

The webhook parser accepts `username`, `nickname`, `uniqueId`, `userId`, `displayName`, and `name`, including common nested `user.*`, `data.*`, and `event.*` payloads. If TikFinity sends the literal text `{nickname}`, the backend returns a diagnostic error instead of silently spawning a fake player named `nickname`.
