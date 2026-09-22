import express from "express";
import bcrypt from "bcrypt";
import { fileURLToPath } from "node:url";
import {
  HttpError,
  token,
  hash,
  equalHash,
  identifier,
  text,
  credentials,
  sensorConfig,
  telemetry,
  dashboardStatus,
  requireObject,
} from "./domain.js";

export function limiter(max, windowMs, key = (req) => req.ip) {
  const entries = new Map();
  return (req, res, next) => {
    const now = Date.now();
    // Memória limitada mesmo sob IPs/identificadores arbitrários. Implantação inicial: um processo.
    if (entries.size >= 10000)
      for (const [k, v] of entries) if (v.until <= now) entries.delete(k);
    const k = key(req);
    let e = entries.get(k);
    if (!e || e.until <= now) {
      if (entries.size >= 10000 && !e)
        return res.status(429).json({ error: "Limite temporário." });
      e = { count: 0, until: now + windowMs };
      entries.set(k, e);
    }
    if (++e.count > max) {
      res.set("Retry-After", String(Math.ceil((e.until - now) / 1000)));
      return res
        .status(429)
        .json({ error: "Aguarde antes de tentar novamente." });
    }
    next();
  };
}
function cookieToken(req) {
  const value = (req.headers.cookie || "")
    .split(";")
    .map((x) => x.trim())
    .find((x) => x.startsWith("mqfire_session="))
    ?.slice(15);
  return /^[a-f0-9]{64}$/.test(value || "") ? value : null;
}
export function createApp({ repo, config }) {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", config.trustProxy || false);
  app.use((req, res, next) => {
    res.set({
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      "Referrer-Policy": "no-referrer",
      "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
      "Content-Security-Policy":
        "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
    });
    if (config.production)
      res.set("Strict-Transport-Security", "max-age=31536000");
    if (req.path.startsWith("/api/")) res.set("Cache-Control", "no-store");
    next();
  });
  app.use("/api", limiter(600, 60000));
  app.use(express.json({ limit: "16kb", strict: true }));
  app.get("/health/live", (_, res) => res.json({ status: "up" }));
  app.get("/health/ready", async (_, res) => {
    await repo.rows("SELECT 1");
    res.json({ status: "ready" });
  });
  const browserWrite = (req, res, next) => {
    if (req.get("origin") !== config.origin)
      throw new HttpError(403, "Origem não autorizada.");
    if (!req.is("application/json"))
      throw new HttpError(415, "Envie application/json.");
    next();
  };
  const auth = async (req, res, next) => {
    const value = cookieToken(req);
    req.user = value ? await repo.session(hash(value)) : null;
    if (!req.user) throw new HttpError(401, "Entre para continuar.");
    req.sessionHash = hash(value);
    next();
  };
  const deviceAuth = async (req, res, next) => {
    const id = identifier(req.get("x-device-id"));
    const value = req.get("x-api-key");
    if (!/^[a-f0-9]{64}$/.test(value || ""))
      throw new HttpError(401, "Dispositivo não autorizado.");
    const d = await repo.device(id);
    if (!d?.enabled || !equalHash(d.token_hash, hash(value)))
      throw new HttpError(401, "Dispositivo não autorizado.");
    req.device = d;
    req.deviceHash = hash(value);
    next();
  };
  const loginLimit = limiter(10, 15 * 60000);
  app.post(
    "/api/v1/auth/register",
    browserWrite,
    loginLimit,
    async (req, res) => {
      if (!config.allowRegistration)
        throw new HttpError(403, "Cadastro desativado.");
      const { email, password } = credentials(req.body);
      const id = await repo.createUser(email, await bcrypt.hash(password, 12));
      res.status(201).json({ id, email });
    },
  );
  app.post("/api/v1/auth/login", browserWrite, loginLimit, async (req, res) => {
    const { email, password } = credentials(req.body);
    const u = await repo.userByEmail(email);
    // Mesmo custo de hash se usuário não existir (evita resposta rápida de enumeração).
    const valid = await bcrypt.compare(
      password,
      u?.password_hash ||
        "$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxrYm5vgwyi.zVVLRErqOvMDH5C",
    );
    if (!u || !valid) throw new HttpError(401, "Email ou senha inválidos.");
    const previous = cookieToken(req);
    if (previous) await repo.deleteSession(hash(previous));
    const value = token();
    await repo.createSession(hash(value), u.id);
    res.cookie("mqfire_session", value, {
      httpOnly: true,
      secure: config.production,
      sameSite: "strict",
      path: "/",
      maxAge: 8 * 3600000,
    });
    res.json({ id: u.id, email: u.email });
  });
  app.get("/api/v1/me", auth, (req, res) => res.json(req.user));
  app.post("/api/v1/auth/logout", browserWrite, auth, async (req, res) => {
    await repo.deleteSession(req.sessionHash);
    res.clearCookie("mqfire_session", {
      path: "/",
      httpOnly: true,
      secure: config.production,
      sameSite: "strict",
    });
    res.status(204).end();
  });
  app.put("/api/v1/me/telegram", browserWrite, auth, async (req, res) => {
    requireObject(req.body);
    const chatId = req.body.chatId;
    if (
      chatId !== null &&
      (typeof chatId !== "string" || !/^-?\d{1,20}$/.test(chatId))
    )
      throw new HttpError(400, "chatId inválido.");
    await repo.setTelegram(req.user.id, chatId);
    res.status(204).end();
  });
  app.get("/api/v1/devices", auth, async (req, res) => {
    const rows = await repo.dashboard(req.user.id);
    res.json(
      rows.map((r) => ({
        ...r,
        status: !r.enabled ? "DESATIVADO" : dashboardStatus(r),
      })),
    );
  });
  app.post("/api/v1/devices", browserWrite, auth, async (req, res) => {
    requireObject(req.body);
    const id = identifier(req.body.id),
      name = text(req.body.name, "Nome"),
      value = token();
    await repo.createDevice(req.user.id, id, name, hash(value));
    res.status(201).json({ id, apiKey: value, channel: "mq2" });
  });
  app.post(
    "/api/v1/devices/:id/rotate-key",
    browserWrite,
    auth,
    async (req, res) => {
      const value = token();
      await repo.rotateDevice(
        req.user.id,
        identifier(req.params.id),
        hash(value),
      );
      res.json({ apiKey: value });
    },
  );
  app.put(
    "/api/v1/devices/:id/enabled",
    browserWrite,
    auth,
    async (req, res) => {
      requireObject(req.body);
      if (typeof req.body.enabled !== "boolean")
        throw new HttpError(400, "enabled deve ser booleano.");
      await repo.enableDevice(
        req.user.id,
        identifier(req.params.id),
        req.body.enabled,
      );
      res.status(204).end();
    },
  );
  app.post(
    "/api/v1/devices/:id/sensors",
    browserWrite,
    auth,
    async (req, res) => {
      requireObject(req.body);
      await repo.addSensor(
        req.user.id,
        identifier(req.params.id),
        identifier(req.body.channel),
        text(req.body.name, "Nome"),
        sensorConfig(req.body),
      );
      res.status(201).json({ status: "pending_device_sync" });
    },
  );
  app.put(
    "/api/v1/devices/:id/sensors/:channel/config",
    browserWrite,
    auth,
    async (req, res) => {
      await repo.updateSensor(
        req.user.id,
        identifier(req.params.id),
        identifier(req.params.channel),
        sensorConfig(req.body),
      );
      res.json({ status: "pending_device_sync" });
    },
  );
  app.get(
    "/api/v1/devices/:id/sensors/:channel/readings",
    auth,
    async (req, res) => {
      const before =
        req.query.before === undefined
          ? Number.MAX_SAFE_INTEGER
          : Number(req.query.before);
      if (!Number.isSafeInteger(before) || before < 1)
        throw new HttpError(400, "Cursor inválido.");
      res.json(
        await repo.history(
          req.user.id,
          identifier(req.params.id),
          identifier(req.params.channel),
          before,
        ),
      );
    },
  );
  app.get("/api/v1/notifications", auth, async (req, res) =>
    res.json(await repo.notifications(req.user.id)),
  );
  app.get("/api/v1/device/config", deviceAuth, async (req, res) =>
    res.json(await repo.config(req.device.id)),
  );
  app.post(
    "/api/v1/telemetry",
    deviceAuth,
    limiter(120, 60000, (req) => req.device.id),
    async (req, res) => {
      const body = telemetry(req.body);
      if (body.deviceId !== req.device.id)
        throw new HttpError(403, "Dispositivo divergente.");
      const result = await repo.ingest(
        body,
        req.body.ageMs,
        req.deviceHash,
        config.telegramEnabled,
      );
      res.status(result.duplicate ? 200 : 201).json(result);
    },
  );
  app.use(
    express.static(fileURLToPath(new URL("../public", import.meta.url)), {
      dotfiles: "deny",
      etag: true,
    }),
  );
  app.use((req, res) =>
    res.status(404).json({ error: "Rota não encontrada." }),
  );
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    const status = error.status || (error.code === "ER_DUP_ENTRY" ? 409 : 500);
    // Não logar corpo, headers, parâmetros SQL, tokens ou objeto de erro do cliente HTTP.
    if (status >= 500)
      console.error(
        JSON.stringify({ event: "request_failed", method: req.method, status }),
      );
    res
      .status(status)
      .json({
        error:
          status >= 500
            ? "Serviço indisponível. Tente novamente."
            : error.code === "ER_DUP_ENTRY"
              ? "Registro já existente."
              : error.type === "entity.parse.failed"
                ? "JSON inválido."
                : error.message,
      });
  });
  return app;
}
