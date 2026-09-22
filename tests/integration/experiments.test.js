import test from "node:test";
import assert from "node:assert/strict";
import mysql from "mysql2/promise";
import { Repository } from "../../backend/repository.js";
import { Experiments, experimentInput } from "../../backend/experiments.js";
import { loadConfig } from "../../backend/config.js";
import { token, hash } from "../../backend/domain.js";

test(
  "MariaDB: ensaio isolado, início atômico, notas independentes e evidência de múltiplos dispositivos",
  { skip: process.env.RUN_DB_TESTS !== "1" },
  async () => {
    if (!process.env.DB_NAME?.endsWith("_test"))
      throw new Error("Banco dedicado obrigatório.");
    const pool = mysql.createPool(loadConfig().db),
      repo = new Repository(pool),
      experiments = new Experiments(repo);
    try {
      const suffix = token().slice(0, 10),
        a = `exp-a-${suffix}`,
        b = `exp-b-${suffix}`,
        foreign = `exp-z-${suffix}`,
        key = token();
      const owner = await repo.createUser(
        `experiment-${suffix}@example.test`,
        "not-a-login-hash",
      );
      const other = await repo.createUser(
        `experiment-other-${suffix}@example.test`,
        "not-a-login-hash",
      );
      await repo.createDevice(owner, a, "A", hash(key));
      await repo.createDevice(owner, b, "B", hash(key));
      await repo.createDevice(other, foreign, "Outro", hash(token()));
      const input = experimentInput({
        title: "Bancada <script>literal</script>",
        objective: "Ensaiar comunicação",
        protocol: "Procedimento de baixa tensão autorizado",
        acceptanceCriteria: "Persistir sem duplicação",
        environment: "Dados de fixture",
        hardware: "Dois dispositivos",
        softwareRef: "a".repeat(40),
        deviceIds: [b, a],
      });
      await assert.rejects(
        () => experiments.create(owner, { ...input, deviceIds: [a, foreign] }),
        (e) => e.status === 404,
      );
      assert.equal(
        (await experiments.list(owner)).length,
        0,
        "Sem plano parcial ao incluir dispositivo de outra conta",
      );
      const id = await experiments.create(owner, input);
      await assert.rejects(
        () => experiments.read(other, id),
        (e) => e.status === 404,
      );
      await assert.rejects(
        () => experiments.start(other, id),
        (e) => e.status === 404,
      );
      await assert.rejects(
        () =>
          experiments.note(owner, id, {
            kind: "observation",
            note: "Antes do início",
          }),
        (e) => e.status === 409,
      );
      await assert.rejects(
        () =>
          experiments.finish(owner, id, {
            outcome: "met",
            conclusion: "Prematuro",
          }),
        (e) => e.status === 409,
      );
      await repo.enableDevice(owner, b, false);
      await assert.rejects(
        () => experiments.start(owner, id),
        (e) => e.status === 409,
      );
      let record = await experiments.read(owner, id);
      assert.equal(record.experiment.status, "planned");
      assert(
        record.devices.every((d) => d.configuration_at_start === null),
        "Rollback das configurações capturadas antes da falha",
      );
      await repo.enableDevice(owner, b, true);
      const starts = await Promise.allSettled([
        experiments.start(owner, id),
        experiments.start(owner, id),
      ]);
      assert.equal(starts.filter((r) => r.status === "fulfilled").length, 1);
      assert.equal(
        starts.find((r) => r.status === "rejected").reason.status,
        409,
      );
      // Relógio controlado apenas no fixture para testar limites temporais sem sleeps.
      await repo.rows(
        "UPDATE experiments SET started_at=DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 60 SECOND) WHERE id=?",
        [id],
      );
      record = await experiments.read(owner, id);
      const from = new Date(record.experiment.started_at);
      const packet = (deviceId) => ({
        deviceId,
        bootId: "0123456789abcdef",
        sequence: 1,
        uptimeMs: 10000,
        configVersion: 1,
        droppedSamples: 0,
        manualAlarm: false,
        readings: [{ channel: "mq2", value: 800, state: "ALARM" }],
      });
      await repo.ingest(packet(a), 30000, hash(key), false);
      await repo.ingest(packet(b), 30000, hash(key), false);
      await repo.updateSensor(
        owner,
        a,
        "mq2",
        { high: 850, low: 600, confirmMs: 5000 },
        1,
      );
      await repo.ingest(
        { ...packet(a), sequence: 2, configVersion: 2 },
        5000,
        hash(key),
        false,
      );
      await assert.rejects(
        () =>
          experiments.note(owner, id, {
            kind: "observation",
            note: "Fora da janela",
            observedAt: new Date(+from - 1),
          }),
        (e) => e.status === 400,
      );
      await assert.rejects(
        () =>
          experiments.note(owner, id, {
            kind: "observation",
            note: "Futuro",
            observedAt: new Date(Date.now() + 60000),
          }),
        (e) => e.status === 400,
      );
      await assert.rejects(
        () =>
          experiments.note(other, id, {
            kind: "observation",
            note: "Outra conta",
          }),
        (e) => e.status === 404,
      );
      await experiments.note(owner, id, {
        kind: "reference",
        note: "Referência independente: ausência relatada; classificação do firmware não será alterada",
        observedAt: new Date(+from + 1000),
      });
      await experiments.finish(owner, id, {
        outcome: "inconclusive",
        conclusion:
          "Sem comprovação suficiente; não representa validação física.",
      });
      await assert.rejects(
        () =>
          experiments.finish(owner, id, {
            outcome: "met",
            conclusion: "Sobrescrever",
          }),
        (e) => e.status === 409,
      );
      await assert.rejects(
        () =>
          experiments.note(owner, id, { kind: "hardware", note: "Falta data" }),
        (e) => e.status === 400,
      );
      await experiments.note(owner, id, {
        kind: "hardware",
        note: "Anotação retrospectiva identificada pela data de registro",
        observedAt: new Date(+from + 2000),
      });
      const bundle = await experiments.evidence(owner, id);
      assert.equal(bundle.payload.rowCount, 3);
      assert.equal(bundle.payload.telemetry.length, 2);
      assert.equal(bundle.payload.notes.length, 2);
      assert.equal(bundle.payload.experiment.outcome, "inconclusive");
      assert.equal(
        bundle.payload.devices[0].configuration_at_start.version,
        1,
        "Limites iniciais preservados após edição",
      );
      assert.equal(bundle.payload.telemetry[0].configurations.length, 2);
      assert(
        bundle.payload.telemetry[0].readings.every((r) => r.state === "ALARM"),
        "Rótulo manual não sobrescreve firmware",
      );
      assert.equal(bundle.sha256, hash(JSON.stringify(bundle.payload)));
      assert(!("user_id" in bundle.payload.experiment));
      assert(!JSON.stringify(bundle).includes(key));
      await assert.rejects(
        () => experiments.evidence(other, id),
        (e) => e.status === 404,
      );
      await assert.rejects(
        () =>
          experiments.evidence(owner, id, {
            from: new Date(+from - 1000),
            to: new Date(+from + 1000),
          }),
        (e) => e.status === 400,
      );
      const realEvidence = repo.evidence.bind(repo);
      repo.evidence = async () => ({ payload: { rowCount: 6000 } });
      await assert.rejects(
        () => experiments.evidence(owner, id),
        (e) => e.status === 413,
      );
      repo.evidence = realEvidence;
      await repo.rows(
        "UPDATE experiments SET started_at=DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 48 HOUR) WHERE id=?",
        [id],
      );
      await assert.rejects(
        () => experiments.evidence(owner, id),
        (e) => e.status === 400,
      );
      const partial = await experiments.evidence(owner, id, {
        from,
        to: new Date(bundle.payload.experiment.ended_at),
      });
      assert.equal(
        partial.payload.rowCount,
        3,
        "Ensaio longo pode exportar por intervalo",
      );
      assert(
        (await repo.auditHistory(owner)).some(
          (r) => r.action === "experiment_completed",
        ),
      );
      assert.deepEqual(await experiments.list(other), []);
    } finally {
      await pool.end();
    }
  },
);
