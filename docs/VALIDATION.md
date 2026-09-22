# Evidência da refatoração — 22/09/2026

Este registro descreve verificações executadas, não certificação nem resultado de ensaio físico. A CI do PR é a referência para o commit efetivamente revisado.

| Verificação | Resultado observado nesta execução |
|---|---|
| `npm test` | 16 testes aprovados, 0 falhas, 0 pulados |
| `npm run test:firmware` | Núcleo C++ compilado com `-Wall -Wextra -Werror`; assertions de histerese, confirmação, falha, configuração, debounce e rollover aprovadas |
| `npm run check:secrets` | Árvore atual aprovada pelo verificador básico; não verifica histórico |
| `npm audit --omit=dev` | 0 vulnerabilidades conhecidas após atualização do mysql2/lockfile; resultado pontual do registro npm |
| `git diff --check` | Sem erros de whitespace na verificação local |
| `npm run test:integration` local | Não executado com banco: Docker/MariaDB não disponíveis; tentativa de instalação bloqueada por permissões. Sem flag, teste explicitamente pulado |
| Integração MariaDB na CI | Workflow configurado com banco dedicado, migrações e testes; verificar execução do PR |
| Smoke Chromium | Em verificação; não declarar aprovado até resultado da execução |
| Compilação ESP32 PlatformIO | Em verificação; não declarar aprovada até resultado da execução |
| Carga k6 / hardware / Telegram real / campo | Não executados |
| Revogação de segredos externos / limpeza do histórico | Não executadas; requerem responsável e coordenação |

## Cobertura e limites

- Testes HTTP usam dublê do repositório SQL: validam contrato, autenticação, origem, limites e respostas de falha, não transações reais.
- Teste de integração separado exercita MariaDB real, incluindo acesso cruzado, idempotência concorrente, ausência de inserção parcial, configuração e outbox.
- Smoke do navegador usa banco simulado e exercita UI/HTTP real. Não equivale a ponta a ponta com hardware/DB.
- Teste embarcado nativo verifica lógica pura; compilação PlatformIO verifica toolchain/headers. Nenhum deles comprova pinagem, temporização física, estabilidade elétrica ou comportamento do MQ-2.
- Auditoria de dependências é uma fotografia; manter atualização e reexecutar antes do deploy.
- Não houve acesso ao ambiente Render, mudança no banco de produção, atualização do documento do Drive nem criação de repositório comercial.

Antes de integrar/deployar: revisar código, executar CI, reproduzir instalação limpa e ensaio físico com protocolo aprovado. Usar docs/TG-ROADMAP.md para registrar evidências e resolver as lacunas.
