# Transição do legado para V2

## O que foi preservado e o que mudou

Base: `testes-git` em `83e45910af471882a3bcdfa73701e618d9d31100`, seis commits à frente da main da inspeção. Preservadas as intenções de cadastro de sensor, histórico, painel, limites editáveis e Telegram; substituídos contratos inconsistentes, implementação de sessão e telas dependentes das rotas antigas. Créditos e ativos gráficos originais permanecem no repositório. O histórico não foi reescrito.

| Legado | V2 |
|---|---|
| `/api/esp32`, valor/nivel e token global | `/api/v1/telemetry`, pacote versionado e chave por dispositivo |
| Sensor identificado genericamente como MQ2 | Dispositivo + canal exclusivo dentro dele |
| `usuario`, `sensores`, `alertas` sem migrações | `users`, `devices`, `sensors`, `events`, `readings`, `sessions`, `notification_outbox` |
| Limite chamado PPM sem calibração | `adc_raw`, high/low/confirmMs versionados |
| Rotas `/api/web` e `/api/mobile` duplicadas | API web única com sessão; mobile web responsivo |
| Credenciais e deploy locais implícitos | Ambiente externo, instalação documentada e deploy manual |

## Roteiro sem perda involuntária

1. Inventariar ambiente atual, esquemas reais e consumidores. Fazer backup com acesso restrito e comprovar restauração.
2. Revogar credenciais expostas e guardar novas somente em local apropriado. Não copiar `.env` antigo.
3. Criar banco V2 separado. Não aplicar `001_initial.sql` sobre banco legado nem apagar volume antigo.
4. Aplicar migrações e criar conta/dispositivo de teste; confirmar API e simulador.
5. Gravar firmware novo com chave nova; confirmar versão de configuração, fluxo offline e retorno da rede.
6. Validar dashboard/Telegram e coletar evidências antes do corte. Atualizar relatório acadêmico sem inventar testes.
7. Migrar dados históricos apenas depois de definir mapeamento validado entre usuários, dispositivos, sensores e unidades. Não há importador automático: dados legados ambíguos não devem virar observações calibradas.
8. Aprovar corte; manter backup segregado e plano de rollback. Nunca restaurar segredos comprometidos ao fazer rollback.

## Falha de migração

MariaDB/MySQL fazem commits implícitos em DDL. O migrador registra checksum e não promete transação de esquema. Uma falha no meio pode deixar tabelas criadas; pare, inspecione a causa e restaure um banco de teste novo ou backup validado. Não execute comandos de remoção de tabelas automaticamente. Arquivo de migração aplicado não deve ser editado; crie um novo numerado.

## Atualização de uma instalação V2 com migração 001

1. Faça backup privado e ensaie a restauração em ambiente separado. Pare API/worker antes de migrar; não misture versões de aplicação durante a atualização.
2. Atualize código e dependências fixadas; execute `npm run db:migrate`. A 001 permanece com checksum original. A 002 adiciona revisões, auditoria, diagnóstico e controle de tentativas, sem remover dados.
3. A revisão inicial de cada dispositivo recebe a versão e limites atualmente existentes, com motivo `baseline_migration`. Não há snapshots fabricados de versões anteriores; exportações mostrarão essa lacuna.
4. Reinicie a aplicação; reabra o dashboard para carregar o cliente novo. PUT de limites passa a exigir `expectedVersion`. Clientes antigos de edição precisam ser atualizados.
5. Telemetria V2 sem `diagnostics` continua aceita e mantém a identidade dos pacotes antigos. Grave o firmware novo para obter diagnóstico e a nova política de fila; não confunda compilação com validação física.
6. Confira conta, configuração, histórico, simulador e autorização. A CI ensaia 001 → 002 com limites já alterados, repetição das migrações e transações reais. Isso não substitui o ensaio com seu backup.

Não há migração reversa automatizada. Restaurar limites pelo painel cria uma revisão de configuração; não equivale a restaurar banco, dados ou software. Em falha de atualização, manter a aplicação parada e usar o plano de recuperação previamente ensaiado.

## Atualização para o caderno experimental (003)

Com backup validado e API/worker parados, aplique `npm run db:migrate`. A migração 003 adiciona `experiments`, `experiment_devices` e `experiment_notes`; não altera nem remove telemetria, credenciais, limites ou eventos existentes. Reabra o dashboard para carregar os novos módulos. O firmware atual continua compatível; a migração não exige regravar a placa.

A CI também percorre 001 → 002 → 003 com dados já existentes. Não edite o checksum das migrações anteriores. Repositório independente é uma operação GitHub separada: consulte [REPOSITORY-INDEPENDENCE.md](REPOSITORY-INDEPENDENCE.md).

## Repositório comercial

Não foi criado nem sincronizado repositório privado. Definir escopo, propriedade intelectual e licença com os autores antes de reutilizar a base. Não copiar histórico comprometido, dados pessoais ou segredos. O TG público deve continuar reproduzível sem dependência de módulo privado.
