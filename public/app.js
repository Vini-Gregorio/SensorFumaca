const $ = (id) => document.getElementById(id);
let signedIn = false,
  refreshing = false;
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
    $("sensors").replaceChildren();
    $("api-key").textContent = "";
    $("credential").hidden = true;
    $("detail-data").textContent = "";
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
}
async function refresh() {
  if (refreshing) return;
  refreshing = true;
  try {
    const rows = await api("/devices");
    const cards = [];
    for (const row of rows) {
      const card = element("article", "", "card");
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
          `Configuração: aplicada ${row.config_version ?? "—"} / desejada ${row.desired_version}. Perdas na fila: ${row.dropped_samples ?? "—"}.`,
        ),
      );
      card.append(
        element(
          "p",
          row.observed_at
            ? `Observação: ${new Date(row.observed_at).toLocaleString("pt-BR")}`
            : "Nenhuma leitura.",
        ),
      );
      const history = element("button", "Histórico (100)");
      history.onclick = () =>
        run(async () =>
          detail(
            `${row.device_id} / ${row.channel}`,
            await api(
              `/devices/${row.device_id}/sensors/${row.channel}/readings`,
            ),
          ),
        );
      card.append(history);
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
          await api(
            `/devices/${row.device_id}/sensors/${row.channel}/config`,
            "PUT",
            body,
          );
          message("Configuração salva. Aguarde confirmação do dispositivo.");
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
$("notifications").onclick = () =>
  run(async () =>
    detail("Entregas de notificações", await api("/notifications")),
  );
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
  if (
    signedIn &&
    !document.hidden &&
    !document.querySelector(".card details[open]")
  )
    run(refresh);
}, 10000);
