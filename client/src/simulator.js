const result = document.getElementById("result");
const username = document.getElementById("username");
const coins = document.getElementById("coins");
const avatarUrl = document.getElementById("avatarUrl");
const params = new URLSearchParams(window.location.search);
const backendUrl = (params.get("backend") || window.OVERLAY_BACKEND_URL || "").trim().replace(/\/$/, "");
const openOverlayLink = document.getElementById("openOverlayLink");

if (backendUrl && openOverlayLink) {
  openOverlayLink.href = `/client/overlay.html?backend=${encodeURIComponent(backendUrl)}`;
}

document.addEventListener("click", async (event) => {
  const action = event.target?.dataset?.action;
  if (!action) return;

  try {
    if (action === "join") await call(`/webhook1?username=${encodeURIComponent(username.value)}`);
    if (action === "gift") {
      await call(`/webhook2?username=${encodeURIComponent(username.value)}&coins=${encodeURIComponent(coins.value)}`);
    }
    if (action === "ultimate") await call(`/webhook3?username=${encodeURIComponent(username.value)}`);
    if (action === "avatar") {
      await post("/avatar", { username: username.value, avatarUrl: avatarUrl.value });
    }
    if (action === "swarm") await spawnSwarm(false);
    if (action === "whales") await spawnSwarm(true);
    if (action === "reset") await call("/reset");
  } catch (error) {
    result.textContent = String(error);
  }
});

async function call(path) {
  const response = await fetch(`${backendUrl}${path}`);
  const data = await response.json();
  result.textContent = JSON.stringify(data, null, 2);
}

async function post(path, body) {
  const response = await fetch(`${backendUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const data = await response.json();
  result.textContent = JSON.stringify(data, null, 2);
}

async function spawnSwarm(power) {
  const prefix = power ? "whale" : "fighter";
  const total = power ? 20 : 40;
  const concurrency = 8;
  const jobs = [];
  for (let i = 1; i <= total; i += 1) {
    const idx = i;
    const name = `${prefix}_${Math.floor(Math.random() * 9999)}_${idx}`;
    const avatarUrl = `https://api.dicebear.com/8.x/pixel-art/svg?seed=${encodeURIComponent(name)}`;
    jobs.push(async () => {
      await fetch(`${backendUrl}/webhook1?username=${encodeURIComponent(name)}&profilePictureUrl=${encodeURIComponent(avatarUrl)}`);
      if (power && idx <= 5) {
        await fetch(`${backendUrl}/webhook2?username=${encodeURIComponent(name)}&coins=${idx * 45}`);
      }
    });
  }
  // Run jobs with bounded concurrency so we don't open 40 sockets at once
  // but also don't serialize into 40 round-trips.
  const workers = Array.from({ length: Math.min(concurrency, jobs.length) }, async () => {
    while (jobs.length) {
      const job = jobs.shift();
      if (job) await job();
    }
  });
  await Promise.all(workers);
  result.textContent = `${power ? "Power whales" : "Bots"} spawned.`;
}
