import assert from "node:assert/strict";
import mysql from "mysql2/promise";
import { loadConfig } from "../backend/config.js";
import { migrate } from "../backend/migrations.js";
import { token, hash } from "../backend/domain.js";

// Gate de CI: só aceita banco de teste VAZIO. Não apaga nem recria tabelas.
if (process.env.RUN_DB_TESTS !== "1" || !process.env.DB_NAME?.endsWith("_test"))
  throw new Error("Exige RUN_DB_TESTS=1 e banco dedicado _test.");
const c = await mysql.createConnection(loadConfig().db);
try {
  const [tables] = await c.query("SHOW TABLES");
  if (tables.length)
    throw new Error(
      "Ensaio de upgrade exige banco vazio; nenhum dado foi apagado.",
    );
  await migrate(c, "001_initial.sql");
  const [user] = await c.execute(
    "INSERT INTO users (email,password_hash) VALUES (?,?)",
    ["upgrade@example.test", "not-a-login-hash"],
  );
  await c.execute(
    "INSERT INTO devices (id,user_id,name,token_hash,config_version) VALUES (?,?,?,?,?)",
    ["upgrade-device", user.insertId, "fixture", hash(token()), 4],
  );
  await c.execute(
    "INSERT INTO sensors (device_id,channel,name,high_threshold,low_threshold,confirm_ms) VALUES (?,?,?,?,?,?)",
    ["upgrade-device", "mq2", "fixture", 888, 555, 1234],
  );
  await migrate(c);
  await migrate(c);
  const [[revision]] = await c.execute(
    "SELECT snapshot,reason FROM config_revisions WHERE device_id=? AND version=4",
    ["upgrade-device"],
  );
  const snapshot =
    typeof revision.snapshot === "string"
      ? JSON.parse(revision.snapshot)
      : revision.snapshot;
  assert.equal(snapshot.version, 4);
  assert(Array.isArray(snapshot.sensors));
  assert.equal(snapshot.sensors[0].high, 888);
  assert.equal(snapshot.sensors[0].confirmMs, 1234);
  assert.equal(revision.reason, "baseline_migration");
  const [[count]] = await c.execute(
    "SELECT COUNT(*) AS n FROM config_revisions WHERE device_id=?",
    ["upgrade-device"],
  );
  assert.equal(count.n, 1);
  console.log(
    "Upgrade 001 → 002 preserva limites existentes e não inventa versões passadas; migração repetida OK.",
  );
} finally {
  await c.end();
}
