import { readFileSync } from "node:fs";

export function loadConfig(env = process.env) {
  const production = env.NODE_ENV === "production";
  const origin = new URL(env.APP_ORIGIN || "http://localhost:3001");
  if (
    origin.origin !== (env.APP_ORIGIN || origin.origin) ||
    !["http:", "https:"].includes(origin.protocol)
  )
    throw new Error("APP_ORIGIN deve ser uma origem HTTP(S), sem caminho.");
  if (production && origin.protocol !== "https:")
    throw new Error("Produção exige APP_ORIGIN HTTPS.");
  if (!env.DB_PASSWORD || !env.DB_NAME || !env.DB_USER)
    throw new Error("Configure DB_NAME, DB_USER e DB_PASSWORD.");
  const port = Number(env.PORT || 3001);
  const dbPort = Number(env.DB_PORT || 3306);
  if (![port, dbPort].every((p) => Number.isInteger(p) && p > 0 && p <= 65535))
    throw new Error("Porta inválida.");
  const trustProxy = Number(env.TRUST_PROXY || 0);
  if (![0, 1].includes(trustProxy))
    throw new Error("TRUST_PROXY aceita 0 ou 1.");
  const telegramEnabled = env.TELEGRAM_ENABLED === "true";
  if (
    telegramEnabled &&
    !/^\d+:[A-Za-z0-9_-]+$/.test(env.TELEGRAM_BOT_TOKEN || "")
  )
    throw new Error("Configure o token do Telegram ou desative o canal.");
  return {
    production,
    port,
    origin: origin.origin,
    trustProxy,
    allowRegistration: env.ALLOW_REGISTRATION === "true",
    telegramEnabled,
    telegramToken: env.TELEGRAM_BOT_TOKEN,
    db: {
      host: env.DB_HOST || "127.0.0.1",
      port: dbPort,
      database: env.DB_NAME,
      user: env.DB_USER,
      password: env.DB_PASSWORD,
      timezone: "Z",
      connectionLimit: 10,
      multipleStatements: false,
      charset: "utf8mb4",
      ...(env.DB_TLS_CA_FILE
        ? {
            ssl: {
              ca: readFileSync(env.DB_TLS_CA_FILE),
              rejectUnauthorized: true,
            },
          }
        : {}),
    },
  };
}
