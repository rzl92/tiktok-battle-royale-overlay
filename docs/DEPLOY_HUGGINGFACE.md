# Deploy Backend ke Hugging Face Spaces

Hugging Face Spaces menjalankan backend webhook pada port `7860`. Production Space tidak menyajikan overlay web; overlay dan simulator dijalankan dari aplikasi desktop.

## Push Manual

```powershell
cd C:\Users\Rizal\tiktok-battle-royale-overlay
npm run check
git push hf main
```

## Push Otomatis

```powershell
npm run deploy -- -Message "Deploy backend"
```

Atau double-click:

```text
Deploy Backend.cmd
```

## Endpoint

```text
https://rzl92-tiktok-battle-royale-overlay.hf.space/health
https://rzl92-tiktok-battle-royale-overlay.hf.space/webhook1?username={nickname}
https://rzl92-tiktok-battle-royale-overlay.hf.space/webhook2?username={nickname}&coins={giftCount}
https://rzl92-tiktok-battle-royale-overlay.hf.space/webhook3?username={nickname}
https://rzl92-tiktok-battle-royale-overlay.hf.space/reset
https://rzl92-tiktok-battle-royale-overlay.hf.space/debug-last
```

Jika `{nickname}` tidak diganti oleh TikFinity, backend akan membalas error diagnostic. Gunakan field yang benar dari TikFinity, atau kirim body JSON dengan salah satu field yang didukung: `username`, `nickname`, `uniqueId`, `userId`, `displayName`, atau `name`.
