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
    const ultima = toDate(ultimaLeitura);
    const cincoMinMs = 5 * 60 * 1000;

    if (ultima && !isNaN(ultima.getTime())) {
        const diff = Date.now() - ultima.getTime();
        if (diff > cincoMinMs) {
            return {
                status: 'Estável',
                cor: 'green',
                texto: 'text-green-600',
                bg: 'bg-green-500',
                borda: 'border-green-500'
            };
        }
    }

    return determinarStatus(ppm);
}

function formatarTempoUltimaLeitura(timestamp) {
    if (timestamp === null || timestamp === undefined || timestamp === "") return "-";

    const agora = new Date();
    const ultima = toDate(timestamp);
    if (!ultima || isNaN(ultima.getTime())) return "-";

    const diffMs = agora.getTime() - ultima.getTime();

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

    return `em ${ultima.toLocaleDateString("pt-BR")} ${ultima.toLocaleTimeString("pt-BR")}`;
}

function criarCardSensor(sensor) {
    const status = determinarStatusComTempo(sensor.leituraPPM, sensor.ultimaLeitura);
    const tempoFormatado = formatarTempoUltimaLeitura(sensor.ultimaLeitura);
    
    // Aceita tanto 'id' quanto 'local_id'
    return `
        <a href="visualizacaoSensor.html?id=${sensor.id}" 
           class="block bg-white rounded-xl shadow-lg hover:shadow-xl transition duration-300 transform hover:-translate-y-1 border-t-4 ${status.borda}">
            <div class="p-6">
                <div class="flex justify-between items-start mb-4">
                    <h2 class="text-2xl font-semibold text-gray-800">${sensor.nome}</h2>
                    <div class="flex items-center gap-2 ${status.texto} font-bold">
                        <div class="w-4 h-4 rounded-full ${status.bg}"></div>
                        <span>${status.status}</span>
                    </div>
                </div>
                
                <p class="text-sm text-gray-500 mb-4">Sensor: ${sensor.codigo}</p>

                <div class="pt-2 border-t border-gray-100">
                    <p class="text-gray-700">Último alerta: 
                        <span class="font-bold ${status.texto}">${sensor.leituraPPM} PPM</span>
                    </p>
                    <p class="${(sensor.leituraPPM ?? 0) > 100 ? 'text-red-500 font-semibold' : 'text-gray-500'} text-sm">
                        Captado: ${tempoFormatado}
                    </p>
                </div>
            </div>
        </a>
    `;
}

async function carregarSensores() {
    try {
        const resposta = await fetch("/api/web/sensores", { credentials: "include" });

        if (!resposta.ok) {
            throw new Error("Erro ao buscar sensores (status: " + resposta.status + ")");
        }

        const dados = await resposta.json();
        const listaSensores = Array.isArray(dados) ? dados : (dados.sensores || dados.dados || []);

        const grid = document.getElementById("sensores-grid");
        if (!grid) return;

        if (!Array.isArray(listaSensores) || listaSensores.length === 0) {
            grid.innerHTML = `<p class="text-gray-500 text-lg">Nenhum sensor cadastrado ainda.</p>`;
            return;
        }

        grid.innerHTML = listaSensores.map(s => criarCardSensor({
            id: s.identificador || s.id,
            nome: s.nomeSala || s.nome_local || "Sensor sem nome",
            codigo: s.identificador || s.id,
            leituraPPM: s.valor ?? s.ultima_leitura ?? 0,
            ultimaLeitura: s.data_hora
        })).join("");

    } catch (erro) {
        console.error("Erro ao carregar sensores:", erro);
    }
}

async function carregarHistorico() {
    const tabelaBody = document.querySelector("#tbody") || document.querySelector("#historico-body");
    const tituloSala = document.querySelector("#titulo-sala") || document.querySelector("#titulo-sensor");
    const valorAtualDiv = document.querySelector("#valor-atual");
    const valorDatahora = document.querySelector("#valor-datahora");
    const statusDot = document.querySelector("#status-dot");
    const statusText = document.querySelector("#status-text");

    // Só executa se estiver na tela visualizacaoSensor.html
    if (!tabelaBody || !tituloSala || !valorAtualDiv) return;

    const urlParams = new URLSearchParams(window.location.search);
    // Aceita 'id' ou 'local_id' na URL para evitar falhar caso venha como ?local_id= ou ?id=
    const sensorId = urlParams.get('id') || urlParams.get('local_id');

    if (!sensorId) {
        console.error("Nenhum ID de sensor enviado na URL.");
        tabelaBody.innerHTML = `<tr><td colspan="4" class="py-4 text-red-500 text-center">Sensor não especificado na URL.</td></tr>`;
        return;
    }

    try {
        // 1. Busca os dados do sensor para exibir o nome da sala no título
        try {
            const r2 = await fetch(`/sensores/${encodeURIComponent(sensorId)}`, { credentials: "include" });
            if (r2.ok) {
                const sensorInfo = await r2.json();
                const salaNome = sensorInfo.nomeSala || sensorInfo.nome_local || sensorInfo.identificador || sensorId;
                tituloSala.innerHTML = `Status da<br>${salaNome}`;
            } else {
                tituloSala.innerHTML = `Status do<br>Sensor ${sensorId}`;
            }
        } catch (errSensor) {
            tituloSala.innerHTML = `Status do<br>Sensor ${sensorId}`;
        }

        // 2. Busca o histórico de alertas do sensor
        const resposta = await fetch(`/alertas?sensorId=${encodeURIComponent(sensorId)}`, { credentials: "include" });

        if (!resposta.ok) {
            tabelaBody.innerHTML = `<tr><td colspan="4" class="py-4 text-red-500 text-center">Erro ao buscar histórico (${resposta.status})</td></tr>`;
            return;
        }

        const dados = await resposta.json();

        if (!Array.isArray(dados) || dados.length === 0) {
            tabelaBody.innerHTML = `<tr><td colspan="4" class="py-4 text-gray-500 text-center">Nenhum alerta registrado</td></tr>`;
            valorAtualDiv.textContent = "-";
            if (valorDatahora) valorDatahora.textContent = "-";
            return;
        }

        // 3. Atualiza o valor atual do alerta mais recente
        const ultimoAlerta = dados[0];
        const valorPPM = ultimoAlerta.valor ?? 0;

        valorAtualDiv.textContent = `${valorPPM} PPM`;
        if (valorDatahora) {
            valorDatahora.textContent = ultimoAlerta.data_hora 
                ? new Date(ultimoAlerta.data_hora).toLocaleString("pt-BR") 
                : "-";
        }

        // 4. Atualiza a bolinha de status e o texto (Estável/Atenção/Alerta)
        if (statusDot && statusText) {
            const statusObj = determinarStatusComTempo(valorPPM, ultimoAlerta.data_hora);
            statusText.textContent = statusObj.status;
            statusDot.className = `w-6 h-6 rounded-full ${statusObj.bg}`;
            valorAtualDiv.className = `text-7xl font-bold ${statusObj.texto}`;
        }

        // 5. Preenche a tabela com o histórico
        tabelaBody.innerHTML = dados.map(alerta => `
            <tr class="text-gray-700 text-sm md:text-base">
                <td class="py-2 pr-4">${alerta.id ?? "-"}</td>
                <td class="py-2 px-4 ${alerta.nivel === 'vermelho' ? 'text-red-500 font-bold' : alerta.nivel === 'amarelo' ? 'text-yellow-500 font-bold' : 'text-green-500 font-bold'}">
                    ${alerta.nivel ?? "—"}
                </td>
                <td class="py-2 pr-4">${alerta.valor ?? "-"} PPM</td>
                <td class="py-2 pl-4">${alerta.data_hora ? new Date(alerta.data_hora).toLocaleString("pt-BR") : "-"}</td>
            </tr>
        `).join("");

    } catch (err) {
        console.error("Erro ao carregar histórico:", err);
        tabelaBody.innerHTML = `<tr><td colspan="4" class="py-4 text-red-500 text-center">Erro ao carregar histórico</td></tr>`;
    }
}

// Inicializa automaticamente ao carregar a página
document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById("sensores-grid")) {
        carregarSensores();
        setInterval(carregarSensores, 30000);
    }
    
    if (document.querySelector("#tbody")) {
        carregarHistorico();
    }
});