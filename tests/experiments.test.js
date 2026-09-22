import test from "node:test";
import assert from "node:assert/strict";
import {
  experimentInput,
  noteInput,
  conclusionInput,
} from "../backend/experiments.js";

const plan = () => ({
  title: "Reconexão",
  objective: "Observar retorno da comunicação",
  protocol: "Procedimento aprovado em bancada",
  acceptanceCriteria: "Sem duplicação SQL",
  environment: "Laboratório isolado",
  hardware: "ESP32 e carga de baixa tensão",
  softwareRef: "a".repeat(40),
  deviceIds: ["lab-b", "lab-a"],
});
test("ensaio exige método prévio, commit completo e dispositivos distintos", () => {
  assert.deepEqual(experimentInput(plan()).deviceIds, ["lab-a", "lab-b"]);
  for (const patch of [
    { objective: "" },
    { protocol: "" },
    { acceptanceCriteria: "" },
    { softwareRef: "latest" },
    { deviceIds: [] },
    { deviceIds: ["lab", "lab"] },
    { deviceIds: Array.from({ length: 9 }, (_, i) => `lab-${i}`) },
  ])
    assert.throws(
      () => experimentInput({ ...plan(), ...patch }),
      (e) => e.status === 400,
    );
});
test("anotações exigem categoria e datas reais; não inferem rótulo do estado do sensor", () => {
  assert.equal(
    noteInput({
      kind: "reference",
      note: "Condição registrada por instrumento independente",
    }).observedAt,
    null,
  );
  assert.equal(
    noteInput({
      kind: "network",
      note: "Rede desligada",
      observedAt: "2026-09-22T01:00:00Z",
    }).observedAt.toISOString(),
    "2026-09-22T01:00:00.000Z",
  );
  for (const observedAt of ["2026-02-30T01:00:00Z", "2026-09-22", 42])
    assert.throws(
      () => noteInput({ kind: "network", note: "Registro", observedAt }),
      (e) => e.status === 400,
    );
  assert.throws(() =>
    noteInput({ kind: "ALARM", note: "Não é categoria de anotação" }),
  );
});
test("resultado do ensaio não é aprovado por padrão", () => {
  assert.throws(() => conclusionInput({ conclusion: "Não informado" }));
  assert.throws(() => conclusionInput({ outcome: "met", conclusion: "" }));
  assert.equal(
    conclusionInput({
      outcome: "inconclusive",
      conclusion: "Sem observações suficientes",
    }).outcome,
    "inconclusive",
  );
});
