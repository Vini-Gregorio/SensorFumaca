import { readdir, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";

export async function migrate(connection, through = null) {
  const [[lock]] = await connection.query(
    "SELECT GET_LOCK('mqfire_migrations',30) AS acquired",
  );
  if (lock.acquired !== 1) throw new Error("Outra migração está em execução.");
  try {
    await connection.query(
      "CREATE TABLE IF NOT EXISTS schema_migrations (version VARCHAR(100) PRIMARY KEY, checksum CHAR(64) NOT NULL, applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)",
    );
    const files = (await readdir(new URL("../db/migrations/", import.meta.url)))
      .filter((f) => f.endsWith(".sql"))
      .sort();
    if (through && !files.includes(through))
      throw new Error("Migração alvo inexistente.");
    for (const filename of files) {
      if (through && filename > through) break;
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
      // Arquivos internos de DDL simples. Não aceita SQL externo nem promete rollback de DDL.
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
    await connection.query("SELECT RELEASE_LOCK('mqfire_migrations')");
  }
}
