# Arquitetura e decisões — V2

## Caminhos independentes

1. **Local:** ADC → histerese/confirmação → relé/LED. Tarefa principal a cada 100 ms, botão com debounce e watchdog. `Alarm` é C++ sem dependência de rede.
2. **Observabilidade:** amostra/estado → fila RAM → tarefa HTTP → autenticação por dispositivo → transação MariaDB → dashboard/outbox.
3. **Configuração:** edição autenticada → versão incrementada no banco → consulta pelo ESP32 → validação de todos os canais → cache NVS → aplicação no loop → versão reportada. Um alarme ativo não é apagado só por aplicar configuração; novas leituras determinam recuperação.

O servidor **não** troca a classificação do firmware por um limiar paralelo. Registra estado local declarado, valores, versão, idade, tempo de recebimento e perdas. O estado não é prova de ausência de fumaça: depende do sensor/provisionamento/ensaio. Mensagem Telegram nunca é condição para acionar a saída física.

## Modelo de dados

`users` possuem `devices`; cada dispositivo possui `sensors` (canais). `events` representam um pacote autenticado; `readings` guardam a leitura de cada canal. `notification_outbox` referencia o evento; `sessions` referencia a conta. Separar dispositivo de canal evita tratar todos os MQ-2 como o mesmo identificador global.

- Canal inicial: `mq2`, tipo `MQ2`, unidade `adc_raw`. Máximo: 8 canais; layout físico exige validação por placa.
- Telemetria: chave única `(device_id, boot_id, sequence)`; mesmo ID e conteúdo diferente é conflito.
- `ageMs` não integra o hash: retransmitir o mesmo evento mais tarde não muda sua identidade.
- Hora de observação é estimada pelo servidor menos a idade informada. Não é relógio metrológico sincronizado. Rede/relógio introduzem incerteza; registrar isso em ensaios de latência.
- Consultas da última leitura ordenam por observação, não pela chegada. Amostra antiga não deve tornar o sensor aparentemente saudável. Após 90 s sem observação recente: `OFFLINE`.
- São armazenadas leituras normais também, permitindo baseline e futura avaliação estatística.

## Decisões (ADRs resumidos)

| Decisão | Razão | Alternativa / limite |
|---|---|---|
| Monólito Express modular | Facilita ensino, inspeção e reprodução | Separar worker/serviços só com necessidade medida |
| MariaDB 11.4 como referência testada | Continuidade com o TG e transações SQL | MySQL não é declarado validado só por usar mysql2; testar antes |
| Sessões opacas persistidas | Revogação simples e nenhum segredo de assinatura padrão | Cliente nativo futuro precisa fluxo de autenticação próprio revisado |
| HTTP API versionada `/api/v1` | Um contrato para todos os clientes | Rotas legadas removidas; atualização coordenada obrigatória |
| Polling 10 s no dashboard | Simples, observável e sem nova infraestrutura | Não anunciar WebSocket ou tempo real instantâneo |
| Outbox na mesma transação | Não perder intenção de notificação entre persistência e envio | Entrega pelo menos uma vez: possível duplicidade após falha |
| Cache NVS para limites | Operar sem internet com última configuração | Sem OTA; reenquadrar credenciais/config ao reutilizar placa |
| IA consultiva, futura | Criar dados e comparação antes de automatizar | Nunca silenciar/substituir o alarme determinístico |

## Módulo de IA: contrato de pesquisa proposto (não implementado)

Entrada: janelas de leituras com tipo/unidade, versão de hardware/firmware, contexto do ensaio, eventos rotulados e indicação de dados faltantes. Saída: `modelVersion`, janela analisada, `score`, incerteza e recomendação **consultiva**. Armazenar em tabela separada de resultados experimentais, sem atualizar `readings.state` nem a configuração de alarme.

Etapas: criar dataset autorizado e pseudonimizado; estabelecer baseline por regras; separar treino/teste por sessão/dispositivo (evitar vazamento temporal); comparar detecção de anomalias simples; medir falsos positivos/negativos, latência e custo; documentar model card e reprodutibilidade. Só integrar inferência online depois de ganho medido sobre baseline. Modelos e dados comerciais ficam no repositório privado, sem segredos no público.

## Escalabilidade planejada

Adicionar tipos de sensor requer schema de unidade/faixa, adaptador de leitura, validação, visualização e testes; não basta aceitar números arbitrários. Para operação maior: retenção/particionamento medidos, pool dimensionado, rate limiter compartilhado, observabilidade, backup/restore e teste de worker concorrente. MQTT, OTA assinada, secure boot e flash encryption são decisões futuras, não promessas de suporte atual.
