# TikFinity Webhook Mapping

Use the Hugging Face backend URL when the desktop app is configured with the same `BACKEND_URL`.

## Join

```text
https://rzl92-tiktok-battle-royale-overlay.hf.space/webhook1?username={nickname}
```

## Gift / HP Boost

```text
https://rzl92-tiktok-battle-royale-overlay.hf.space/webhook2?username={nickname}&coins={giftCount}
```

`coins` can also be sent as `giftCount`, `repeatCount`, `amount`, or `diamondCount`.

## Ultimate

```text
https://rzl92-tiktok-battle-royale-overlay.hf.space/webhook3?username={nickname}
```

## Supported Username Fields

The backend accepts `username`, `nickname`, `uniqueId`, `userId`, `displayName`, and `name`, including common nested fields such as `user.nickname` or `data.uniqueId`.

If TikFinity sends the literal text `{nickname}`, the backend returns a diagnostic error. In that case, change the TikFinity variable to the actual nickname/uniqueId token TikFinity provides.

## Avatar Injection

```http
POST /avatar
Content-Type: application/json

{
  "username": "viewer_1",
  "avatarUrl": "https://example.com/avatar.png"
}
```
