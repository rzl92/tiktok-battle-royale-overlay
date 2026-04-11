# Deploy Gratis ke Hugging Face Spaces

Hugging Face Spaces bisa menjalankan custom Docker app dan mengekspos port `7860`. Project ini sudah punya `Dockerfile` yang menjalankan Node/Express pada port tersebut.

## 1. Buat Space Baru

1. Buka `https://huggingface.co/spaces`.
2. Klik `Create new Space`.
3. Isi nama, misalnya `tiktok-battle-royale-overlay`.
4. Pilih SDK: `Docker`.
5. Visibility bisa `Public`.
6. Klik `Create Space`.

## 2. Push Project ke Space

Di halaman Space, copy Git URL. Bentuknya biasanya:

```text
https://huggingface.co/spaces/USERNAME/tiktok-battle-royale-overlay
```

Lalu dari PowerShell:

```powershell
cd C:\Users\Rizal\tiktok-battle-royale-overlay
git remote add hf https://huggingface.co/spaces/USERNAME/tiktok-battle-royale-overlay
git push hf main
```

Kalau Hugging Face meminta login, buat access token di:

```text
https://huggingface.co/settings/tokens
```

Gunakan username Hugging Face sebagai username, dan token sebagai password.

## 3. Tunggu Build

Di tab `Logs`, tunggu sampai build selesai dan Space status menjadi `Running`.

URL app akan seperti:

```text
https://USERNAME-tiktok-battle-royale-overlay.hf.space
```

## 4. Test Endpoint

```text
https://USERNAME-tiktok-battle-royale-overlay.hf.space/health
```

Join:

```text
https://USERNAME-tiktok-battle-royale-overlay.hf.space/webhook1?username=tester
```

Overlay:

```text
https://USERNAME-tiktok-battle-royale-overlay.hf.space/client/overlay.html
```

## 5. TikFinity Webhooks

Join:

```text
https://USERNAME-tiktok-battle-royale-overlay.hf.space/webhook1?username={nickname}
```

Gift:

```text
https://USERNAME-tiktok-battle-royale-overlay.hf.space/webhook2?username={nickname}&coins={coins}
```

Ultimate:

```text
https://USERNAME-tiktok-battle-royale-overlay.hf.space/webhook3?username={nickname}
```

## Notes

Free hosting can sleep or rebuild, so open the overlay a few minutes before live. In-memory game state resets whenever the container restarts.
