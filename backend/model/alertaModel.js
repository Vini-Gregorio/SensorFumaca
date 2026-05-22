import pool from "../config/db.js";
import { sendTelegramMessage } from "../utils/telegram.js";

// LISTAR ALERTAS POR USUÁRIO
export async function getAlertas(usuarioId) {
  const query = `
SELECT * 
    FROM alertas 
    join sensores on sensores.identificador = alertas.sensor
    join usuario on usuario_id = sensores.usuario_id
    WHERE sensores.usuario_id = ?
    ORDER BY alertas.data_hora DESC;
  `;
  const [rows] = await pool.execute(query, [usuarioId]);
  return rows;
}

/// -----------------------------
// ADICIONAR ALERTA (ESP32)
// -----------------------------


// addAlerta instrumentado: salva, tenta notificar e persiste falhas
export async function addAlerta(sensor, valor, nivel) {
  // 1) salva alerta
  const insertQuery = `INSERT INTO alertas (sensor, valor, nivel) VALUES (?, ?, ?)`;
  const [result] = await pool.execute(insertQuery, [sensor, valor, nivel]);
  const insertedId = result.insertId;
  console.log(`addAlerta: alerta salvo id=${insertedId} sensor=${sensor} valor=${valor} nivel=${nivel}`);

  // 2) decide se notifica
  try {
    const nivelNormalized = String(nivel || "").toLowerCase();
    console.log("addAlerta: nivelNormalized =", nivelNormalized);

    if (nivelNormalized === 'vermelho' || nivelNormalized === 'alto') {
      // busca chat do dono do sensor
      const q = `
        SELECT u.telegram_chat_id, u.email, s.nomeSala AS sala
        FROM sensores s
        JOIN usuario u ON u.id = s.usuario_id
        WHERE s.identificador = ?
        LIMIT 1
      `;
      const [rows] = await pool.execute(q, [sensor]);
      const dbChatId = rows?.[0]?.telegram_chat_id ?? null;
      const sala = rows?.[0]?.sala ?? '(sala desconhecida)';
      const fallbackChatId = process.env.TELEGRAM_CHAT_ID && process.env.TELEGRAM_CHAT_ID.trim() !== ""
        ? process.env.TELEGRAM_CHAT_ID.trim()
        : null;
      const chatId = dbChatId || fallbackChatId;

      //console.log("addAlerta: dbChatId =", dbChatId, "fallback =", fallbackChatId, "=> using:", chatId);

      console.log("addAlerta: dbChatId =", dbChatId, "sala =", sala, "fallback =", fallbackChatId, "=> using:", chatId);

      if (!chatId) {
        console.warn("addAlerta: nenhum chatId disponível — registro de falha será criado");
        // registra falha (sem tentar enviar)
        await pool.execute(
          `INSERT INTO telegram_failures (alerta_id, chat_id, payload, error_text) VALUES (?, ?, ?, ?)`,
          [insertedId, null, JSON.stringify({ sensor, valor, nivel }), 'no-chatid']
        );
        return insertedId;
      }

      // monta mensagem (cuidado com HTML se conteúdo vier do dispositivo)
      //const mensagem = `<b>⚠️ ALARME VERMELHO</b>\nSensor: <code>${sensor}</code>\nValor: <b>${valor}</b>\nNível: <b>${nivel}</b>\nID alerta: ${insertedId}\n${new Date().toLocaleString('pt-BR')}`;
      const mensagem = `⚠️ *ALARME VERMELHO*\nSala: ${sala}\nSensor: ${sensor}\nValor: ${valor}\nNível: ${nivel}\nID: ${insertedId}\n${new Date().toLocaleString('pt-BR')}`;
      // 3) tenta enviar e guarda resultado
      const envio = await sendTelegramMessage(chatId, mensagem);
      console.log("addAlerta: resultado envio telegram:", envio);

      if (!envio || !envio.ok) {
        // salva falha para retry manual/automático
        let errorText = 'unknown';
        try { errorText = JSON.stringify(envio.json || envio); } catch(e){ errorText = String(envio); }
        await pool.execute(
          `INSERT INTO telegram_failures (alerta_id, chat_id, payload, error_text) VALUES (?, ?, ?, ?)`,
          [insertedId, chatId, mensagem.slice(0,2000), errorText]
        );
        console.warn("addAlerta: falha no envio telegram registrada em telegram_failures.");
      } else {
        console.log("addAlerta: Telegram enviado com sucesso para", chatId);
      }
    } else {
      console.log("addAlerta: nivel não exige notificação (nivel=", nivel, ")");
    }
  } catch (err) {
    console.error("addAlerta: erro na rotina de notificação:", err);
    // registra falha no caso de exceção inesperada
    try {
      await pool.execute(
        `INSERT INTO telegram_failures (alerta_id, chat_id, payload, error_text) VALUES (?, ?, ?, ?)`,
        [insertedId, null, JSON.stringify({ sensor, valor, nivel }), String(err)]
      );
    } catch (e) {
      console.error("addAlerta: erro salvando falha no DB:", e);
    }
  }

  return insertedId;
}


// -----------------------------
// LISTAR ALERTAS POR USUÁRIO
// -----------------------------
export async function listarPorUsuario(usuarioId) {
  const query = `
    SELECT 
        a.id,
        a.sensor,
        a.valor,
        a.nivel,
        a.data_hora,
        S.nomeSala AS sala,
        S.identificador
    FROM alertas a
    INNER JOIN sensores S 
        ON S.identificador = a.sensor
    INNER JOIN usuario u 
        ON u.id = S.usuario_id
    WHERE u.id = ?
    ORDER BY a.data_hora DESC;
  `;

  const [rows] = await pool.execute(query, [usuarioId]);
  return rows;
}

// -----------------------------
// LISTAR ALERTAS POR SENSOR
// -----------------------------
export async function listarPorSensor(sensorId) {
  const query = `
    SELECT 
        id,
        sensor,
        valor,
        nivel,
        data_hora
    FROM alertas
    WHERE sensor = ?
    ORDER BY data_hora DESC;
  `;

  const [rows] = await pool.execute(query, [sensorId]);
  return rows;
}

export async function alertaPertenceAoUsuario(alertaId, usuarioId) {
  const query = `
    SELECT 1
    FROM alertas a
    JOIN sensores s ON s.identificador = a.sensor
    WHERE a.id = ? AND s.usuario_id = ?
    LIMIT 1;
  `;

  const [rows] = await pool.execute(query, [alertaId, usuarioId]);
  return rows.length > 0;
}

export async function marcarResolvido(id) {
  const query = `UPDATE alertas SET resolvido = 1 WHERE id = ?`;
  const [result] = await pool.execute(query, [id]);
  return result.affectedRows > 0;
}


// -----------------------------
// LISTAR SENSORES + ÚLTIMA LEITURA
// -----------------------------
export async function listarComUltimaLeitura(usuarioId) {
  const query = `
    SELECT 
        S.id,
        S.nomeSala,
        S.identificador,
        a.valor AS ultima_leitura,
        a.nivel,
        a.data_hora 
    FROM sensores S
    LEFT JOIN alertas a 
        ON a.id = (
          SELECT id FROM alertas 
          WHERE sensor = S.identificador 
          ORDER BY data_hora DESC LIMIT 1
        )
    WHERE S.usuario_id = ?
    ORDER BY S.nomeSala;
  `;

  const [rows] = await pool.execute(query, [usuarioId]);
  return rows;
}

export async function listarPorData(usuarioId) {
  const query = `
    SELECT a.* FROM alertas a
    JOIN sensores s ON a.sensor = s.identificador
    WHERE s.usuario_id = ? AND DATE(a.data_hora) = CURDATE()
  `;
  const [rows] = await pool.execute(query, [usuarioId]);
  return rows;
}

export async function listarSensoresEmAlerta(usuarioId) {
  const query = `
    SELECT a.sensor, a.valor, a.data_hora
    FROM alertas a
    JOIN sensores s ON a.sensor = s.identificador
    WHERE s.usuario_id = ?
    ORDER BY a.data_hora DESC
  `;
  const [rows] = await pool.execute(query, [usuarioId]);

  // Agrupar por sensor e pegar apenas o último alerta
  const sensoresMap = new Map();
  for (const alerta of rows) {
    if (!sensoresMap.has(alerta.sensor)) {
      sensoresMap.set(alerta.sensor, alerta);
    }
  }

  const sensoresEmAlerta = [];
  for (const alerta of sensoresMap.values()) {
    const minutosPassados = (Date.now() - new Date(alerta.data_hora)) / 60000;

    if (minutosPassados <= 5) {
      if (alerta.valor < 50) {
        // Estável → não entra na lista
      } else {
        // Alerta! → entra na lista de ativos
        sensoresEmAlerta.push(alerta.sensor);
      }
    }
  }

  return sensoresEmAlerta;
}



export async function getIntervaloMedio(usuarioId) {
  const query = `
    SELECT a.data_hora 
    FROM alertas a
    JOIN sensores s ON a.sensor = s.identificador
    WHERE s.usuario_id = ?
    ORDER BY a.data_hora ASC
  `;
  const [rows] = await pool.execute(query, [usuarioId]);

  if (rows.length < 2) return null;

  let totalDiff = 0;
  for (let i = 1; i < rows.length; i++) {
    const anterior = new Date(rows[i - 1].data_hora);
    const atual = new Date(rows[i].data_hora);
    totalDiff += (atual - anterior);
  }

  const mediaMs = totalDiff / (rows.length - 1);
  const mediaMin = Math.floor(mediaMs / 60000);
  const horas = Math.floor(mediaMin / 60);
  const minutos = mediaMin % 60;

  return `${String(horas).padStart(2, "0")}:${String(minutos).padStart(2, "0")}`;
}

export async function agruparPorAno(usuarioId, ano) {
  const query = `
    SELECT 
      MONTH(a.data_hora) AS mes,
      COUNT(*) AS total
    FROM alertas a
    JOIN sensores s 
      ON s.identificador = a.sensor
    WHERE s.usuario_id = ?
      AND YEAR(a.data_hora) = ?
    GROUP BY MONTH(a.data_hora)
    ORDER BY mes
  `;

  const [rows] = await pool.execute(query, [usuarioId, ano]);

  return rows;
}
