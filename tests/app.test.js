import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import bcrypt from "bcrypt";
import { createApp } from "../backend/app.js";
import { token, hash, HttpError } from "../backend/domain.js";

// Dublê só para fronteira HTTP. Persistência real é exercitada separadamente em integration/.
async function fixture(t, overrides = {}, experiments) {
  const key = token(),
    sessions = new Map();
  const password = token();
  const passwordHash = await bcrypt.hash(password, 4);
  const repo = {
    rows: async () => [],
    userByEmail: async (email) =>
      email === "user@example.test"
        ? { id: 1, email, password_hash: passwordHash }
        : null,
    createSession: async (h, id) =>
      sessions.set(h, { id, email: "user@example.test" }),
    session: async (h) => sessions.get(h),
    deleteSession: async (h) => sessions.delete(h),
    device: async (id) =>
      id === "lab" ? { id, enabled: 1, token_hash: hash(key) } : null,
    ingest: async () => ({ duplicate: false, eventId: 1 }),
    dashboard: async () => [],
    history: async (user, id) => {
      if (id !== "lab") throw new HttpError(404, "Não encontrado.");
      return [];
    },
    ...overrides,
  };
  const config = {
    production: false,
    origin: "http://localhost:3001",
    allowRegistration: true,
    telegramEnabled: false,
  };
  const server = createApp({ repo, config, experiments }).listen(
    0,
    "127.0.0.1",
  );
  await once(server, "listening");
  t.after(
    () =>
      new Promise((resolve) => {
        server.close(resolve);
        server.closeAllConnections();
      }),
  );
  const url = `http://127.0.0.1:${server.address().port}`;
  const request = (path, method = "GET", body, headers = {}) =>
    fetch(url + path, {
      method,
      headers: {
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  const login = async () => {
    const r = await request(
      "/api/v1/auth/login",
      "POST",
      { email: "user@example.test", password },
      { Origin: config.origin },
    );
    assert.equal(r.status, 200);
    return r.headers.get("set-cookie").split(";")[0];
  };
  const body = {
    deviceId: "lab",
    bootId: "0123456789abcdef",
    sequence: 0,
    uptimeMs: 1,
    ageMs: 0,
    configVersion: 1,
    droppedSamples: 0,
    manualAlarm: false,
    readings: [{ channel: "mq2", value: 1, state: "NORMAL" }],
  };
  return { request, login, key, body, config };
}
test("sessão JSON funcional, cookie HttpOnly e logout invalida sessão", async (t) => {
  const f = await fixture(t);
  const cookie = await f.login();
  assert.equal(
    (await f.request("/api/v1/me", "GET", undefined, { Cookie: cookie }))
      .status,
    200,
  );
  assert.equal(
    (
      await f.request(
        "/api/v1/auth/logout",
        "POST",
        {},
        { Cookie: cookie, Origin: f.config.origin },
      )
    ).status,
    204,
  );
  assert.equal(
    (await f.request("/api/v1/me", "GET", undefined, { Cookie: cookie }))
      .status,
    401,
  );
});
test("protege recursos e remove debug/rotas legadas", async (t) => {
  const f = await fixture(t);
  for (const path of [
    "/api/v1/devices",
    "/api/v1/notifications",
    "/api/v1/audit",
    "/api/v1/devices/lab/config/revisions",
    "/api/v1/devices/lab/evidence",
    "/api/v1/experiments",
    "/api/v1/experiments/1",
    "/api/v1/experiments/1/evidence",
  ])
    assert.equal((await f.request(path)).status, 401);
  for (const path of ["/debug", "/api/esp32", "/.env", "/backend/.env"])
    assert.equal((await f.request(path)).status, 404);
  const r = await f.request("/");
  assert.equal(r.status, 200);
  assert.match(
    r.headers.get("content-security-policy"),
    /frame-ancestors 'none'/,
  );
  assert.equal(r.headers.get("x-powered-by"), null);
});
test("CSRF: rejeita origem ausente ou externa antes de mutação", async (t) => {
  const f = await fixture(t);
  assert.equal((await f.request("/api/v1/auth/login", "POST", {})).status, 403);
  assert.equal(
    (
      await f.request(
        "/api/v1/auth/register",
        "POST",
        {},
        { Origin: "https://attacker.example" },
      )
    ).status,
    403,
  );
});
test("ingestão exige token válido e vínculo do dispositivo", async (t) => {
  const f = await fixture(t),
    headers = { "x-device-id": "lab", "x-api-key": f.key };
  assert.equal(
    (
      await f.request("/api/v1/telemetry", "POST", f.body, {
        "x-device-id": "lab",
      })
    ).status,
    401,
  );
  assert.equal(
    (
      await f.request("/api/v1/telemetry", "POST", f.body, {
        ...headers,
        "x-api-key": token(),
      })
    ).status,
    401,
  );
  assert.equal(
    (
      await f.request(
        "/api/v1/telemetry",
        "POST",
        { ...f.body, deviceId: "other" },
        headers,
      )
    ).status,
    403,
  );
  assert.equal(
    (await f.request("/api/v1/telemetry", "POST", f.body, headers)).status,
    201,
  );
});
test("erro de banco nunca retorna aceite; payload inválido não chega à persistência", async (t) => {
  let calls = 0;
  const f = await fixture(t, {
    ingest: async () => {
      calls++;
      throw new Error("database secret must not escape");
    },
  });
  const h = { "x-device-id": "lab", "x-api-key": f.key };
  assert.equal(
    (
      await f.request(
        "/api/v1/telemetry",
        "POST",
        { ...f.body, readings: [] },
        h,
      )
    ).status,
    400,
  );
  assert.equal(calls, 0);
  const r = await f.request("/api/v1/telemetry", "POST", f.body, h);
  assert.equal(r.status, 500);
  assert.doesNotMatch(await r.text(), /secret/);
});
test("histórico alheio inacessível e cursor validado", async (t) => {
  const f = await fixture(t),
    cookie = await f.login();
  assert.equal(
    (
      await f.request(
        "/api/v1/devices/other/sensors/mq2/readings",
        "GET",
        undefined,
        { Cookie: cookie },
      )
    ).status,
    404,
  );
  assert.equal(
    (
      await f.request(
        "/api/v1/devices/lab/sensors/mq2/readings?before=NaN",
        "GET",
        undefined,
        { Cookie: cookie },
      )
    ).status,
    400,
  );
});
test("limite de tentativas de login", async (t) => {
  const f = await fixture(t);
  let r;
  for (let i = 0; i < 11; i++)
    r = await f.request(
      "/api/v1/auth/login",
      "POST",
      {},
      { Origin: f.config.origin },
    );
  assert.equal(r.status, 429);
  assert(r.headers.has("retry-after"));
});
test("edição de limite exige versão esperada; exportação valida intervalo e cabeçalho", async (t) => {
  let calls = 0,
    expected;
  const f = await fixture(t, {
    updateSensor: async (user, id, channel, config, version) => {
      calls++;
      expected = version;
      return 2;
    },
    evidence: async () => ({ payload: { rowCount: 0 }, sha256: "fixture" }),
  });
  const Cookie = await f.login(),
    headers = { Cookie, Origin: f.config.origin };
  const body = { high: 900, low: 500, confirmMs: 1000 };
  assert.equal(
    (
      await f.request(
        "/api/v1/devices/lab/sensors/mq2/config",
        "PUT",
        body,
        headers,
      )
    ).status,
    400,
  );
  assert.equal(calls, 0);
  assert.equal(
    (
      await f.request(
        "/api/v1/devices/lab/sensors/mq2/config",
        "PUT",
        { ...body, expectedVersion: 1 },
        headers,
      )
    ).status,
    200,
  );
  assert.equal(expected, 1);
  const r = await f.request(
    "/api/v1/devices/lab/evidence?from=2026-09-22T00:00:00Z&to=2026-09-22T01:00:00Z",
    "GET",
    undefined,
    { Cookie },
  );
  assert.equal(r.status, 200);
  assert.match(r.headers.get("content-disposition"), /attachment/);
  assert.equal(r.headers.get("cache-control"), "no-store");
  assert.equal(
    (
      await f.request(
        "/api/v1/devices/lab/evidence?from=invalid",
        "GET",
        undefined,
        { Cookie },
      )
    ).status,
    400,
  );
});
test("reenvio manual exige origem e canal habilitado", async (t) => {
  let called = false;
  const f = await fixture(t, {
      retryNotification: async () => {
        called = true;
      },
    }),
    Cookie = await f.login();
  assert.equal(
    (await f.request("/api/v1/notifications/1/retry", "POST", {}, { Cookie }))
      .status,
    403,
  );
  assert.equal(
    (
      await f.request(
        "/api/v1/notifications/1/retry",
        "POST",
        {},
        { Cookie, Origin: f.config.origin },
      )
    ).status,
    409,
  );
  assert.equal(called, false);
});

test("ensaios protegem escrita, validam plano/conclusão e retornam exportação privada", async (t) => {
  let created = 0,
    finished = 0;
  const f = await fixture(
    t,
    {},
    {
      create: async (user, input) => {
        assert.equal(user, 1);
        assert.deepEqual(input.deviceIds, ["lab"]);
        created++;
        return 1;
      },
      finish: async () => {
        finished++;
      },
      evidence: async () => ({ payload: { rowCount: 0 } }),
    },
  );
  const Cookie = await f.login(),
    headers = { Cookie, Origin: f.config.origin };
  const plan = {
    title: "Bancada",
    objective: "Objetivo",
    protocol: "Método",
    acceptanceCriteria: "Critério prévio",
    environment: "Laboratório",
    hardware: "Placa",
    softwareRef: "a".repeat(40),
    deviceIds: ["lab"],
  };
  assert.equal(
    (await f.request("/api/v1/experiments", "POST", plan, { Cookie })).status,
    403,
  );
  assert.equal(
    (await f.request("/api/v1/experiments", "POST", {}, headers)).status,
    400,
  );
  assert.equal(created, 0);
  assert.equal(
    (await f.request("/api/v1/experiments", "POST", plan, headers)).status,
    201,
  );
  assert.equal(created, 1);
  assert.equal(
    (
      await f.request(
        "/api/v1/experiments/1/finish",
        "POST",
        { conclusion: "Sem resultado" },
        headers,
      )
    ).status,
    400,
  );
  assert.equal(finished, 0);
  assert.equal(
    (
      await f.request(
        "/api/v1/experiments/1/finish",
        "POST",
        { outcome: "inconclusive", conclusion: "Dados insuficientes" },
        headers,
      )
    ).status,
    204,
  );
  const result = await f.request(
    "/api/v1/experiments/1/evidence",
    "GET",
    undefined,
    { Cookie },
  );
  assert.equal(result.status, 200);
  assert.equal(result.headers.get("cache-control"), "no-store");
  assert.match(
    result.headers.get("content-disposition"),
    /mqfire-experiment-1/,
  );
  assert.equal(
    (
      await f.request("/api/v1/experiments/0/evidence", "GET", undefined, {
        Cookie,
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await f.request(
        "/api/v1/experiments/1/evidence?from=invalid",
        "GET",
        undefined,
        { Cookie },
      )
    ).status,
    400,
  );
});
