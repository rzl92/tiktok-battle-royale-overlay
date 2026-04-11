# TikFinity Webhook Mapping

Use HTTP GET actions in TikFinity or a similar live automation tool.

## Join

```text
http://localhost:3000/webhook1?username={nickname}
```

## Gift / HP Boost

```text
http://localhost:3000/webhook2?username={nickname}&coins={coins}
```

The MVP formula is `coins * 25 HP`.

## Ultimate

```text
http://localhost:3000/webhook3?username={nickname}
```

Each warrior has an ultimate cooldown configured in `config/gameConfig.js`.

## Avatar Injection

Nickname alone is not enough to reliably fetch TikTok profile images. If your automation layer has avatar URLs, send them to:

```http
POST /avatar
Content-Type: application/json

{
  "username": "viewer_1",
  "avatarUrl": "https://example.com/avatar.png"
}
```
