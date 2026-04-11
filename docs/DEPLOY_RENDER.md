# Deploy Gratis ke Render

Render cocok untuk MVP ini karena mendukung Node.js web service, HTTPS publik, dan WebSocket.

## 1. Push Project ke GitHub

```powershell
cd C:\Users\Rizal\tiktok-battle-royale-overlay
git init
git add .
git commit -m "Initial TikTok battle royale overlay"
```

Buat repo kosong di GitHub, lalu jalankan command remote yang diberikan GitHub, misalnya:

```powershell
git remote add origin https://github.com/USERNAME/tiktok-battle-royale-overlay.git
git branch -M main
git push -u origin main
```

## 2. Deploy di Render

1. Buka `https://render.com`.
2. Login.
3. Klik `New`.
4. Pilih `Web Service`.
5. Connect GitHub repo project ini.
6. Render akan membaca `render.yaml`.
7. Pilih service `tiktok-battle-royale-overlay`.
8. Deploy.

## 3. URL Setelah Deploy

Render akan memberi URL seperti:

```text
https://tiktok-battle-royale-overlay.onrender.com
```

Gunakan URL itu untuk TikFinity:

```text
https://tiktok-battle-royale-overlay.onrender.com/webhook1?username={nickname}
```

```text
https://tiktok-battle-royale-overlay.onrender.com/webhook2?username={nickname}&coins={coins}
```

```text
https://tiktok-battle-royale-overlay.onrender.com/webhook3?username={nickname}
```

OBS bisa pakai:

```text
https://tiktok-battle-royale-overlay.onrender.com/client/overlay.html
```

Untuk performa terbaik, kalau OBS dan server jalan di komputer yang sama, OBS tetap lebih bagus pakai:

```text
http://localhost:3000/client/overlay.html
```

## Catatan Free Tier

Render Free Web Service bisa sleep saat idle. Saat ada request pertama setelah sleep, service perlu waktu untuk bangun. Untuk live yang serius, pakai instance berbayar kecil atau VPS.
