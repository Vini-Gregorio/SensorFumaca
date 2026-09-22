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

## Repositório comercial

Não foi criado nem sincronizado repositório privado. Definir escopo, propriedade intelectual e licença com os autores antes de reutilizar a base. Não copiar histórico comprometido, dados pessoais ou segredos. O TG público deve continuar reproduzível sem dependência de módulo privado.
