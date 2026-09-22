# Plano de excelência e alinhamento com o TG

O objetivo é ligar requisito → implementação → teste → evidência → afirmação no texto. Nenhum item abaixo marcado pendente pode ser descrito no relatório como resultado obtido.

As sugestões de evolução, critérios de aceite e recorte da IA estão em [EVOLUTION.md](EVOLUTION.md). O painel já permite exportar evidências com configurações versionadas; o pesquisador ainda precisa registrar protocolo, montagem e rótulos independentes.

## Marcos e critérios de aceite

| Prioridade / marco | Entrega | Evidência exigida | Estado inicial desta refatoração |
|---|---|---|---|
| P0 — resposta aos vazamentos | Revogação de credenciais; plano de histórico; revisão de acesso | Registro privado do responsável, datas e serviços, sem valores dos segredos | Remoção na árvore feita; revogação/histórico pendentes |
| P0 — base reproduzível | Checkout limpo, banco novo, conta/dispositivo, simulador, firmware compilado | Commit, versões, logs CI e roteiro executado por outra pessoa | Implementação e testes adicionados; ver VALIDATION |
| P0 — ponta a ponta em bancada | ADC → saída local → persistência → painel → Telegram | Tempos, logs pseudonimizados, versão e ambiente; ensaio com rede disponível/indisponível | Pendente em hardware |
| P1 — caracterização do MQ-2 | Baseline, variabilidade, condicionamento e limiares justificados | Planilha de dados brutos, método, repetições, ambiente e limitações | Pendente; não declarar PPM/calibração metrológica |
| P1 — múltiplos canais | Dois dispositivos e ao menos dois canais em uma placa | IDs isolados, limites independentes, consumo, teste de falha de um canal | Contrato/firmware preparados; montagem/ensaio pendentes |
| P1 — qualidade e operação | Segurança, carga, backup/restore, retenção e falhas | Relatórios reproduzíveis, limites explicitados e issues de correção | Versões, auditoria, evidências e recuperação de notificações implementadas; operação/carga pendentes |
| P1 — texto e defesa | Arquitetura, resultados e limitações coerentes com evidências | Matriz de rastreabilidade, tabelas de resultados, revisão do orientador | Pendente de atualização do documento do TG |
| P2 — IA consultiva | Dataset autorizado, baseline e comparação offline | Separação temporal por sessão, métricas, model card, código/seed | Planejamento; nenhum modelo implementado |
| P2 — expansão | Outros sensores, canais de alerta, OTA e app nativo | ADR por funcionalidade e teste de regressão | Futuro; fora do mínimo defendível atual |

## Matriz mínima de ensaios

| Categoria | Casos | Critério / cuidado |
|---|---|---|
| Funcional local | Igualdade nos limiares, histerese, confirmação interrompida, botão, reboot, rollover | Saída conforme máquina de estados; capturar versão/config |
| Integração | Falha DB, retry do mesmo evento, chave rotacionada, dois proprietários, edição concorrente, restauração, upgrade | Nenhum ACK antes do commit; sem duplicação; isolamento, versões e atomicidade verificáveis |
| Rede/energia | Wi-Fi ausente, DNS/HTTPS lento, servidor fora, reinício, fila cheia | Alarme local continua; perdas e limites documentados |
| Notificação | Chat autorizado, token inválido, timeout, 429, duplicidade por crash | Persistência de estado; não confundir aceite Telegram com leitura humana |
| Carga | Começar com 2/10/50 dispositivos simulados, aumentar somente em ambiente autorizado | Medir p50/p95/p99, erros, fila e memória; definir metas antes do ensaio |
| Segurança | Acesso cruzado, origem externa, entrada malformada, SQLi como dado, XSS em nome, brute force | Verificar efeito real, não apenas resposta diferente de 500 |
| Campo | Protocolo aprovado pelo orientador/local, repetição e contexto documentados | Não usar chama/gás improvisado como protocolo; acompanhamento e segurança |
| Usabilidade | Instalação por colega, celular, teclado, credencial/limite, compreensão de offline | Registrar pontos de dúvida e correções no README |

Teste de unidade não mede taxa de detecção. Teste doméstico relatado anteriormente é contexto histórico, não comprovação de ensaio na AAP ou de precisão. Não há critério numérico de latência/falsos positivos aprovado neste código: acordá-lo antes de coletar resultados evita escolher a meta depois de observar os dados.

## Registro de evidência (modelo)

- ID do ensaio; data/hora; responsável; autorização do local.
- Hipótese/requisito e critério de aprovação **definidos previamente**.
- Commit do backend e firmware; versões de Node/MariaDB/PlatformIO; dispositivo/canal pseudonimizado; configVersion.
- Ambiente, montagem, procedimento seguro aprovado, duração e número de repetições.
- Leituras brutas; latência local/API/dashboard/Telegram separadamente; dados ausentes e perdas.
- Resultado, falhas, limitações, link para dados autorizados; mudança exigida no relatório.

No painel, exporte JSON por dispositivo e intervalo de até 24 h (máximo 10.000 leituras); guarde o original privado e seu hash. Complete com anotações do procedimento e rótulos independentes. `missingConfigVersions` indica ausência de histórico de limites; não preencher por memória como se fosse snapshot comprovado. Diagnósticos do firmware são do primeiro envio e podem ocorrer depois da captura da amostra.

Não adicionar credenciais, emails, chat IDs ou dados pessoais reais aos exemplos públicos.

## Próximas três ações

1. **P0 — revogar segredos e validar a base em ambiente limpo.** Confirmar rotação, CI, instalação por outra pessoa e restauração de backup. Isso elimina dependência de configurações locais implícitas e reduz risco de exposição.
2. **P0 — ensaiar ponta a ponta e operação offline com evidência.** Usar protocolo seguro aprovado, dois dispositivos/canais quando disponíveis, medir tempos e perdas. Isso transforma o código em resultados defendíveis.
3. **P1 — alinhar o texto do TG aos resultados e fechar escopo.** Decidir app nativo versus web responsivo, licença com autores e recorte da IA. Isso evita prometer no documento o que ainda é roadmap.

Datas de defesa/entrega não foram estabelecidas aqui. O cronograma deve ser preenchido com o orientador; não estimar conclusão acadêmica apenas pela existência de código.
