import { execFileSync } from "node:child_process";
import { existsSync, openSync, closeSync, writeFileSync } from "node:fs";
import { resolve, dirname, relative, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

// Exportação local explícita. Não usa push/mirror, não apaga refs e não inclui .git.
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputArg = process.argv[2];
if (!outputArg || process.argv.length !== 3)
  throw new Error("Uso: npm run export:standalone -- ../mqfire-tg-source.tar");
const output = resolve(process.cwd(), outputArg),
  manifest = `${output}.manifest.json`;
const inside = relative(root, output);
if (
  !inside ||
  (!inside.startsWith(".." + (process.platform === "win32" ? "\\" : "/")) &&
    !isAbsolute(inside))
)
  throw new Error("Escolha destino fora do checkout.");
if (!output.endsWith(".tar")) throw new Error("Destino deve terminar em .tar.");
if (existsSync(output) || existsSync(manifest))
  throw new Error("Destino já existe; nenhum arquivo foi alterado.");
const git = (...args) =>
  execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
if (git("status", "--porcelain"))
  throw new Error(
    "Checkout precisa estar limpo e versionado antes da exportação.",
  );
execFileSync(process.execPath, ["scripts/check-secrets.js"], {
  cwd: root,
  stdio: "inherit",
});
const revision = git("rev-parse", "HEAD");
const archive = execFileSync(
  "git",
  ["archive", "--format=tar", "--prefix=mqfire-tg/", "HEAD"],
  { cwd: root, maxBuffer: 64 * 1024 * 1024 },
);
const sha256 = createHash("sha256").update(archive).digest("hex");
const fd = openSync(output, "wx", 0o600);
try {
  writeFileSync(fd, archive);
} finally {
  closeSync(fd);
}
writeFileSync(
  manifest,
  JSON.stringify(
    {
      schemaVersion: "mqfire-source-export/1",
      sourceCommit: revision,
      sha256,
      generatedAt: new Date().toISOString(),
      excludesGitHistory: true,
      notice:
        "Snapshot de código derivado; preservar AUTHORS.md. Não comprova revogação de segredos anteriores.",
    },
    null,
    2,
  ) + "\n",
  { flag: "wx", mode: 0o600 },
);
console.log(
  `Snapshot criado: ${output}\nManifesto: ${manifest}\nCommit: ${revision}\nSHA-256: ${sha256}`,
);
