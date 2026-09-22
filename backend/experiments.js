import {
  HttpError,
  requireObject,
  text,
  identifier,
  hash,
  evidenceWindow,
  utcDate,
} from "./domain.js";

export function experimentInput(body) {
  requireObject(body);
  if (
    !Array.isArray(body.deviceIds) ||
    body.deviceIds.length < 1 ||
    body.deviceIds.length > 8
  )
    throw new HttpError(400, "Selecione de 1 a 8 dispositivos.");
  const deviceIds = body.deviceIds.map((id) => identifier(id));
  if (new Set(deviceIds).size !== deviceIds.length)
    throw new HttpError(400, "Dispositivo repetido.");
  if (
    typeof body.softwareRef !== "string" ||
    !/^[a-f0-9]{40}$/.test(body.softwareRef)
  )
    throw new HttpError(
      400,
      "Informe o SHA completo do commit (40 caracteres hexadecimais).",
    );
  return {
    title: text(body.title, "Título", 120),
    objective: text(body.objective, "Objetivo", 2000),
    protocol: text(body.protocol, "Protocolo", 2000),
    acceptanceCriteria: text(
      body.acceptanceCriteria,
      "Critério de aceite",
      2000,
    ),
    environment: text(body.environment, "Condições do ambiente", 1000),
    hardware: text(body.hardware, "Montagem/hardware", 1000),
    softwareRef: body.softwareRef,
    deviceIds: deviceIds.sort(),
  };
}

export function noteInput(body) {
  requireObject(body);
  if (!["observation", "reference", "network", "hardware"].includes(body.kind))
    throw new HttpError(400, "Tipo de anotação inválido.");
  let observedAt = null;
  if (body.observedAt !== undefined && body.observedAt !== null) {
    observedAt = utcDate(body.observedAt);
  }
  return {
    kind: body.kind,
    note: text(body.note, "Anotação", 1000),
    observedAt,
  };
}

export function conclusionInput(body) {
  requireObject(body);
  if (!["met", "not_met", "inconclusive"].includes(body.outcome))
    throw new HttpError(400, "Informe o resultado avaliado pelo pesquisador.");
  return {
    outcome: body.outcome,
    conclusion: text(body.conclusion, "Conclusão", 2000),
  };
}

const json = (v) => (typeof v === "string" ? JSON.parse(v) : v);
const publicExperiment = ({ user_id, ...record }) => record;

// Coordena protocolo, montagem, observações e telemetria sem alterar o alarme.
export class Experiments {
  constructor(repo) {
    this.repo = repo;
  }
  async owned(userId, id, c, lock = false) {
    const [row] = await this.repo.rows(
      `SELECT * FROM experiments WHERE id=? AND user_id=?${lock ? " FOR UPDATE" : ""}`,
      [id, userId],
      c,
    );
    if (!row) throw new HttpError(404, "Ensaio não encontrado.");
    return row;
  }
  async list(userId) {
    return this.repo.rows(
      "SELECT id,title,status,outcome,created_at,started_at,ended_at FROM experiments WHERE user_id=? ORDER BY id DESC LIMIT 50",
      [userId],
    );
  }
  async read(userId, id, c) {
    const collect = async (conn) => {
      const experiment = publicExperiment(await this.owned(userId, id, conn));
      const devices = (
        await this.repo.rows(
          "SELECT device_id,configuration_at_start FROM experiment_devices WHERE experiment_id=? ORDER BY device_id",
          [id],
          conn,
        )
      ).map((r) => ({
        ...r,
        configuration_at_start: json(r.configuration_at_start),
      }));
      const notes = await this.repo.rows(
        "SELECT id,kind,note,observed_at,recorded_at FROM experiment_notes WHERE experiment_id=? ORDER BY observed_at,id",
        [id],
        conn,
      );
      return { experiment, devices, notes };
    };
    return c ? collect(c) : this.repo.transaction(collect);
  }
  async create(userId, input) {
    return this.repo.transaction(async (c) => {
      for (const id of input.deviceIds)
        await this.repo.ownedDevice(id, userId, c, true);
      const result = await this.repo.rows(
        "INSERT INTO experiments (user_id,title,objective,protocol,acceptance_criteria,environment,hardware,software_ref) VALUES (?,?,?,?,?,?,?,?)",
        [
          userId,
          input.title,
          input.objective,
          input.protocol,
          input.acceptanceCriteria,
          input.environment,
          input.hardware,
          input.softwareRef,
        ],
        c,
      );
      for (const id of input.deviceIds)
        await this.repo.rows(
          "INSERT INTO experiment_devices (experiment_id,device_id) VALUES (?,?)",
          [result.insertId, id],
          c,
        );
      await this.repo.audit(c, userId, null, "experiment_planned", {
        experimentId: result.insertId,
      });
      return result.insertId;
    });
  }
  async start(userId, id) {
    return this.repo.transaction(async (c) => {
      const e = await this.owned(userId, id, c, true);
      if (e.status !== "planned")
        throw new HttpError(
          409,
          "Somente um ensaio planejado pode ser iniciado.",
        );
      const devices = await this.repo.rows(
        "SELECT device_id FROM experiment_devices WHERE experiment_id=? ORDER BY device_id",
        [id],
        c,
      );
      for (const { device_id } of devices) {
        const d = await this.repo.ownedDevice(device_id, userId, c, true);
        if (!d.enabled)
          throw new HttpError(
            409,
            "Reative a ingestão dos dispositivos antes do ensaio.",
          );
        const snapshot = await this.repo.readConfig(device_id, c);
        await this.repo.rows(
          "UPDATE experiment_devices SET configuration_at_start=? WHERE experiment_id=? AND device_id=?",
          [JSON.stringify(snapshot), id, device_id],
          c,
        );
      }
      await this.repo.rows(
        "UPDATE experiments SET status='running',started_at=UTC_TIMESTAMP(3) WHERE id=?",
        [id],
        c,
      );
      await this.repo.audit(c, userId, null, "experiment_started", {
        experimentId: id,
      });
    });
  }
  async note(userId, id, input) {
    return this.repo.transaction(async (c) => {
      const e = await this.owned(userId, id, c, true);
      if (e.status === "planned")
        throw new HttpError(
          409,
          "Inicie o ensaio antes de registrar observações.",
        );
      const [clock] = await this.repo.rows(
        "SELECT UTC_TIMESTAMP(3) AS now",
        [],
        c,
      );
      if (e.status === "completed" && !input.observedAt)
        throw new HttpError(
          400,
          "Em ensaio concluído, informe quando a observação ocorreu.",
        );
      const observedAt = input.observedAt || clock.now;
      if (
        +observedAt < +new Date(e.started_at) ||
        +observedAt > +new Date(e.ended_at || clock.now)
      )
        throw new HttpError(
          400,
          "Observação deve estar dentro do período real do ensaio e não pode ser futura.",
        );
      const [count] = await this.repo.rows(
        "SELECT COUNT(*) AS n FROM experiment_notes WHERE experiment_id=?",
        [id],
        c,
      );
      if (count.n >= 200)
        throw new HttpError(409, "Limite de 200 anotações por ensaio.");
      const result = await this.repo.rows(
        "INSERT INTO experiment_notes (experiment_id,kind,note,observed_at) VALUES (?,?,?,?)",
        [id, input.kind, input.note, observedAt],
        c,
      );
      await this.repo.audit(c, userId, null, "experiment_note_added", {
        experimentId: id,
        noteId: result.insertId,
      });
      return result.insertId;
    });
  }
  async finish(userId, id, input) {
    return this.repo.transaction(async (c) => {
      const e = await this.owned(userId, id, c, true);
      if (e.status !== "running")
        throw new HttpError(
          409,
          "Somente um ensaio em andamento pode ser concluído.",
        );
      await this.repo.rows(
        "UPDATE experiments SET status='completed',outcome=?,conclusion=?,ended_at=UTC_TIMESTAMP(3) WHERE id=?",
        [input.outcome, input.conclusion, id],
        c,
      );
      await this.repo.audit(c, userId, null, "experiment_completed", {
        experimentId: id,
        outcome: input.outcome,
      });
    });
  }
  async evidence(userId, id, requestedWindow = null) {
    return this.repo.transaction(async (c) => {
      const record = await this.read(userId, id, c),
        e = record.experiment;
      if (!e.started_at) throw new HttpError(409, "Ensaio ainda não iniciado.");
      const [clock] = await this.repo.rows(
        "SELECT UTC_TIMESTAMP(3) AS now",
        [],
        c,
      );
      const last = new Date(e.ended_at || clock.now),
        first = new Date(e.started_at);
      const window =
        requestedWindow ||
        evidenceWindow({ from: first.toISOString(), to: last.toISOString() });
      if (window.from < first || window.to > last)
        throw new HttpError(
          400,
          "Intervalo de exportação fora do período do ensaio.",
        );
      const telemetry = [];
      let rowCount = 0;
      for (const d of record.devices) {
        const bundle = await this.repo.evidence(userId, d.device_id, window, c);
        rowCount += bundle.payload.rowCount;
        if (rowCount > 10000)
          throw new HttpError(
            413,
            "Mais de 10.000 leituras somando dispositivos. Exporte intervalo menor.",
          );
        telemetry.push(bundle.payload);
      }
      const payload = {
        schemaVersion: "mqfire-experiment/1",
        generatedAt: new Date(clock.now).toISOString(),
        ...record,
        window: {
          from: window.from.toISOString(),
          to: window.to.toISOString(),
          boundary: "[from,to)",
        },
        rowCount,
        telemetry,
        limitations: [
          "Protocolo, montagem, commit, anotações e conclusão são declarações do pesquisador, não verificação automática.",
          "Configuração inicial é a desejada no servidor; verificar versão realmente aplicada nas leituras.",
          "Estado do firmware não é verdade de campo; não foi calculada precisão nem resultado por IA.",
          "Anotações abrangem todo o ensaio, mesmo quando a janela de telemetria é parcial.",
          "Retransmissões e anotações tardias podem aparecer em exportações posteriores; guarde a versão analisada.",
          "Conteúdo privado: revisar textos livres e pseudonimizar identificadores antes de compartilhar.",
        ],
      };
      return {
        payload,
        sha256: hash(JSON.stringify(payload)),
        hashEncoding:
          "SHA-256 de JSON.stringify(payload), UTF-8; sem assinatura digital",
      };
    });
  }
}
