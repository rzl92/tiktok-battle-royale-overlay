import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createBattleServer } from "./createApp.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, "..");

const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || "0.0.0.0";

const { httpServer } = createBattleServer({
  rootDir,
  staticClient: false,
  transparent: false
});

httpServer.listen(port, host, () => {
  console.log(`TikTok Battle Royale backend running at http://localhost:${port}`);
  console.log(`Webhooks: http://localhost:${port}/webhook1?username=viewer`);
  console.log(`Health:   http://localhost:${port}/health`);
});
