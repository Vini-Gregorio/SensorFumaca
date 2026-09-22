import test from "node:test";
import assert from "node:assert/strict";
import { evidenceWindow, hash, telemetry } from "../backend/domain.js";
import { buildEvidence } from "../backend/evidence.js";
const window = () =>
  evidenceWindow({ from: "2026-09-22T00:00:00Z", to: "2026-09-22T01:00:00Z" });
test("exportação tem janela explícita, integridade verificável e versões ausentes declaradas", () => {
  const bundle = buildEvidence(
    "lab",
    window(),
    [
      { value: 100, config_version: 1 },
      { value: 200, config_version: 2 },
    ],
    [{ version: 2, snapshot: { sensors: [] }, reason: "sensor_updated" }],
  );
  assert.equal(bundle.payload.rowCount, 2);
  assert.deepEqual(bundle.payload.missingConfigVersions, [1]);
  assert.equal(bundle.sha256, hash(JSON.stringify(bundle.payload)));
  assert(!JSON.stringify(bundle).includes("password"));
  assert.equal(bundle.payload.units.value, "adc_raw");
});
test("intervalos inválidos e pacotes grandes são rejeitados sem truncamento", () => {
  for (const query of [
    {},
    { from: "yesterday", to: "today" },
    { from: "2026-09-22T00:00:00Z", to: "2026-09-24T00:00:00Z" },
    { from: "2026-09-22T01:00:00Z", to: "2026-09-22T00:00:00Z" },
    { from: "2026-02-30T00:00:00Z", to: "2026-03-02T01:00:00Z" },
  ])
    assert.throws(() => evidenceWindow(query));
  assert.throws(
    () => buildEvidence("lab", window(), Array(10001).fill({}), []),
    (e) => e.status === 413,
  );
});
test("diagnóstico opcional mantém contrato antigo e rejeita metadados inválidos", () => {
  const body = {
    deviceId: "lab",
    bootId: "0123456789abcdef",
    sequence: 1,
    uptimeMs: 1,
    ageMs: 0,
    configVersion: 1,
    droppedSamples: 0,
    manualAlarm: false,
    readings: [{ channel: "mq2", value: 1, state: "NORMAL" }],
  };
  assert(!("diagnostics" in telemetry(body)));
  const diagnostics = {
    firmware: "2.1.0-tg",
    rssi: -55,
    freeHeap: 80000,
    queueDepth: 3,
    coalescedSamples: 4,
    resetReason: 1,
  };
  assert.deepEqual(
    telemetry({ ...body, diagnostics }).diagnostics,
    diagnostics,
  );
  assert.throws(() =>
    telemetry({ ...body, diagnostics: { ...diagnostics, rssi: 1 } }),
  );
  assert.throws(() =>
    telemetry({
      ...body,
      diagnostics: { ...diagnostics, firmware: "<script>" },
    }),
  );
});
