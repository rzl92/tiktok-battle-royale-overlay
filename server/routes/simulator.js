import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function createSimulatorRouter() {
  const router = express.Router();

  router.get("/simulator", (req, res) => {
    res.sendFile(path.join(__dirname, "../../client/simulator.html"));
  });

  return router;
}
