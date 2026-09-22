import test from "node:test";
import assert from "node:assert/strict";
import mysql from "mysql2/promise";
import { Repository } from "../../backend/repository.js";
import { loadConfig } from "../../backend/config.js";
import { hash, token } from "../../backend/domain.js";

test(
  "MariaDB real: isolamento, rollback, idempotência, configuração e outbox",
  { skip: process.env.RUN_DB_TESTS !== "1" },
  async () => {
    if (!process.env.DB_NAME?.endsWith("_test"))
      throw new Error("Exige banco dedicado com nome terminado em _test.");
    const pool = mysql.createPool(loadConfig().db),
      repo = new Repository(pool);
    try {
      const suffix = token().slice(0, 12),
        key = token(),
        id = `lab-${suffix}`;
      const owner = await repo.createUser(
        `${suffix}@example.test`,
        "not-a-login-hash",
      );
      const other = await repo.createUser(
        `other-${suffix}@example.test`,
        "not-a-login-hash",
      );
      await repo.createDevice(owner, id, "Laboratório", hash(key));
      await assert.rejects(
        () =>
          repo.updateSensor(other, id, "mq2", {
            high: 800,
            low: 600,
            confirmMs: 5000,
          }),
        (e) => e.status === 404,
      );
      await assert.rejects(
        () => repo.history(other, id, "mq2", Number.MAX_SAFE_INTEGER),
        (e) => e.status === 404,
      );
      const packet = {
        deviceId: id,
        bootId: "0123456789abcdef",
        sequence: 0,
        uptimeMs: 100,
        configVersion: 1,
        droppedSamples: 0,
        manualAlarm: false,
        readings: [{ channel: "mq2", value: 800, state: "ALARM" }],
      };
      const results = await Promise.all([
        repo.ingest(packet, 0, hash(key), true),
        repo.ingest(packet, 0, hash(key), true),
      ]);
      assert.equal(results.filter((x) => x.duplicate).length, 1);
      assert.equal((await repo.notifications(owner)).length, 1);
      await assert.rejects(
        () => repo.ingest({ ...packet, uptimeMs: 101 }, 0, hash(key), true),
        (e) => e.status === 409,
      );
      await assert.rejects(
        () =>
          repo.ingest(
            {
              ...packet,
              sequence: 1,
              readings: [{ channel: "unknown", value: 800, state: "ALARM" }],
            },
            0,
            hash(key),
            true,
          ),
        (e) => e.status === 422,
      );
      assert.equal(
        (await repo.history(owner, id, "mq2", Number.MAX_SAFE_INTEGER)).length,
        1,
      );
      await repo.ingest({ ...packet, sequence: 1 }, 0, hash(key), true);
      assert.equal(
        (await repo.notifications(owner)).length,
        1,
        "Alarme contínuo não repete notificação",
      );
      await repo.updateSensor(owner, id, "mq2", {
        high: 900,
        low: 600,
        confirmMs: 1000,
      });
      assert.equal((await repo.config(id)).version, 2);
      await repo.addSensor(owner, id, "mq2-extra", "Canal 2", {
        high: 900,
        low: 600,
        confirmMs: 1000,
      });
      assert.equal((await repo.config(id)).sensors.length, 2);
      const malicious = "Sala <script>alert(1)</script> ' OR 1=1 --";
      await repo.createDevice(
        other,
        `other-${suffix}`,
        malicious,
        hash(token()),
      );
      assert.equal(
        (await repo.dashboard(other))[0].device_name,
        malicious,
        "Nome persiste como dado, não SQL",
      );
      assert.equal(
        (await repo.dashboard(owner)).length,
        2,
        "Isolamento por usuário",
      );
      await repo.rotateDevice(owner, id, hash(token()));
      await assert.rejects(
        () => repo.ingest({ ...packet, sequence: 2 }, 0, hash(key), true),
        (e) => e.status === 401,
      );
      const n = await repo.claimNotification();
      assert(n);
      await repo.finishNotification(n.id, n.attempts, true);
    } finally {
      await pool.end();
    }
  },
);
