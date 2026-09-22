// Somente ambiente autorizado, separado do campo. Não usa dados/credenciais versionados.
import http from "k6/http";
import { check, sleep } from "k6";
import exec from "k6/execution";
if (__ENV.ALLOW_LOAD_TESTS !== "1")
  throw new Error("Defina ALLOW_LOAD_TESTS=1 para autorizar o ensaio.");
const base = __ENV.BASE_URL || "http://127.0.0.1:3001";
if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(base))
  throw new Error(
    "Roteiro limitado ao ambiente local. Revise escopo antes de criar ensaio remoto.",
  );
const device = __ENV.DEVICE_ID,
  key = __ENV.DEVICE_API_KEY;
if (!device || !key)
  throw new Error("Configure dispositivo de teste e chave no ambiente.");
export const options = {
  vus: Math.min(50, Number(__ENV.VUS || 2)),
  duration: __ENV.DURATION || "30s",
  thresholds: {
    http_req_failed: ["rate<0.01"],
    http_req_duration: [`p(95)<${Number(__ENV.P95_MS || 500)}`],
  },
};
export function setup() {
  const r = http.get(`${base}/api/v1/device/config`, {
    headers: { "x-device-id": device, "x-api-key": key },
  });
  if (r.status !== 200) throw new Error("Não foi possível obter configuração.");
  // ID exclusivo por execução; VUs partilham boot e usam iteração global única.
  return {
    config: r.json(),
    bootId: Array.from({ length: 16 }, () =>
      Math.floor(Math.random() * 16).toString(16),
    ).join(""),
  };
}
export default function ({ config, bootId }) {
  const body = {
    deviceId: device,
    bootId,
    sequence: exec.scenario.iterationInTest,
    uptimeMs: 65000,
    ageMs: 0,
    configVersion: config.version,
    droppedSamples: 0,
    manualAlarm: false,
    readings: config.sensors.map((s) => ({
      channel: s.channel,
      value: Math.max(0, s.low - 100),
      state: "NORMAL",
    })),
  };
  const r = http.post(`${base}/api/v1/telemetry`, JSON.stringify(body), {
    headers: {
      "Content-Type": "application/json",
      "x-device-id": device,
      "x-api-key": key,
    },
  });
  check(r, { "persistiu evento novo": (r) => r.status === 201 });
  sleep(1);
}
