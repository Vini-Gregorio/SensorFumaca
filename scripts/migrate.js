import mysql from "mysql2/promise";
import { readdir, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { loadConfig } from "../backend/config.js";

const connection = await mysql.createConnection(loadConfig().db);
try {
  const [[lock]] = await connection.query(
    "SELECT GET_LOCK('mqfire_migrations',30) AS acquired",
  );
  if (lock.acquired !== 1) throw new Error("Outra migração está em execução.");
  await connection.query(
    "CREATE TABLE IF NOT EXISTS schema_migrations (version VARCHAR(100) PRIMARY KEY, checksum CHAR(64) NOT NULL, applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)",
  );
  for (const filename of (
    await readdir(new URL("../db/migrations/", import.meta.url))
  )
    .filter((f) => f.endsWith(".sql"))
    .sort()) {
    const sql = await readFile(
      new URL(`../db/migrations/${filename}`, import.meta.url),
      "utf8",
    );
    const checksum = createHash("sha256").update(sql).digest("hex");
    const [rows] = await connection.execute(
      "SELECT checksum FROM schema_migrations WHERE version=?",
      [filename],
    );
    if (rows.length) {
      if (rows[0].checksum !== checksum)
        throw new Error(`Migração alterada: ${filename}`);
      continue;
    }
    // DDL no MariaDB/MySQL faz commit implícito. Nunca fingir rollback de criação de tabelas.
    for (const statement of sql
      .replace(/^--.*$/gm, "")
      .split(";")
      .map((x) => x.trim())
      .filter(Boolean))
      await connection.query(statement);
    await connection.execute(
      "INSERT INTO schema_migrations (version,checksum) VALUES (?,?)",
      [filename, checksum],
    );
    console.log(`Aplicada: ${filename}`);
  }
} finally {
  await connection.end();
}
