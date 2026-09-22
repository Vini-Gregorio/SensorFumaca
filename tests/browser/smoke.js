import { chromium } from "playwright";
import assert from "node:assert/strict";
import { once } from "node:events";
import bcrypt from "bcrypt";
import { createApp } from "../../backend/app.js";
import { token } from "../../backend/domain.js";
import { buildEvidence } from "../../backend/evidence.js";

// Smoke de navegador com dublê do banco: valida DOM/fluxo/HTTP, não persistência SQL.
const password = token(),
  sessions = new Map();
let user,
  device,
  high = 700;
let version = 1;
const repo = {
  createUser: async (email, password_hash) => {
    user = { id: 1, email, password_hash };
    return 1;
  },
  userByEmail: async (email) => (user?.email === email ? user : null),
  createSession: async (h) =>
    sessions.set(h, { id: user.id, email: user.email }),
  session: async (h) => sessions.get(h),
  deleteSession: async (h) => sessions.delete(h),
  createDevice: async (userId, id, name) => {
    device = { id, name };
  },
  dashboard: async () =>
    device
      ? [
          {
            device_id: device.id,
            device_name: device.name,
            enabled: 1,
            desired_version: version,
            sensor_id: 1,
            channel: "mq2",
            name: "MQ-2",
            value: 400,
            state: "NORMAL",
            observed_at: new Date(),
            config_version: 1,
            manual_alarm: 0,
            dropped_samples: 0,
            high_threshold: high,
            low_threshold: 580,
            confirm_ms: 5000,
          },
        ]
      : [],
  updateSensor: async (userId, id, channel, c, expectedVersion) => {
    assert.equal(expectedVersion, version);
    high = c.high;
    return ++version;
  },
  revisions: async () => [
    {
      version: 1,
      snapshot: {
        sensors: [{ channel: "mq2", high: 700, low: 580, confirmMs: 5000 }],
      },
      reason: "device_created",
    },
  ],
  restoreConfig: async (userId, id, target, expectedVersion) => {
    assert.equal(expectedVersion, version);
    assert.equal(target, 1);
    high = 700;
    return ++version;
  },
  evidence: async (userId, id, window) =>
    buildEvidence(
      id,
      window,
      [{ value: 400, config_version: 1 }],
      [{ version: 1, snapshot: { sensors: [] }, reason: "device_created" }],
    ),
  auditHistory: async () => [{ action: "configuration_restored" }],
  history: async () => [{ value: 400, state: "NORMAL" }],
};
// Config mutável somente no fixture para porta efêmera; produção usa configuração validada.
const config = {
  production: false,
  origin: "",
  allowRegistration: true,
  telegramEnabled: false,
};
const server = createApp({ repo, config }).listen(0, "127.0.0.1");
await once(server, "listening");
config.origin = `http://127.0.0.1:${server.address().port}`;
let browser;
try {
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(config.origin);
  await page.locator("#login input[name=email]").fill("browser@example.test");
  await page.locator("#login input[name=password]").fill(password);
  await page.locator("#register").click();
  await page.getByText("Conta criada. Agora entre.").waitFor();
  assert(await bcrypt.compare(password, user.password_hash));
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.locator("#workspace").waitFor({ state: "visible" });
  const session = (await page.context().cookies()).find(
    (c) => c.name === "mqfire_session",
  );
  assert(session.httpOnly);
  assert.equal(session.sameSite, "Strict");
  await page.getByText("Cadastrar dispositivo", { exact: true }).click();
  await page.locator("#device input[name=id]").fill("browser-lab");
  const hostile = '<img src=x onerror="window.__xss=1">';
  await page.locator("#device input[name=name]").fill(hostile);
  await page.locator("#device button").click();
  await page
    .locator("#api-key")
    .filter({ hasText: /[a-f0-9]{64}/ })
    .waitFor();
  await page
    .getByRole("heading", { name: `${hostile} · MQ-2`, exact: true })
    .waitFor();
  assert.equal(await page.evaluate(() => window.__xss), undefined);
  assert.equal(await page.locator(".card img").count(), 0);
  await page.getByText("Configurar limites ADC", { exact: true }).click();
  await page.locator(".card input[name=high]").fill("800");
  await page.getByRole("button", { name: "Salvar limites" }).click();
  await page
    .getByText("Configuração salva. Aguarde confirmação do dispositivo.")
    .waitFor();
  assert.equal(high, 800);
  await page.getByText(/desejada 2/).waitFor();
  await page.getByRole("button", { name: "Histórico (100)" }).click();
  await page.locator("#detail-data").filter({ hasText: "NORMAL" }).waitFor();
  assert.equal(await page.locator("svg.trend").count(), 1);
  await page.getByRole("button", { name: "Versões dos limites" }).click();
  page.once("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("button", { name: "Restaurar limites da versão 1" })
    .click();
  await page.getByText(/desejada 3/).waitFor();
  assert.equal(high, 700);
  await page
    .getByText("Exportar evidências do ensaio", { exact: true })
    .click();
  await page.locator("#evidence input[name=deviceId]").fill("browser-lab");
  await page.locator("#evidence input[name=from]").fill("2026-09-22T00:00");
  await page.locator("#evidence input[name=to]").fill("2026-09-22T01:00");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Baixar evidências JSON" }).click();
  assert.equal(
    (await download).suggestedFilename(),
    "mqfire-evidence-browser-lab.json",
  );
  await page
    .getByRole("button", { name: "Ver histórico de alterações" })
    .click();
  await page
    .locator("#detail-data")
    .filter({ hasText: "configuration_restored" })
    .waitFor();
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
    true,
    "Sem overflow horizontal no celular",
  );
  await page.setViewportSize({ width: 1440, height: 900 });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
    true,
  );
  await page.clock.install();
  await page.route("**/api/v1/devices", (route) => route.abort());
  await page.clock.fastForward(26000);
  await page.getByText("SEM ATUALIZAÇÃO", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Sair", exact: true }).click();
  await page.locator("#auth").waitFor({ state: "visible" });
  assert.equal(await page.locator("#api-key").textContent(), "");
  assert.deepEqual(errors, []);
  console.log(
    "Navegador: autenticação, XSS, limites, restauração, gráfico, download, auditoria, perda da API, mobile/desktop e logout OK.",
  );
} finally {
  if (browser) await browser.close();
  await new Promise((resolve) => {
    server.close(resolve);
    server.closeAllConnections();
  });
}
