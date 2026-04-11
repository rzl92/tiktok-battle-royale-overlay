# TikTok Battle Royale Overlay

A browser-based TikTok Live interactive battle royale auto-battler for OBS Browser Source. Viewers join as sharp battle tops, gifts become HP, HP scales size and damage, and ultimates can wipe out nearby enemies.

## Architecture

- `server/`: Node.js, Express, Socket.IO, webhook routes, in-memory player state, battle simulation.
- `client/`: OBS-ready vertical HTML5 Canvas overlay, HUD, leaderboard, battle top renderer, simulator page.
- `config/`: HP, damage, class, aura, ultimate, and timing formulas.
- `assets/`: fallback avatar and placeholder sound documentation.
- `docs/`: TikFinity webhook mapping notes.

The backend owns all gameplay state. The frontend receives snapshots and event bursts through Socket.IO, then renders lightweight sharp gasing/beyblade-style Canvas effects and plays original WebAudio-generated sounds.

## File Tree

```text
tiktok-battle-royale-overlay/
  .env.example
  package.json
  README.md
  assets/
    avatars/
      avatar.svg
    sounds/
      README.md
  client/
    overlay.html
    simulator.html
    styles.css
    src/
      main.js
      renderer.js
      simulator.js
      soundManager.js
      uiManager.js
  config/
    gameConfig.js
  docs/
    TIKFINITY.md
  server/
    index.js
    game/
      AvatarResolver.js
      BattleEngine.js
      PlayerManager.js
    routes/
      simulator.js
      webhooks.js
```

## Install

```bash
npm install
```

## Free Deployment

This project includes `render.yaml` for Render Free Web Service deployment. See:

```text
docs/DEPLOY_RENDER.md
```

Optional:

```bash
cp .env.example .env
```

On Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

## Run Locally

```bash
npm start
```

Default URLs:

- Overlay: `http://localhost:3000/client/overlay.html`
- Simulator: `http://localhost:3000/simulator`
- Health check: `http://localhost:3000/health`

## Add To OBS Browser Source

1. Add a new Browser Source.
2. Set URL to `http://localhost:3000/client/overlay.html`.
3. Use a vertical canvas size such as `1080x1920`.
4. Enable `Shutdown source when not visible` if you want each show to restart cleanly.
5. Set `OVERLAY_TRANSPARENT=true` in `.env` if you want a transparent OBS overlay background.

## Webhook Examples

Join with 15 HP:

```text
http://localhost:3000/webhook1?username=Rizal
```

Gift HP boost:

```text
http://localhost:3000/webhook2?username=Rizal&coins=10
```

This adds `10 * 25 = 250 HP`.

Ultimate skill:

```text
http://localhost:3000/webhook3?username=Rizal
```

Manual avatar injection:

```bash
curl -X POST http://localhost:3000/avatar \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"Rizal\",\"avatarUrl\":\"https://example.com/avatar.png\"}"
```

## Gameplay Rules

- `webhook1` creates one warrior per nickname. Duplicates are ignored.
- Starting HP is always `15`.
- `webhook2` creates the warrior if missing, then adds `coins * 25 HP`.
- Size scales with HP using `sizeScale = 1 + min(hp / 300, 8)`.
- Damage scales with HP using `damage = 2 + floor(hp * 0.03)`, then class multipliers apply.
- Aura levels trigger at `1000`, `3000`, and `5000` HP.
- `webhook3` creates the caster if missing, checks cooldown, then eliminates nearby or random enemies.
- Kills update the leaderboard in real time.
- One remaining warrior wins. The round resets automatically after the configured delay.

## Classes

Warrior classes are assigned deterministically from nickname:

- `Swordsman`: balanced.
- `Tank`: takes less damage, slower, lower damage.
- `Assassin`: faster attacks, takes more damage.
- `Berserker`: strong HP-to-damage feel.
- `Mage`: ranged burst.

Tune these in `config/gameConfig.js`.

## Tuning

Open `config/gameConfig.js` and adjust:

- `player.baseHP`
- `player.giftHPPerCoin`
- `formulas.sizeScale`
- `formulas.damage`
- `aura.thresholds`
- `ultimate.cooldownMs`
- `ultimate.radius`
- `ultimate.maxEliminations`
- `classes`

Restart the server after config changes.

## Sounds And Images

The MVP uses local MP3 sound effects loaded through WebAudio in `client/src/soundManager.js`:

- gasing spin loop
- whoosh attack
- metal hit
- aura power-up
- ultimate impact
- action battle background music
- winner sting fallback

The current files are free Mixkit sound effects. Source and license notes are tracked in `assets/sounds/ATTRIBUTION.md`.

To use your own production audio, place files in `assets/sounds/` and update the `SOUND_PATHS` map in `SoundManager`.

The fallback avatar is `assets/avatars/avatar.svg`. The renderer supports external avatar URLs through the `/avatar` endpoint.

## TikTok Avatar Limitation

This project intentionally uses an `AvatarResolver` interface. Real TikTok avatar fetching is placeholder logic because nickname alone is not a reliable public lookup key. For production, pass avatar URLs from TikFinity, a TikTok Live connector, or an approved profile API into `/avatar`.

## Performance Notes

The server is designed for an MVP target of 50 to 200 active warriors. For larger streams:

- add spatial partitioning for target scans,
- persist player and leaderboard state in Redis or a database,
- run multiple battle rooms,
- add webhook authentication,
- rate-limit endpoints by source,
- move high-volume event processing to a queue.

## Production Improvements

- Add signed webhook secrets.
- Add persistent season leaderboards.
- Store TikTok user IDs separately from nicknames.
- Add round queueing and sponsor-safe moderation filters.
- Add custom class art and licensed sound assets.
- Add admin controls for reset, pause, ban, and manual boosts.
