import { HttpError, hash, equalHash, token } from "./domain.js";
import { buildEvidence } from "./evidence.js";
const json = (value) => (typeof value === "string" ? JSON.parse(value) : value);

// Todas as entradas externas são parâmetros SQL. Locks serializam alterações por dispositivo.
export class Repository {
  constructor(pool) {
    this.pool = pool;
  }
  async rows(sql, args = [], connection = this.pool) {
    return (await connection.execute(sql, args))[0];
  }
  async transaction(fn) {
    const c = await this.pool.getConnection();
    try {
      await c.beginTransaction();
      const result = await fn(c);
      await c.commit();
      return result;
    } catch (error) {
      await c.rollback();
      throw error;
    } finally {
      c.release();
    }
  }
  async userByEmail(email) {
    return (await this.rows("SELECT * FROM users WHERE email=?", [email]))[0];
  }
  async createUser(email, passwordHash) {
    return (
      await this.rows("INSERT INTO users (email,password_hash) VALUES (?,?)", [
        email,
        passwordHash,
      ])
    ).insertId;
  }
  async createSession(tokenHash, userId) {
    await this.rows("DELETE FROM sessions WHERE expires_at < UTC_TIMESTAMP(3)");
    await this.rows(
      "INSERT INTO sessions (token_hash,user_id,expires_at) VALUES (?,?,DATE_ADD(UTC_TIMESTAMP(3), INTERVAL 8 HOUR))",
      [tokenHash, userId],
    );
  }
  async session(tokenHash) {
    return (
      await this.rows(
        "SELECT u.id,u.email,u.telegram_chat_id FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>UTC_TIMESTAMP(3)",
        [tokenHash],
      )
    )[0];
  }
  async deleteSession(tokenHash) {
    await this.rows("DELETE FROM sessions WHERE token_hash=?", [tokenHash]);
  }
  async setTelegram(userId, chatId) {
    await this.transaction(async (c) => {
      await this.rows(
        "UPDATE users SET telegram_chat_id=? WHERE id=?",
        [chatId, userId],
        c,
      );
      await this.audit(c, userId, null, "telegram_destination_changed", {
        configured: chatId !== null,
      });
    });
  }
  async device(id) {
    return (await this.rows("SELECT * FROM devices WHERE id=?", [id]))[0];
  }
  async ownedDevice(id, userId, c = this.pool, lock = false) {
    const d = (
      await this.rows(
        `SELECT * FROM devices WHERE id=? AND user_id=?${lock ? " FOR UPDATE" : ""}`,
        [id, userId],
        c,
      )
    )[0];
    if (!d) throw new HttpError(404, "Dispositivo não encontrado.");
    return d;
  }
  async createDevice(userId, id, name, tokenHash) {
    await this.transaction(async (c) => {
      await this.rows(
        "INSERT INTO devices (id,user_id,name,token_hash) VALUES (?,?,?,?)",
        [id, userId, name, tokenHash],
        c,
      );
      await this.rows(
        "INSERT INTO sensors (device_id,channel,name) VALUES (?,?,?)",
        [id, "mq2", "MQ-2"],
        c,
      );
      await this.saveRevision(c, id, "device_created");
      await this.audit(c, userId, id, "device_created", { version: 1 });
    });
  }
  async rotateDevice(userId, id, tokenHash) {
    await this.transaction(async (c) => {
      await this.ownedDevice(id, userId, c, true);
      await this.rows(
        "UPDATE devices SET token_hash=? WHERE id=?",
        [tokenHash, id],
        c,
      );
      await this.audit(c, userId, id, "device_key_rotated", {});
    });
  }
  async enableDevice(userId, id, enabled) {
    await this.transaction(async (c) => {
      await this.ownedDevice(id, userId, c, true);
      await this.rows(
        "UPDATE devices SET enabled=? WHERE id=?",
        [enabled, id],
        c,
      );
      await this.audit(c, userId, id, "device_access_changed", { enabled });
    });
  }
  async readConfig(id, c) {
    const d = (
      await this.rows("SELECT config_version FROM devices WHERE id=?", [id], c)
    )[0];
    if (!d) throw new HttpError(404, "Dispositivo não encontrado.");
    const rows = await this.rows(
      "SELECT channel,kind,unit,high_threshold,low_threshold,confirm_ms FROM sensors WHERE device_id=? ORDER BY id",
      [id],
      c,
    );
    return {
      version: d.config_version,
      sensors: rows.map((s) => ({
        channel: s.channel,
        kind: s.kind,
        unit: s.unit,
        high: s.high_threshold,
        low: s.low_threshold,
        confirmMs: s.confirm_ms,
      })),
    };
  }
  async config(id, authenticatedHash) {
    return this.transaction(async (c) => {
      const d = (
        await this.rows("SELECT * FROM devices WHERE id=? FOR UPDATE", [id], c)
      )[0];
      if (!d) throw new HttpError(404, "Dispositivo não encontrado.");
      if (
        authenticatedHash &&
        (!d.enabled || !equalHash(d.token_hash, authenticatedHash))
      )
        throw new HttpError(401, "Dispositivo não autorizado.");
      // Versão e canais são lidos sob o MESMO lock das edições.
      return this.readConfig(id, c);
    });
  }
  async saveRevision(c, id, reason) {
    const snapshot = await this.readConfig(id, c);
    await this.rows(
      "INSERT INTO config_revisions (device_id,version,snapshot,reason) VALUES (?,?,?,?)",
      [id, snapshot.version, JSON.stringify(snapshot), reason],
      c,
    );
    return snapshot.version;
  }
  async audit(c, userId, deviceId, action, details) {
    await this.rows(
      "INSERT INTO audit_log (user_id,device_id,action,details) VALUES (?,?,?,?)",
      [userId, deviceId, action, JSON.stringify(details)],
      c,
    );
  }
  async auditHistory(userId) {
    return (
      await this.rows(
        "SELECT id,device_id,action,details,created_at FROM audit_log WHERE user_id=? ORDER BY id DESC LIMIT 100",
        [userId],
      )
    ).map((r) => ({ ...r, details: json(r.details) }));
  }
  async revisions(userId, id) {
    await this.ownedDevice(id, userId);
    return (
      await this.rows(
        "SELECT version,snapshot,reason,created_at FROM config_revisions WHERE device_id=? ORDER BY version DESC LIMIT 100",
        [id],
      )
    ).map((r) => ({ ...r, snapshot: json(r.snapshot) }));
  }
  async restoreConfig(userId, id, version, expectedVersion) {
    return this.transaction(async (c) => {
      const d = await this.ownedDevice(id, userId, c, true);
      if (d.config_version !== expectedVersion)
        throw new HttpError(
          409,
          "Configuração mudou. Atualize a página antes de editar.",
        );
      const revision = (
        await this.rows(
          "SELECT snapshot FROM config_revisions WHERE device_id=? AND version=?",
          [id, version],
          c,
        )
      )[0];
      if (!revision) throw new HttpError(404, "Revisão não encontrada.");
      const snapshot = json(revision.snapshot),
        current = await this.readConfig(id, c);
      if (
        snapshot.sensors.length !== current.sensors.length ||
        snapshot.sensors.some(
          (s) => !current.sensors.some((t) => t.channel === s.channel),
        )
      )
        throw new HttpError(
          409,
          "Restauração exige os mesmos canais. Ajuste os limites individualmente.",
        );
      for (const s of snapshot.sensors)
        await this.rows(
          "UPDATE sensors SET high_threshold=?,low_threshold=?,confirm_ms=? WHERE device_id=? AND channel=?",
          [s.high, s.low, s.confirmMs, id, s.channel],
          c,
        );
      await this.rows(
        "UPDATE devices SET config_version=config_version+1 WHERE id=?",
        [id],
        c,
      );
      const newVersion = await this.saveRevision(
        c,
        id,
        `restored_from_${version}`,
      );
      await this.audit(c, userId, id, "configuration_restored", {
        fromVersion: version,
        previousVersion: expectedVersion,
        version: newVersion,
      });
      return newVersion;
    });
  }
  async addSensor(userId, id, channel, name, config) {
    await this.transaction(async (c) => {
      await this.ownedDevice(id, userId, c, true);
      const rows = await this.rows(
        "SELECT id FROM sensors WHERE device_id=?",
        [id],
        c,
      );
      if (rows.length >= 8)
        throw new HttpError(409, "Máximo de 8 canais por dispositivo.");
      await this.rows(
        "INSERT INTO sensors (device_id,channel,name,high_threshold,low_threshold,confirm_ms) VALUES (?,?,?,?,?,?)",
        [id, channel, name, config.high, config.low, config.confirmMs],
        c,
      );
      await this.rows(
        "UPDATE devices SET config_version=config_version+1 WHERE id=?",
        [id],
        c,
      );
      const version = await this.saveRevision(c, id, "sensor_added");
      await this.audit(c, userId, id, "sensor_added", { channel, version });
    });
  }
  async updateSensor(userId, id, channel, config, expectedVersion) {
    return this.transaction(async (c) => {
      const d = await this.ownedDevice(id, userId, c, true);
      if (d.config_version !== expectedVersion)
        throw new HttpError(
          409,
          "Configuração mudou. Atualize a página antes de editar.",
        );
      const rows = await this.rows(
        "SELECT id FROM sensors WHERE device_id=? AND channel=?",
        [id, channel],
        c,
      );
      if (!rows.length) throw new HttpError(404, "Canal não encontrado.");
      await this.rows(
        "UPDATE sensors SET high_threshold=?,low_threshold=?,confirm_ms=? WHERE device_id=? AND channel=?",
        [config.high, config.low, config.confirmMs, id, channel],
        c,
      );
      await this.rows(
        "UPDATE devices SET config_version=config_version+1 WHERE id=?",
        [id],
        c,
      );
      const version = await this.saveRevision(c, id, "sensor_updated");
      await this.audit(c, userId, id, "sensor_updated", {
        channel,
        previousVersion: expectedVersion,
        version,
      });
      return version;
    });
  }
  async dashboard(userId) {
    return this.rows(
      `SELECT d.id AS device_id,d.name AS device_name,d.enabled,d.config_version AS desired_version,
      s.id AS sensor_id,s.channel,s.name,s.unit,s.high_threshold,s.low_threshold,s.confirm_ms,
      r.value,r.state,r.observed_at,e.config_version,e.manual_alarm,e.dropped_samples,e.diagnostics,d.last_contact_at
      FROM devices d JOIN sensors s ON s.device_id=d.id
      LEFT JOIN readings r ON r.id=(SELECT r2.id FROM readings r2 WHERE r2.sensor_id=s.id ORDER BY r2.observed_at DESC,r2.id DESC LIMIT 1)
      LEFT JOIN events e ON e.id=r.event_id WHERE d.user_id=? ORDER BY d.id,s.id`,
      [userId],
    );
  }
  async history(userId, id, channel, before) {
    await this.ownedDevice(id, userId);
    return this.rows(
      `SELECT r.id,r.value,r.state,r.observed_at,e.received_at,e.config_version,e.manual_alarm,e.dropped_samples
      FROM readings r JOIN sensors s ON s.id=r.sensor_id JOIN events e ON e.id=r.event_id
      WHERE s.device_id=? AND s.channel=? AND r.id < ? ORDER BY r.id DESC LIMIT 100`,
      [id, channel, before],
    );
  }
  async notifications(userId) {
    return this.rows(
      "SELECT id,event_id,message,status,attempts,sent_at,retry_count,error_code FROM notification_outbox WHERE user_id=? ORDER BY id DESC LIMIT 100",
      [userId],
    );
  }
  async retryNotification(userId, id) {
    await this.transaction(async (c) => {
      const n = (
        await this.rows(
          "SELECT n.*,u.telegram_chat_id FROM notification_outbox n JOIN users u ON u.id=n.user_id WHERE n.id=? AND n.user_id=? FOR UPDATE",
          [id, userId],
          c,
        )
      )[0];
      if (!n) throw new HttpError(404, "Entrega não encontrada.");
      if (!["failed", "disabled"].includes(n.status) || n.retry_count >= 3)
        throw new HttpError(
          409,
          "Entrega não pode ser reenviada (máximo 3 reenvios).",
        );
      if (!n.telegram_chat_id)
        throw new HttpError(
          409,
          "Configure um destinatário antes de reenviar.",
        );
      await this.rows(
        "UPDATE notification_outbox SET status='pending',attempts=0,retry_count=retry_count+1,error_code=NULL,lease_token=NULL,lease_until=NULL,available_at=UTC_TIMESTAMP(3) WHERE id=?",
        [id],
        c,
      );
      await this.audit(c, userId, null, "notification_retry_requested", {
        notificationId: id,
        eventId: n.event_id,
      });
    });
  }
  async evidence(userId, id, window) {
    return this.transaction(async (c) => {
      await this.ownedDevice(id, userId, c);
      const rows = await this.rows(
        `SELECT r.id,r.event_id,s.channel,r.value,r.state,r.observed_at,e.received_at,e.boot_id,e.sequence,e.uptime_ms,e.config_version,e.manual_alarm,e.dropped_samples,e.diagnostics
        FROM events e JOIN readings r ON r.event_id=e.id JOIN sensors s ON s.id=r.sensor_id
        WHERE e.device_id=? AND e.observed_at>=? AND e.observed_at<? ORDER BY r.id LIMIT 10001`,
        [id, window.from, window.to],
        c,
      );
      if (rows.length > 10000)
        throw new HttpError(
          413,
          "Mais de 10.000 leituras. Exporte um intervalo menor; nenhum dado foi truncado.",
        );
      const versions = [...new Set(rows.map((r) => r.config_version))];
      const revisions = versions.length
        ? await this.rows(
            `SELECT version,snapshot,reason FROM config_revisions WHERE device_id=? AND version IN (${versions.map(() => "?").join(",")})`,
            [id, ...versions],
            c,
          )
        : [];
      return buildEvidence(
        id,
        window,
        rows.map((r) => ({ ...r, diagnostics: json(r.diagnostics) })),
        revisions.map((r) => ({ ...r, snapshot: json(r.snapshot) })),
      );
    });
  }
  async ingest(body, ageMs, authenticatedHash, notificationsEnabled) {
    return this.transaction(async (c) => {
      const d = (
        await this.rows(
          "SELECT * FROM devices WHERE id=? FOR UPDATE",
          [body.deviceId],
          c,
        )
      )[0];
      // Revalidar sob lock: rotação/desativação não pode passar pela janela entre auth e commit.
      if (!d?.enabled || !equalHash(d.token_hash, authenticatedHash))
        throw new HttpError(401, "Dispositivo não autorizado.");
      await this.rows(
        "UPDATE devices SET last_contact_at=UTC_TIMESTAMP(3) WHERE id=?",
        [body.deviceId],
        c,
      );
      const digest = hash(JSON.stringify(body));
      const old = (
        await this.rows(
          "SELECT id,payload_hash FROM events WHERE device_id=? AND boot_id=? AND sequence=?",
          [body.deviceId, body.bootId, body.sequence],
          c,
        )
      )[0];
      if (old) {
        if (old.payload_hash !== digest)
          throw new HttpError(
            409,
            "Identificador já usado por outro conteúdo.",
          );
        return { duplicate: true, eventId: old.id };
      }
      const sensors = await this.rows(
        "SELECT * FROM sensors WHERE device_id=?",
        [body.deviceId],
        c,
      );
      // Firmware pode ainda estar com versão anterior. Canais novos ficam SEM_DADOS até provisionados.
      if (
        body.readings.some((r) => !sensors.some((s) => s.channel === r.channel))
      )
        throw new HttpError(422, "Canal não cadastrado.");
      if (body.configVersion > d.config_version)
        throw new HttpError(409, "Versão de configuração desconhecida.");
      const observedAt = new Date(Date.now() - ageMs);
      const event = await this.rows(
        "INSERT INTO events (device_id,boot_id,sequence,payload_hash,config_version,uptime_ms,dropped_samples,manual_alarm,observed_at,diagnostics) VALUES (?,?,?,?,?,?,?,?,?,?)",
        [
          body.deviceId,
          body.bootId,
          body.sequence,
          digest,
          body.configVersion,
          body.uptimeMs,
          body.droppedSamples,
          body.manualAlarm,
          observedAt,
          body.diagnostics ? JSON.stringify(body.diagnostics) : null,
        ],
        c,
      );
      let newAlarm = false;
      for (const r of body.readings) {
        const s = sensors.find((s) => s.channel === r.channel);
        const previous = (
          await this.rows(
            "SELECT r.state,r.observed_at,e.manual_alarm FROM readings r JOIN events e ON e.id=r.event_id WHERE r.sensor_id=? ORDER BY r.observed_at DESC,r.id DESC LIMIT 1",
            [s.id],
            c,
          )
        )[0];
        const chronological =
          !previous || observedAt >= new Date(previous.observed_at);
        if (
          chronological &&
          ((r.state === "ALARM" && previous?.state !== "ALARM") ||
            (body.manualAlarm && !previous?.manual_alarm))
        )
          newAlarm = true;
        await this.rows(
          "INSERT INTO readings (event_id,sensor_id,value,state,observed_at) VALUES (?,?,?,?,?)",
          [event.insertId, s.id, r.value, r.state, observedAt],
          c,
        );
      }
      if (newAlarm) {
        const message = `MQ-FIRE: alarme em ${d.name} (${d.id}). Evento ${event.insertId}; observado em ${observedAt.toISOString()}, recebido com ${Math.round(ageMs / 1000)} s de atraso. Verifique o local pelo procedimento combinado.`;
        await this.rows(
          "INSERT INTO notification_outbox (event_id,user_id,message,status) VALUES (?,?,?,?)",
          [
            event.insertId,
            d.user_id,
            message,
            notificationsEnabled ? "pending" : "disabled",
          ],
          c,
        );
      }
      return { duplicate: false, eventId: event.insertId };
    });
  }
  async claimNotification() {
    return this.transaction(async (c) => {
      const n = (
        await this.rows(
          `SELECT n.*,u.telegram_chat_id FROM notification_outbox n JOIN users u ON u.id=n.user_id
        WHERE (n.status='pending' AND n.available_at<=UTC_TIMESTAMP(3)) OR (n.status='sending' AND n.lease_until<UTC_TIMESTAMP(3))
        ORDER BY n.id LIMIT 1 FOR UPDATE SKIP LOCKED`,
          [],
          c,
        )
      )[0];
      if (!n) return null;
      const leaseToken = token();
      await this.rows(
        "UPDATE notification_outbox SET status='sending',attempts=attempts+1,lease_until=DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 30 SECOND),lease_token=? WHERE id=?",
        [leaseToken, n.id],
        c,
      );
      return { ...n, attempts: n.attempts + 1, leaseToken };
    });
  }
  async finishNotification(
    id,
    attempts,
    success,
    permanent = false,
    options = {},
  ) {
    const status = success
      ? "sent"
      : permanent || attempts >= 5
        ? "failed"
        : "pending";
    await this.rows(
      "UPDATE notification_outbox SET status=?,sent_at=?,lease_until=NULL,lease_token=NULL,available_at=?,error_code=? WHERE id=? AND lease_token=? AND status='sending'",
      [
        status,
        success ? new Date() : null,
        new Date(
          Date.now() +
            Math.max(
              options.retryAfterMs || 0,
              Math.min(300000, 1000 * 2 ** attempts),
            ),
        ),
        success ? null : options.errorCode || "DELIVERY_ERROR",
        id,
        options.leaseToken || null,
      ],
    );
  }
}
