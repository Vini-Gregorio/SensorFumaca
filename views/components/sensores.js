function determinarStatus(ppm) {
    if (ppm < 50) {
        return {
            status: 'Estável',
            cor: 'green',
            texto: 'text-green-600',
            bg: 'bg-green-500',
            borda: 'border-green-500'
        };
    } else if (ppm < 100) {
        return {
            status: 'Atenção',
            cor: 'yellow',
            texto: 'text-yellow-600',
            bg: 'bg-yellow-500',
            borda: 'border-yellow-500'
        };
    } else {
        return {
            status: 'Alerta!',
            cor: 'red',
            texto: 'text-red-600',
            bg: 'bg-red-500',
            borda: 'border-red-500'
        };
    }
}
function toDate(v) {
    if (v instanceof Date) return v;
    if (typeof v === "number") return new Date(v);
    if (typeof v === "string") {
        const s = v.trim();
        if (s.includes("T") || s.endsWith("Z")) return new Date(s);
        const maybeIso = s.replace(" ", "T");
        const d = new Date(maybeIso);
        if (!isNaN(d.getTime())) return d;
        const d2 = new Date(s);
        if (!isNaN(d2.getTime())) return d2;
        return null;
    }
    return null;
}

function determinarStatusComTempo(ppm, ultimaLeitura) {
    // se não tiver timestamp válido, volta ao comportamento normal
    const ultima = toDate(ultimaLeitura);
    const cincoMinMs = 5 * 60 * 1000;

    if (ultima && !isNaN(ultima.getTime())) {
        const diff = Date.now() - ultima.getTime();
        if (diff > cincoMinMs) {
            // última leitura com mais de 5 minutos: considerar ESTÁVEL
            return {
                status: 'Estável',
                cor: 'green',
                texto: 'text-green-600',
                bg: 'bg-green-500',
                borda: 'border-green-500'
            };
        }
    }

    // se chegou aqui, última leitura é recente (<=5min) ou inválida -> usa regra normal
    return determinarStatus(ppm);
}


// Função para formatar o tempo desde a última leitura (ainda não testado)!!!

function formatarTempoUltimaLeitura(timestamp) {
    if (timestamp === null || timestamp === undefined || timestamp === "") return "-";

    // tenta criar Date de forma tolerante
   

    const agora = new Date();
    const ultima = toDate(timestamp);
    if (!ultima || isNaN(ultima.getTime())) return "-"; // timestamp inválido

    const diffMs = agora.getTime() - ultima.getTime();

    // se timestamp no futuro (aceita 5s de tolerância)
    if (diffMs < -5000) {
        return "em breve";
    }

    const seg = Math.floor(diffMs / 1000);
    if (seg < 10) return "agora";
    if (seg < 60) return `há ${seg} ${seg === 1 ? "segundo" : "segundos"}`;

    const min = Math.floor(seg / 60);
    if (min < 60) return `há ${min} ${min === 1 ? "minuto" : "minutos"}`;

    const horas = Math.floor(min / 60);
    if (horas < 24) return `há ${horas} ${horas === 1 ? "hora" : "horas"}`;

    const dias = Math.floor(horas / 24);
    if (dias < 7) return `há ${dias} ${dias === 1 ? "dia" : "dias"}`;

    const semanas = Math.floor(dias / 7);
    if (semanas < 5) return `há ${semanas} ${semanas === 1 ? "semana" : "semanas"}`;

    // fallback: exibe data completa em pt-BR para diferenças muito grandes
    return `em ${ultima.toLocaleDateString("pt-BR")} ${ultima.toLocaleTimeString("pt-BR")}`;
}



function criarCardSensor(sensor) {
    const valor = sensor.leituraPPM ?? sensor.valor ?? 0;
    const status = determinarStatusComTempo(valor, sensor.ultimaLeitura);
    const tempoFormatado = formatarTempoUltimaLeitura(sensor.ultimaLeitura);
    const nivel = sensor.nivel || 'Sem dados';
    const sensorNome = sensor.nome || sensor.codigo || 'Sensor';

    return `
        <a href="visualizacaoSensor.html?local_id=${sensor.id}" 
           class="block bg-white rounded-xl shadow-lg hover:shadow-xl transition duration-300 transform hover:-translate-y-1 border-t-4 ${status.borda}">
            <div class="p-6">
                <div class="flex justify-between items-start mb-4">
                    <h2 class="text-2xl font-semibold text-gray-800">${sensorNome}</h2>
                    <div class="flex items-center gap-2 ${status.texto} font-bold">
                        <div class="w-4 h-4 rounded-full ${status.bg}"></div>
                        <span>${status.status}</span>
                    </div>
                </div>
                
                <p class="text-sm text-gray-500 mb-4">Sensor: ${sensor.codigo}</p>

                <div class="pt-2 border-t border-gray-100 space-y-2">
                    <p class="text-gray-700">Última leitura: 
                        <span class="font-bold ${status.texto}">${valor != null ? `${valor} PPM` : '—'}</span>
                    </p>
                    <p class="text-gray-700">Nível: 
                        <span class="font-semibold ${nivel === 'vermelho' ? 'text-red-500' : nivel === 'amarelo' ? 'text-yellow-500' : 'text-green-500'}">${nivel}</span>
                    </p>
                    <p class="${valor > 100 ? 'text-red-500 font-semibold' : 'text-gray-500'} text-sm">
                        Captado: ${tempoFormatado}
                    </p>
                </div>
            </div>
        </a>
    `;
}

// exemplos de dados de sensores, enquanto não ha banco

   async function carregarSensores() {
    try {
        const resposta = await fetch("/api/web/sensores", { credentials: "include" }); // já leva o cookie da sessão
        if (!resposta.ok) {
            throw new Error("Erro ao buscar sensores (talvez não logado)");
        }

        const dados = await resposta.json();
        if (!dados || !dados.sucesso) {
            throw new Error(dados?.erro || "Erro ao buscar sensores");
        }

        const sensores = dados.dados || [];

        const grid = document.getElementById("sensores-grid");
          if (!grid) {
            // Página não tem grid de sensores — não faz nada
            return;
        }

        if (sensores.length === 0) {
            grid.innerHTML = `<p class="text-gray-500 text-lg">Nenhum sensor cadastrado ainda.</p>`;
            return;
        }

        grid.innerHTML = sensores.map(s => criarCardSensor({
            id: s.id,
            nome: s.nomeSala,
            codigo: s.identificador,
            leituraPPM: s.ultima_leitura,
            nivel: s.nivel,
            ultimaLeitura: s.data_hora
        })).join("");

    } catch (erro) {
        console.error("Erro ao carregar sensores:", erro);
    }
}

async function carregarHistorico() {
    const params = new URLSearchParams(window.location.search);
    const sensorId = params.get("local_id") || params.get("sensor") || params.get("id");

    if (!sensorId) {
        console.error("Nenhum sensor enviado na URL. URL:", window.location.search);
        return;
    }

    // seletores (confirme que estes ids existem no HTML)
    const tabelaBody = document.querySelector("#tbody") || document.querySelector("#historico-body");
    const tituloSala = document.querySelector("#titulo-sala") || document.querySelector("#titulo-sensor");
    const valorAtualDiv = document.querySelector("#valor-atual");
    const valorDatahora = document.querySelector("#valor-datahora") || null;

    if (!tabelaBody || !tituloSala || !valorAtualDiv) {
        console.error("Elementos da página não encontrados. IDs esperados: #tbody (ou #historico-body), #titulo-sala (ou #titulo-sensor), #valor-atual");
        return;
    }

    try {
        // buscar histórico
        const resposta = await fetch(`/api/web/alertas?sensorId=${encodeURIComponent(sensorId)}`, { credentials: "include" });

        if (!resposta.ok) {
            console.error("Erro na resposta da API (histórico):", resposta.status, await resposta.text());
            tabelaBody.innerHTML = `<tr><td colspan="4" class="py-4 text-red-500 text-center">Erro ao buscar histórico (${resposta.status})</td></tr>`;
            return;
        }

        const payload = await resposta.json();
        const alertas = payload?.dados || [];

        // se não tem alertas, busca nome do sensor e atualiza título, mostra mensagem amigável
        if (!Array.isArray(alertas) || alertas.length === 0) {
            // tenta buscar meta do sensor
            try {
                const r2 = await fetch(`/api/web/sensores/${encodeURIComponent(sensorId)}`, { credentials: "include" });
                if (r2.ok) {
                    const sensorInfo = await r2.json();
                    const salaNome = sensorInfo?.dados?.nomeSala || sensorInfo?.dados?.identificador || sensorId;
                    tituloSala.innerHTML = `Status do<br>Sensor ${sensorId} (${salaNome})`;
                } else {
                    tituloSala.innerHTML = `Status do<br>Sensor ${sensorId}`;
                }
            } catch (errSensor) {
                tituloSala.innerHTML = `Status do<br>Sensor ${sensorId}`;
                console.warn("Não foi possível buscar info do sensor:", errSensor);
            }

            tabelaBody.innerHTML = `<tr><td colspan="4" class="py-4 text-gray-500 text-center">Nenhum alerta registrado</td></tr>`;
            valorAtualDiv.textContent = "-";
            if (valorDatahora) valorDatahora.textContent = "-";
            return;
        }

        // existem alertas -> preencher normalmente
        const r2 = await fetch(`/api/web/sensores/${encodeURIComponent(sensorId)}`, { credentials: "include" });
        if (r2.ok) {
            const sensorInfo = await r2.json();
            const salaNome = sensorInfo?.dados?.nomeSala || sensorInfo?.dados?.identificador || sensorId;
            tituloSala.innerHTML = `Status do<br>Sensor ${sensorId} (${salaNome})`;
        } else {
            tituloSala.innerHTML = `Status do<br>Sensor ${sensorId}`;
        }

        valorAtualDiv.textContent = alertas[0].valor ?? "-";
        if (valorDatahora) valorDatahora.textContent = alertas[0].data_hora ? new Date(alertas[0].data_hora).toLocaleString("pt-BR") : "-";

        tabelaBody.innerHTML = alertas.map(alerta => `
            <tr class="text-gray-700 text-sm md:text-base">
                <td class="py-2 pr-4">${alerta.id ?? "-"}</td>
                <td class="py-2 px-4 ${alerta.nivel === 'vermelho' ? 'text-red-500' : alerta.nivel === 'amarelo' ? 'text-yellow-500' : 'text-green-500'} font-medium">
                    ${alerta.nivel ?? "—"}
                </td>
                <td class="py-2 pr-4">${alerta.valor ?? "-"}</td>
                <td class="py-2 pl-4">${alerta.data_hora ? new Date(alerta.data_hora).toLocaleString("pt-BR") : "-"}</td>
            </tr>
        `).join("");

    } catch (err) {
        console.error("Erro ao carregar histórico:", err);
        tabelaBody.innerHTML = `<tr><td colspan="4" class="py-4 text-red-500 text-center">Erro ao carregar histórico</td></tr>`;
    }
}



// Chama a função quando o script for carregado
carregarHistorico();

document.addEventListener('DOMContentLoaded', () => {
  if (document.getElementById("sensores-grid")) {
    carregarSensores();
    setInterval(carregarSensores, 30001);
  }
});
