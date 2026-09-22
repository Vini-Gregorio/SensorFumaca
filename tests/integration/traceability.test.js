import test from "node:test";
import assert from "node:assert/strict";
import mysql from "mysql2/promise";
import { Repository } from "../../backend/repository.js";
import { loadConfig } from "../../backend/config.js";
import { hash, token } from "../../backend/domain.js";

test(
  "MariaDB: versões concorrentes, restauração, diagnóstico, evidência e auditoria",
  { skip: process.env.RUN_DB_TESTS !== "1" },
  async () => {
    if (!process.env.DB_NAME?.endsWith("_test"))
      throw new Error("Banco dedicado obrigatório.");
    const pool = mysql.createPool(loadConfig().db),
      repo = new Repository(pool);
    try {
      const suffix = token().slice(0, 12),
        id = `trace-${suffix}`,
        key = token();
      const owner = await repo.createUser(
          `${suffix}@example.test`,
          "not-a-login-hash",
        ),
        other = await repo.createUser(
          `other-${suffix}@example.test`,
          "not-a-login-hash",
        );
      await repo.createDevice(owner, id, "Ensaio", hash(key));
      assert.equal(
        (await repo.revisions(owner, id))[0].snapshot.sensors[0].high,
        700,
      );
      const attempts = await Promise.allSettled([
        repo.updateSensor(
          owner,
          id,
          "mq2",
          { high: 850, low: 600, confirmMs: 5000 },
          1,
        ),
        repo.updateSensor(
          owner,
          id,
          "mq2",
          { high: 900, low: 620, confirmMs: 2000 },
          1,
        ),
      ]);
      assert.equal(attempts.filter((r) => r.status === "fulfilled").length, 1);
      assert.equal(
        attempts.find((r) => r.status === "rejected").reason.status,
        409,
      );
      const current = await repo.config(id);
      assert.equal(current.version, 2);
      assert.equal(await repo.restoreConfig(owner, id, 1, 2), 3);
      assert.equal((await repo.config(id)).sensors[0].high, 700);
      await assert.rejects(
        () => repo.restoreConfig(other, id, 1, 3),
        (e) => e.status === 404,
      );
      // Falha após UPDATE prova rollback de valores, versão e auditoria na mesma transação.
      const realRows = repo.rows.bind(repo);
      repo.rows = async (sql, args, c) => {
        if (sql.startsWith("INSERT INTO config_revisions"))
          throw new Error("Falha injetada");
        return realRows(sql, args, c);
      };
      await assert.rejects(() =>
        repo.updateSensor(
          owner,
          id,
          "mq2",
          { high: 999, low: 500, confirmMs: 1000 },
          3,
        ),
      );
      repo.rows = realRows;
      assert.equal((await repo.config(id)).version, 3);
      assert.equal((await repo.config(id)).sensors[0].high, 700);
      const body = {
        deviceId: id,
        bootId: "fedcba9876543210",
        sequence: 1,
        uptimeMs: 60000,
        configVersion: 3,
        droppedSamples: 2,
        manualAlarm: false,
        diagnostics: {
          firmware: "2.1.0-tg",
          rssi: -60,
          freeHeap: 90000,
          queueDepth: 3,
          coalescedSamples: 5,
          resetReason: 1,
        },
        readings: [{ channel: "mq2", value: 900, state: "ALARM" }],
      };
      const from = new Date(Date.now() - 10000);
      await repo.ingest(body, 0, hash(key), false);
      const bundle = await repo.evidence(owner, id, {
        from,
        to: new Date(Date.now() + 10000),
      });
      assert.equal(bundle.payload.rowCount, 1);
      assert.deepEqual(bundle.payload.missingConfigVersions, []);
      assert.equal(bundle.payload.readings[0].diagnostics.firmware, "2.1.0-tg");
      assert.equal(bundle.sha256, hash(JSON.stringify(bundle.payload)));
      await assert.rejects(
        () => repo.evidence(other, id, { from, to: new Date() }),
        (e) => e.status === 404,
      );
      await assert.rejects(
        () => repo.revisions(other, id),
        (e) => e.status === 404,
      );
      const notification = (await repo.notifications(owner))[0];
      assert.equal(notification.status, "disabled");
      await assert.rejects(
        () => repo.retryNotification(other, notification.id),
        (e) => e.status === 404,
      );
      await assert.rejects(
        () => repo.retryNotification(owner, notification.id),
        (e) => e.status === 409,
      );
      await repo.setTelegram(owner, "123");
      await repo.retryNotification(owner, notification.id);
      const lease = "a".repeat(64),
        newLease = "b".repeat(64);
      // Simula retomada por worker novo: resposta atrasada do worker velho não altera a entrega.
      await repo.rows(
        "UPDATE notification_outbox SET status='sending',attempts=1,lease_token=? WHERE id=?",
        [newLease, notification.id],
      );
      await repo.finishNotification(notification.id, 1, true, false, {
        leaseToken: lease,
      });
      assert.equal((await repo.notifications(owner))[0].status, "sending");
      await repo.finishNotification(notification.id, 1, true, false, {
        leaseToken: newLease,
      });
      assert.equal((await repo.notifications(owner))[0].status, "sent");
      const audit = await repo.auditHistory(owner);
      assert(audit.some((r) => r.action === "configuration_restored"));
      assert(audit.some((r) => r.action === "notification_retry_requested"));
      assert(!JSON.stringify(audit).includes(key));
      await repo.addSensor(owner, id, "mq2-extra", "Segundo canal", {
        high: 700,
        low: 580,
        confirmMs: 5000,
      });
      await assert.rejects(
        () => repo.restoreConfig(owner, id, 1, 4),
        (e) => e.status === 409,
      );
    } finally {
      await pool.end();
    }
  },
);
