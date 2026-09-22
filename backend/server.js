import mysql from "mysql2/promise";
import { loadConfig } from "./config.js";
import { Repository } from "./repository.js";
import { createApp } from "./app.js";
import { startWorker } from "./notifications.js";

const config = loadConfig();
const pool = mysql.createPool(config.db);
const repo = new Repository(pool);
await repo.rows("SELECT 1");
const server = createApp({ repo, config }).listen(config.port, "0.0.0.0", () =>
  console.log(`MQ-FIRE: porta ${config.port}`),
);
server.headersTimeout = 10000;
server.requestTimeout = 15000;
const stopWorker = startWorker(repo, config);
let closing = false;
async function shutdown() {
  if (closing) return;
  closing = true;
  const deadline = setTimeout(() => process.exit(1), 15000);
  deadline.unref();
  await new Promise((resolve) => server.close(resolve));
  await stopWorker();
  await pool.end();
  clearTimeout(deadline);
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
