// Fluxo didático do TG: planejar → iniciar → observar → concluir → exportar.
export function mountExperiments({ api, run, message }) {
  const $ = (id) => document.getElementById(id);
  let selected = null,
    generation = 0;
  const labels = {
    planned: "Planejado",
    running: "Em andamento",
    completed: "Concluído",
    met: "Critério atendido",
    not_met: "Critério não atendido",
    inconclusive: "Inconclusivo",
  };
  const kindLabels = {
    observation: "Observação",
    reference: "Referência independente",
    network: "Rede",
    hardware: "Hardware",
  };
  const el = (tag, value) => {
    const n = document.createElement(tag);
    n.textContent = value;
    return n;
  };
  const form = (id) => Object.fromEntries(new FormData($(id)));
  const bind = (id, fn) =>
    $(id).addEventListener("submit", (event) => {
      event.preventDefault();
      run(fn);
    });

  async function list() {
    const current = generation;
    const rows = await api("/experiments");
    if (current !== generation) return;
    const items = rows.map((row) => {
      const item = el("article", "");
      item.className = "experiment-card";
      item.append(
        el("h3", `#${row.id} · ${row.title}`),
        el(
          "p",
          `${labels[row.status]}${row.outcome ? " · " + labels[row.outcome] : ""}`,
        ),
      );
      const open = el("button", "Abrir ensaio");
      open.onclick = () => run(() => show(row.id));
      item.append(open);
      return item;
    });
    $("experiment-list").replaceChildren(
      ...(items.length
        ? items
        : [el("p", "Nenhum ensaio registrado. Planeje o primeiro abaixo.")]),
    );
  }
  async function show(id) {
    const current = generation;
    const record = await api(`/experiments/${id}`);
    if (current !== generation) return;
    selected = record;
    const e = record.experiment;
    $("experiment-detail").hidden = false;
    $("experiment-title").textContent = `#${e.id} · ${e.title}`;
    $("experiment-status").textContent =
      `${labels[e.status]}${e.outcome ? " · " + labels[e.outcome] : ""}`;
    const fields = [
      ["Objetivo", e.objective],
      ["Protocolo", e.protocol],
      ["Critério de aceite", e.acceptance_criteria],
      ["Ambiente", e.environment],
      ["Montagem", e.hardware],
      ["Commit declarado", e.software_ref],
      [
        "Dispositivos",
        record.devices
          .map(
            (d) =>
              `${d.device_id} (limites iniciais: ${d.configuration_at_start?.version ?? "a capturar"})`,
          )
          .join(", "),
      ],
      [
        "Início",
        e.started_at
          ? new Date(e.started_at).toLocaleString("pt-BR")
          : "Ainda não iniciado",
      ],
      ["Fim", e.ended_at ? new Date(e.ended_at).toLocaleString("pt-BR") : "—"],
      ["Conclusão", e.conclusion || "Ainda não registrada"],
    ];
    $("experiment-description").replaceChildren(
      ...fields.map(([label, value]) => {
        const p = el("p", "");
        p.append(el("strong", `${label}: `), document.createTextNode(value));
        return p;
      }),
    );
    $("experiment-start").hidden = e.status !== "planned";
    $("experiment-note").hidden = e.status === "planned";
    $("experiment-finish").hidden = e.status !== "running";
    $("experiment-export").hidden = e.status === "planned";
    $("experiment-note").reset();
    $("experiment-note").elements.observedAt.required =
      e.status === "completed";
    $("experiment-finish").reset();
    $("experiment-export").reset();
    const entries = record.notes.map((n) => {
      const item = el("li", "");
      item.append(
        el(
          "strong",
          `${kindLabels[n.kind]} · ${new Date(n.observed_at).toLocaleString("pt-BR")}: `,
        ),
        document.createTextNode(n.note),
      );
      item.append(
        el(
          "p",
          `Anotação registrada em ${new Date(n.recorded_at).toLocaleString("pt-BR")}`,
        ),
      );
      return item;
    });
    $("experiment-notes").replaceChildren(...entries);
  }
  $("experiments-refresh").onclick = () => run(list);
  bind("experiment-create", async () => {
    const data = form("experiment-create");
    data.deviceIds = data.deviceIds
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const current = generation;
    const { id } = await api("/experiments", "POST", data);
    if (current !== generation) return;
    $("experiment-create").reset();
    await list();
    await show(id);
    message(
      "Plano registrado. Confira dispositivos e limites antes de iniciar o ensaio.",
    );
  });
  $("experiment-start").onclick = () =>
    run(async () => {
      if (!selected) return;
      const id = selected.experiment.id;
      await api(`/experiments/${id}/start`, "POST", {});
      await list();
      await show(id);
      message(
        "Ensaio iniciado. Confira se os dispositivos aplicaram os limites antes de interpretar resultados.",
      );
    });
  bind("experiment-note", async () => {
    if (!selected) return;
    const id = selected.experiment.id,
      data = form("experiment-note");
    if (data.observedAt)
      data.observedAt = new Date(data.observedAt).toISOString();
    else delete data.observedAt;
    await api(`/experiments/${id}/notes`, "POST", data);
    await show(id);
    message(
      "Observação registrada. O estado automático do sensor foi preservado.",
    );
  });
  bind("experiment-finish", async () => {
    if (!selected) return;
    const id = selected.experiment.id;
    if (
      !confirm(
        "Concluir este ensaio com o resultado informado? Protocolo e conclusão ficam preservados.",
      )
    )
      return;
    await api(`/experiments/${id}/finish`, "POST", form("experiment-finish"));
    await list();
    await show(id);
    message("Ensaio concluído. Exporte o pacote e confira as evidências.");
  });
  bind("experiment-export", async () => {
    if (!selected) return;
    const id = selected.experiment.id,
      data = form("experiment-export");
    let query = "";
    if (data.from || data.to) {
      if (!data.from || !data.to)
        throw new Error("Informe início e fim para exportar parte do ensaio.");
      query =
        "?" +
        new URLSearchParams({
          from: new Date(data.from).toISOString(),
          to: new Date(data.to).toISOString(),
        });
    }
    const bundle = await api(`/experiments/${id}/evidence${query}`);
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" }),
    );
    const a = el("a", "");
    a.href = url;
    a.download = `mqfire-experiment-${id}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    message(
      `Ensaio exportado com ${bundle.payload.rowCount} leituras. Revise textos e identificadores antes de compartilhar.`,
    );
  });
  return {
    reset() {
      generation++;
      selected = null;
      $("experiment-list").replaceChildren();
      $("experiment-notes").replaceChildren();
      $("experiment-description").replaceChildren();
      $("experiment-detail").hidden = true;
      for (const id of [
        "experiment-create",
        "experiment-note",
        "experiment-finish",
        "experiment-export",
      ])
        $(id).reset();
    },
  };
}
