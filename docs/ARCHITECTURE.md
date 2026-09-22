# Arquitetura e decisões — V2

## Caminhos independentes

1. **Local:** ADC → histerese/confirmação → relé/LED. Tarefa principal a cada 100 ms, botão com debounce e watchdog. `Alarm` é C++ sem dependência de rede.
2. **Observabilidade:** amostra/estado → fila RAM → tarefa HTTP → autenticação por dispositivo → transação MariaDB → dashboard/outbox.
3. **Configuração:** edição autenticada → versão incrementada no banco → consulta pelo ESP32 → validação de todos os canais → cache NVS → aplicação no loop → versão reportada. Um alarme ativo não é apagado só por aplicar configuração; novas leituras determinam recuperação.

O servidor **não** troca a classificação do firmware por um limiar paralelo. Registra estado local declarado, valores, versão, idade, tempo de recebimento e perdas. O estado não é prova de ausência de fumaça: depende do sensor/provisionamento/ensaio. Mensagem Telegram nunca é condição para acionar a saída física.

## Modelo de dados

`users` possuem `devices`; cada dispositivo possui `sensors` (canais). `events` representam um pacote autenticado; `readings` guardam a leitura de cada canal. `notification_outbox` referencia o evento; `sessions` referencia a conta. Separar dispositivo de canal evita tratar todos os MQ-2 como o mesmo identificador global.

`config_revisions` preserva o snapshot completo dos limites por versão. `audit_log` guarda alterações da conta/dispositivo sem valores de credenciais ou chat ID. Edição exige `expectedVersion`, lock de dispositivo, incremento e gravação de revisão/auditoria na mesma transação. Leitura da configuração usa o mesmo lock para não misturar versão antiga com limites novos. Restaurar cria outra versão e exige os mesmos canais. A migração 002 registra apenas a configuração existente como baseline: não reconstrói o passado.

- Canal inicial: `mq2`, tipo `MQ2`, unidade `adc_raw`. Máximo: 8 canais; layout físico exige validação por placa.
- Telemetria: chave única `(device_id, boot_id, sequence)`; mesmo ID e conteúdo diferente é conflito.
- `ageMs` não integra o hash: retransmitir o mesmo evento mais tarde não muda sua identidade.
- Hora de observação é estimada pelo servidor menos a idade informada. Não é relógio metrológico sincronizado. Rede/relógio introduzem incerteza; registrar isso em ensaios de latência.
- Consultas da última leitura ordenam por observação, não pela chegada. Amostra antiga não deve tornar o sensor aparentemente saudável. Após 90 s sem observação recente: `OFFLINE`.
- São armazenadas leituras normais também, permitindo baseline e futura avaliação estatística.
- `last_contact_at` registra ingestão autenticada aceita, inclusive repetição idempotente; não substitui a idade da observação para decidir offline. Diagnóstico opcional do primeiro envio traz firmware, RSSI, memória, fila e reset.

## Interrupção da rede e recuperação

`DeliveryQueue` reserva 32 posições FIFO para mudanças de estado e uma posição substituível para a última periódica. A tarefa HTTP mantém no máximo uma amostra em envio. Uma mudança tem prioridade sobre periódica pendente; mudanças entre si preservam a ordem. O alarme local é atualizado antes de acessar a fila. Periódicas substituídas e perdas são contadas separadamente. Isso prioriza mudanças e limita a memória, mas sacrifica a série periódica completa durante uma interrupção. Fila cheia pode perder mudanças; energia/reboot perde a RAM. Não é armazenamento durável.

O firmware só aceita HTTP 200/201 com JSON de confirmação válido. A outbox usa um token por reserva de trabalho: resposta tardia de uma reserva expirada não conclui a nova. Reenvio manual é limitado, auditado e marcado como histórico. `retry_after` do Telegram é respeitado até 24 h. Ainda há possibilidade de mensagem duplicada se o processo falhar depois da aceitação remota e antes do registro local.

## Evidência experimental

Exportação por proprietário em transação reúne até 10.000 leituras de um intervalo de até 24 h, com configurações conhecidas, diagnóstico e unidades. Hash verifica integridade do JSON, sem autenticar sensor, operador ou origem externa. `missingConfigVersions` torna explícita a falta de snapshots antigos. O registro experimental separado deve conter montagem, commit, protocolo, rótulos independentes e incerteza temporal. Não derivar precisão usando o próprio estado do firmware como verdade de campo.

O painel consulta a API a cada 10 s. Mesmo sem novas respostas, o navegador envelhece o estado visível: após 25 s sem atualização, mostra `SEM ATUALIZAÇÃO`. Leituras e estado continuam atualizados enquanto um formulário permanece aberto, sem sobrescrever a edição. Diagnóstico e campos de configuração completos são reconstruídos depois de fechar os detalhes e atualizar.

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

## Caderno experimental

`experiments` mantém método, condições, commit declarado, estado e conclusão; `experiment_devices` vincula dispositivos próprios e captura limites desejados no início; `experiment_notes` separa observação manual de estado do firmware, com horários de ocorrência e registro. O módulo `backend/experiments.js` coordena transações sem criar outro serviço ou depender de IA.

Plano e conclusão não têm rotas de sobrescrita. Mudanças de estado e inserção de anotações usam lock de ensaio para impedir início/encerramento concorrente ou ultrapassar o limite de notas. Locks de dispositivos são adquiridos em ordem ao iniciar. A exportação reúne todos os dispositivos na mesma transação, mantendo limites globais e explicitando dados tardios. O firmware mantém seu contrato e não depende desse módulo para alarmar.

## Escalabilidade planejada

Adicionar tipos de sensor requer schema de unidade/faixa, adaptador de leitura, validação, visualização e testes; não basta aceitar números arbitrários. Para operação maior: retenção/particionamento medidos, pool dimensionado, rate limiter compartilhado, observabilidade, backup/restore e teste de worker concorrente. MQTT, OTA assinada, secure boot e flash encryption são decisões futuras, não promessas de suporte atual.
