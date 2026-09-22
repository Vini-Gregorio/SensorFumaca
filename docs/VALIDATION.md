# Evidência da refatoração — 22/09/2026

Este registro descreve verificações executadas, não certificação nem resultado de ensaio físico. A CI do [PR #7](https://github.com/Vini-Gregorio/SensorFumaca/pull/7) é a referência para o commit efetivamente revisado. [Baseline de rastreabilidade aprovada, commit 16c188b](https://github.com/Vini-Gregorio/SensorFumaca/actions/runs/35676603579). O caderno experimental exige seus próprios checks no PR; não herda aprovação de um commit anterior.

| Verificação | Resultado observado nesta execução |
|---|---|
| `npm test` | 26 testes aprovados localmente, 0 falhas, 0 pulados; inclui contrato experimental, proteção das novas rotas e conclusão explícita |
| `npm run test:firmware` | Núcleo C++11 compilado com `-Wall -Wextra -Werror`; assertions de alarme, debounce, rollover, canais independentes, prioridade, substituição e transbordamento da fila aprovadas |
| `npm run check:secrets` | Árvore atual aprovada pelo verificador básico; não verifica histórico |
| `npm audit --omit=dev` | 0 vulnerabilidades conhecidas após atualização do mysql2/lockfile; resultado pontual do registro npm |
| `git diff --check` | Sem erros de whitespace na verificação local |
| `npm run test:integration` local | Não executado com banco: Docker/MariaDB não disponíveis; tentativa de instalação bloqueada por permissões. Sem flag, teste explicitamente pulado |
| Integração MariaDB na CI | Baseline aprovada; gate ampliado com upgrade até 003, início atômico de ensaios, captura de limites, observações retrospectivas, múltiplos dispositivos, isolamento e exportação conjunta. Resultado do commit atual nos checks do PR |
| Smoke Chromium | Baseline aprovada; nesta evolução, inclui planejar/iniciar/anotar/concluir/exportar ensaio, além de autenticação/XSS/mobile/desktop e limpeza dos dados ao sair. Resultado do commit atual nos checks do PR |
| Compilação ESP32 PlatformIO | Baseline aprovada com toolchain C++11; a fila/diagnóstico novos são recompilados na CI. Sem credenciais reais e sem gravação em hardware |
| Carga k6 / hardware / Telegram real / campo | Não executados |
| Revogação de segredos externos / limpeza do histórico | Não executadas; requerem responsável e coordenação |
| Desvinculação do fork / novo repositório | Não executadas; roteiro e exportação sem histórico preparados, preservando créditos anteriores |

## Cobertura e limites

- Testes HTTP usam dublê do repositório SQL: validam contrato, autenticação, origem, limites e respostas de falha, não transações reais.
- Integração separada exercita MariaDB real. O teste de upgrade recusa banco não vazio e confirma snapshot dos limites existentes sem fabricar versões passadas. Uma falha injetada depois de editar limites verifica rollback de valores e versão; uma resposta de worker com reserva antiga deve ser ignorada.
- Smoke do navegador usa banco simulado e exercita UI/HTTP real. Não equivale a ponta a ponta com hardware/DB.
- Teste embarcado nativo verifica lógica pura e a política de fila; compilação PlatformIO verifica toolchain/headers. Nenhum deles comprova agendamento das tarefas, pinagem, temporização física, estabilidade elétrica ou comportamento do MQ-2.
- Auditoria de dependências é uma fotografia; manter atualização e reexecutar antes do deploy.
- Não houve acesso ao ambiente Render, mudança no banco de produção, atualização do documento do Drive nem criação de repositório comercial.

Antes de integrar/deployar: revisar código, executar CI, reproduzir instalação limpa e ensaio físico com protocolo aprovado. Usar docs/TG-ROADMAP.md para registrar evidências e resolver as lacunas.
