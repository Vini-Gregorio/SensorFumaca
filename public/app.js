import { mountExperiments } from "./experiments.js";
const $ = (id) => document.getElementById(id);
const experimentsUI = mountExperiments({ api, run, message });
let signedIn = false,
  refreshing = false;
let visibleReadings = [],
  lastRefresh = 0;
function message(value) {
  $("message").textContent = value;
}
async function api(path, method = "GET", body) {
  const response = await fetch(`/api/v1${path}`, {
    method,
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = response.status === 204 ? null : await response.json();
  if (!response.ok) {
    if (response.status === 401) {
      signedIn = false;
      showAuth();
    }
    throw new Error(data?.error || `HTTP ${response.status}`);
  }
  return data;
}
function showAuth() {
  $("auth").hidden = signedIn;
  $("workspace").hidden = !signedIn;
  $("logout").hidden = !signedIn;
  if (!signedIn) {
    experimentsUI.reset();
    $("sensors").replaceChildren();
    $("api-key").textContent = "";
    $("credential").hidden = true;
    $("detail-data").textContent = "";
    $("detail-actions").replaceChildren();
    $("detail").hidden = true;
    $("telegram").reset();
    $("evidence").reset();
    visibleReadings = [];
    lastRefresh = 0;
  }
}
function formData(id) {
  return Object.fromEntries(new FormData($(id)));
}
function bind(id, callback) {
  $(id).addEventListener("submit", (event) => {
    event.preventDefault();
    run(callback);
  });
}
async function run(fn) {
  try {
    await fn();
  } catch (e) {
    message(e.message);
  }
}
function element(tag, value, className) {
  const e = document.createElement(tag);
  e.textContent = value;
  if (className) e.className = className;
  return e;
}
function showKey(key) {
  $("api-key").textContent = key;
  $("credential").hidden = false;
  $("credential").scrollIntoView({ behavior: "smooth" });
}
function detail(title, data) {
  $("detail-title").textContent = title;
  $("detail-data").textContent = JSON.stringify(data, null, 2);
  $("detail").hidden = false;
  $("detail-actions").replaceChildren();
}
function liveState(row) {
  if (!row.enabled) return "DESATIVADO";
  if (!lastRefresh || Date.now() - lastRefresh > 25000)
    return "SEM ATUALIZAÇÃO";
  if (
    row.observed_at &&
    Date.now() - new Date(row.observed_at).getTime() > 90000
  )
    return "OFFLINE";
  return row.status;
}
function updateVisibleStates() {
  for (const row of visibleReadings) {
    const card = [...document.querySelectorAll(".card")].find(
      (c) => c.dataset.sensorId === String(row.sensor_id),
    );
    if (!card) continue;
    const state = card.querySelector(".state");
    state.textContent = liveState(row);
    state.dataset.state = liveState(row);
    card.querySelector(".value").textContent =
      row.value == null ? "—" : `${row.value} ADC`;
    card.querySelector(".observed").textContent = row.observed_at
      ? `Observação: ${new Date(row.observed_at).toLocaleString("pt-BR")}`
      : "Nenhuma leitura.";
  }
}
async function showRevisions(row) {
  const revisions = await api(`/devices/${row.device_id}/config/revisions`);
  detail(`Versões de configuração · ${row.device_id}`, revisions);
  for (const r of revisions) {
    if (r.version === row.desired_version) continue;
    const button = element(
      "button",
      `Restaurar limites da versão ${r.version}`,
    );
    button.onclick = () =>
      run(async () => {
        if (
          !confirm(
            `Restaurar os limites da versão ${r.version}? Será criada uma nova versão, enviada ao ESP32. Confira a adequação ao ensaio antes de confirmar.`,
          )
        )
          return;
        await api(`/devices/${row.device_id}/config/restore`, "POST", {
          version: r.version,
          expectedVersion: row.desired_version,
        });
        detail(
          "Restauração solicitada",
          "Aguarde a confirmação da nova versão pelo dispositivo.",
        );
        await refresh();
      });
    $("detail-actions").append(button);
  }
}
function showHistory(row, readings) {
  detail(`Histórico · ${row.device_id} / ${row.channel}`, readings);
  if (!readings.length) return;
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 600 180");
  svg.setAttribute("role", "img");
  svg.setAttribute(
    "aria-label",
    "Tendência das leituras brutas ADC, de zero a 4095, em ordem de registro.",
  );
  svg.classList.add("trend");
  const points = readings
    .slice()
    .reverse()
    .map(
      (r, i) =>
        `${10 + (i * 580) / Math.max(1, readings.length - 1)},${170 - (r.value * 150) / 4095}`,
    )
    .join(" ");
  const line = document.createElementNS(ns, "polyline");
  line.setAttribute("points", points);
  line.setAttribute("fill", "none");
  line.setAttribute("stroke", "currentColor");
  line.setAttribute("stroke-width", "2");
  svg.append(line);
  $("detail-actions").append(
    element(
      "p",
      "Tendência ADC (0–4095). Espaçamento por ordem de registro, não por tempo; trechos podem conter lacunas.",
    ),
    svg,
  );
}
async function showNotifications() {
  const rows = await api("/notifications");
  detail("Entregas de notificações", rows);
  for (const row of rows.filter(
    (r) => ["failed", "disabled"].includes(r.status) && r.retry_count < 3,
  )) {
    const b = element("button", `Reenviar evento ${row.event_id}`);
    b.onclick = () =>
      run(async () => {
        if (
          !confirm(
            "Reenviar este evento histórico ao destinatário atualmente configurado? A mensagem será identificada como reenvio manual.",
          )
        )
          return;
        await api(`/notifications/${row.id}/retry`, "POST", {});
        await showNotifications();
        message("Reenvio registrado. Confira o resultado na lista.");
      });
    $("detail-actions").append(b);
  }
}
async function refresh() {
  if (refreshing) return;
  refreshing = true;
  try {
    const rows = await api("/devices");
    if (!signedIn) return;
    visibleReadings = rows;
    lastRefresh = Date.now();
    $("updated").textContent =
      `Atualizado ${new Date().toLocaleTimeString("pt-BR")}`;
    // Atualizar leituras sem destruir um formulário que está sendo preenchido.
    if (document.querySelector(".card details[open]")) {
      updateVisibleStates();
      return;
    }
    const cards = [];
    for (const row of rows) {
      const card = element("article", "", "card");
      card.dataset.sensorId = row.sensor_id;
      card.append(element("h3", `${row.device_name} · ${row.name}`));
      const status = element("span", row.status, "state");
      status.dataset.state = row.status;
      card.append(status);
      card.append(
        element("p", row.value === null ? "—" : `${row.value} ADC`, "value"),
      );
      card.append(element("p", `${row.device_id} / ${row.channel}`));
      card.append(
        element(
          "p",
          `Configuração: aplicada ${row.config_version ?? "—"} / desejada ${row.desired_version}. Perdas reportadas: ${row.dropped_samples ?? "—"}.`,
        ),
      );
      card.append(
        element(
          "p",
          row.observed_at
            ? `Observação: ${new Date(row.observed_at).toLocaleString("pt-BR")}`
            : "Nenhuma leitura.",
          "observed",
        ),
      );
      const history = element("button", "Histórico (100)");
      history.onclick = () =>
        run(async () =>
          showHistory(
            row,
            await api(
              `/devices/${row.device_id}/sensors/${row.channel}/readings`,
            ),
          ),
        );
      card.append(history);
      const revisions = element("button", "Versões dos limites");
      revisions.onclick = () => run(() => showRevisions(row));
      card.append(revisions);
      const diagnostics = document.createElement("details");
      diagnostics.append(element("summary", "Saúde do dispositivo"));
      diagnostics.append(
        element(
          "p",
          row.last_contact_at
            ? `Último contato com a API: ${new Date(row.last_contact_at).toLocaleString("pt-BR")}`
            : "Contato ainda não registrado.",
        ),
      );
      const d = row.diagnostics;
      diagnostics.append(
        element(
          "p",
          d
            ? `Firmware ${d.firmware}; Wi-Fi ${d.rssi} dBm; memória livre ${Math.round(d.freeHeap / 1024)} KiB; fila ${d.queueDepth}; periódicas substituídas ${d.coalescedSamples}; motivo do boot ${d.resetReason}.`
            : "Firmware sem diagnóstico. Atualize a placa para acompanhar conexão, memória e fila.",
        ),
      );
      card.append(diagnostics);
      const limits = document.createElement("details");
      limits.append(element("summary", "Configurar limites ADC"));
      const form = document.createElement("form");
      for (const [name, label, value, min, max] of [
        ["high", "Ativar", row.high_threshold, 1, 4095],
        ["low", "Recuperar", row.low_threshold, 0, 4094],
        ["confirmMs", "Confirmar (ms)", row.confirm_ms, 100, 60000],
      ]) {
        const l = element("label", label),
          i = document.createElement("input");
        Object.assign(i, {
          type: "number",
          name,
          value,
          min,
          max,
          required: true,
        });
        l.append(i);
        form.append(l);
      }
      form.append(element("button", "Salvar limites"));
      form.onsubmit = (event) => {
        event.preventDefault();
        run(async () => {
          const body = Object.fromEntries(
            [...new FormData(form)].map(([k, v]) => [k, Number(v)]),
          );
          body.expectedVersion = row.desired_version;
          await api(
            `/devices/${row.device_id}/sensors/${row.channel}/config`,
            "PUT",
            body,
          );
          message("Configuração salva. Aguarde confirmação do dispositivo.");
          limits.open = false;
          await refresh();
        });
      };
      limits.append(form);
      card.append(limits);
      const rotate = element("button", "Trocar credencial");
      rotate.onclick = () =>
        run(async () => {
          if (
            !confirm(
              "A chave atual deixará de funcionar. Atualizar o firmware será necessário. Continuar?",
            )
          )
            return;
          showKey(
            (await api(`/devices/${row.device_id}/rotate-key`, "POST", {}))
              .apiKey,
          );
        });
      card.append(rotate);
      const enabled = element(
        "button",
        row.enabled ? "Desativar ingestão" : "Reativar ingestão",
      );
      enabled.onclick = () =>
        run(async () => {
          if (
            !confirm(
              "Isso altera somente o acesso à API; não desliga o alarme local. Continuar?",
            )
          )
            return;
          await api(`/devices/${row.device_id}/enabled`, "PUT", {
            enabled: !row.enabled,
          });
          await refresh();
        });
      card.append(enabled);
      cards.push(card);
    }
    $("sensors").replaceChildren(...cards);
    if (!rows.length)
      $("sensors").append(
        element("p", "Cadastre seu primeiro dispositivo abaixo."),
      );
    $("updated").textContent =
      `Atualizado ${new Date().toLocaleTimeString("pt-BR")}`;
  } finally {
    refreshing = false;
  }
}
bind("login", async () => {
  await api("/auth/login", "POST", formData("login"));
  signedIn = true;
  showAuth();
  $("login").reset();
  message("Sessão iniciada.");
  await refresh();
});
$("register").onclick = () =>
  run(async () => {
    if (!$("login").reportValidity()) return;
    await api("/auth/register", "POST", formData("login"));
    message("Conta criada. Agora entre.");
  });
$("logout").onclick = () =>
  run(async () => {
    await api("/auth/logout", "POST", {});
    signedIn = false;
    showAuth();
    message("Sessão encerrada.");
  });
bind("device", async () => {
  const result = await api("/devices", "POST", formData("device"));
  showKey(result.apiKey);
  $("device").reset();
  await refresh();
});
bind("channel", async () => {
  const data = formData("channel");
  await api(`/devices/${encodeURIComponent(data.deviceId)}/sensors`, "POST", {
    ...data,
    high: 700,
    low: 580,
    confirmMs: 5000,
  });
  message("Canal cadastrado. Mapeie o pino no firmware.");
  await refresh();
});
bind("telegram", async () => {
  const chatId = formData("telegram").chatId.trim() || null;
  await api("/me/telegram", "PUT", { chatId });
  message("Destino salvo. Confira a entrega em ensaio controlado.");
});
$("notifications").onclick = () => run(showNotifications);
$("audit").onclick = () =>
  run(async () => detail("Histórico de alterações", await api("/audit")));
$("refresh").onclick = () => run(refresh);
bind("evidence", async () => {
  const values = formData("evidence"),
    from = new Date(values.from),
    to = new Date(values.to);
  if (!Number.isFinite(+from) || !Number.isFinite(+to))
    throw new Error("Informe início e fim do ensaio.");
  const query = new URLSearchParams({
    from: from.toISOString(),
    to: to.toISOString(),
  });
  const bundle = await api(
    `/devices/${encodeURIComponent(values.deviceId)}/evidence?${query}`,
  );
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = `mqfire-evidence-${values.deviceId}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  message(
    `Pacote exportado: ${bundle.payload.rowCount} leituras. Confira o protocolo e pseudonimize o local antes de compartilhar.`,
  );
});
$("hide-key").onclick = () => {
  $("api-key").textContent = "";
  $("credential").hidden = true;
};
run(async () => {
  try {
    const me = await api("/me");
    signedIn = true;
    $("telegram").elements.chatId.value = me.telegram_chat_id || "";
    showAuth();
    await refresh();
  } catch {
    showAuth();
  }
});
setInterval(() => {
  if (signedIn && !document.hidden) run(refresh);
}, 10000);
setInterval(() => {
  if (signedIn) updateVisibleStates();
}, 1000);
