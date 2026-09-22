# Contrato HTTP V1

Base `/api/v1`. JSON UTF-8, corpo até 16 KB, erros `{ "error": "mensagem" }`. HTTPS fora do laboratório. Não imprimir tokens em exemplos/logs. Todas as rotas web exigem sessão, exceto cadastro/login; mutações web exigem `Origin` igual a `APP_ORIGIN` e `Content-Type: application/json`. Logout usa corpo `{}`.

| Método / caminho | Entrada | Resultado |
|---|---|---|
| POST `/auth/register` | `email`, `password` | 201; depende de cadastro habilitado |
| POST `/auth/login` | `email`, `password` | 200 + cookie HttpOnly |
| POST `/auth/logout` | `{}` | 204; invalida sessão |
| GET `/me` | — | Conta da sessão |
| PUT `/me/telegram` | `chatId` string numérica ou null | 204 |
| GET `/devices` | — | Canais do proprietário com estado derivado e última leitura |
| POST `/devices` | `id`, `name` | 201; chave `apiKey` exibida uma vez, canal `mq2` inicial |
| POST `/devices/:id/rotate-key` | `{}` | Nova chave; antiga deixa de funcionar |
| PUT `/devices/:id/enabled` | `enabled` booleano | 204; não controla saída física |
| POST `/devices/:id/sensors` | `channel`, `name`, `high`, `low`, `confirmMs` | 201; novo canal MQ2/adc_raw |
| PUT `/devices/:id/sensors/:channel/config` | `high`, `low`, `confirmMs`, `expectedVersion` | Nova `version` pendente de sincronização; 409 se a versão mudou |
| GET `/devices/:id/config/revisions` | — | Últimas 100 configurações completas e motivos |
| POST `/devices/:id/config/restore` | `version`, `expectedVersion` | Nova versão com limites restaurados; exige mesmos canais |
| GET `/devices/:id/sensors/:channel/readings` | `?before=<id>` opcional | Até 100 registros, ID decrescente; use menor ID como próximo cursor |
| GET `/devices/:id/evidence` | `?from=<UTC ISO>&to=<UTC ISO>` | JSON privado de evidências; no máximo 24 h/10.000 leituras |
| GET `/audit` | — | Últimas 100 alterações do proprietário, sem valores de segredos |
| GET `/experiments` | — | Até 50 ensaios mais recentes do proprietário |
| POST `/experiments` | Plano descrito abaixo | 201 `{id}`; estado `planned` |
| GET `/experiments/:id` | — | Plano, dispositivos e anotações |
| POST `/experiments/:id/start` | `{}` | 204; captura limites desejados e início |
| POST `/experiments/:id/notes` | `kind`, `note`, `observedAt` opcional | 201 `{id}`; anotação preservada |
| POST `/experiments/:id/finish` | `outcome`, `conclusion` | 204; encerramento explícito |
| GET `/experiments/:id/evidence` | `from`/`to` opcionais em UTC | Pacote privado; limites globais de 24 h/10.000 leituras |
| GET `/notifications` | — | Últimos 100 estados de entrega do proprietário |
| POST `/notifications/:id/retry` | `{}` | 202; reenvio manual de `failed`/`disabled`, até três por entrega |
| GET `/device/config` | Headers de dispositivo | Versão e todos os canais/limites |
| POST `/telemetry` | Headers de dispositivo e pacote abaixo | 201 novo / 200 duplicata, somente após commit |

Headers de dispositivo: `x-device-id` e `x-api-key` (64 caracteres hexadecimais gerados pelo servidor). Cookie de usuário não autoriza ingestão. O `deviceId` do corpo deve coincidir com o header. Tokens desativados ou rotacionados são recusados.

```json
{
  "deviceId": "esp32-lab01",
  "bootId": "0123456789abcdef",
  "sequence": 1,
  "uptimeMs": 65000,
  "ageMs": 0,
  "configVersion": 1,
  "droppedSamples": 0,
  "manualAlarm": false,
  "diagnostics": {
    "firmware": "2.1.0-tg",
    "rssi": -60,
    "freeHeap": 90000,
    "queueDepth": 1,
    "coalescedSamples": 0,
    "resetReason": 1
  },
  "readings": [{"channel": "mq2", "value": 400, "state": "NORMAL"}]
}
```

- `bootId`: 16 hex aleatórios por boot; `sequence`: uint32 incremental por amostra.
- `uptimeMs`: uint32 do relógio monotônico; `ageMs`: 0–86.400.000, recalculado ao retransmitir.
- `configVersion`: inteiro positivo, nunca maior que a versão desejada no banco. Versão antiga é aceita para tolerar sincronização, mas mostrada como pendente no painel.
- De 1 a 8 canais distintos, previamente cadastrados. Canais recém-adicionados podem permanecer sem dados até firmware atualizado.
- `value`: inteiro 0–4095 ADC bruto. Estados: `WARMUP`, `NORMAL`, `PENDING`, `ALARM`, `FAULT`.
- `manualAlarm`: acionamento manual; pode coexistir com leitura normal. Saída física é OR dos alarmes locais e manual.
- `droppedSamples`: contador cumulativo no boot: fila crítica cheia, expiração ou recusa definitiva do contrato. Não conta perdas de RAM ao reiniciar. Periódicas substituídas ficam em contador separado.
- `diagnostics`: opcional para compatibilidade com a V2 anterior; se presente, exige todos os campos do exemplo. `firmware`: até 40 caracteres alfanuméricos, `.`, `_`, `+`, `-`; `rssi`: −127 a 0 dBm; `freeHeap`: uint32 em bytes; `queueDepth`: 0–65; `coalescedSamples`: uint32; `resetReason`: 0–255 (código do ESP32). O firmware congela esse diagnóstico no **primeiro envio**, não na captura do ADC: não modificar durante retries.
- `high`: 1–4095; `low`: 0 até `high-1`; `confirmMs`: 100–60.000.

401: credencial/sessão inválida. 403: origem ou vínculo do payload inválido. 404: recurso web não existe ou não pertence à conta. 409: duplicidade de cadastro/conflito de evento/versão futura/edição concorrente/ação incompatível. 413: corpo grande ou exportação excedendo 10.000 leituras. 422: canal desconhecido. 429: limite de taxa. 5xx: não considerar leitura confirmada; repetir com **mesmo bootId/sequence e mesmo conteúdo**, alterando apenas idade.

Resposta de configuração:

```json
{"version":1,"sensors":[{"channel":"mq2","kind":"MQ2","unit":"adc_raw","high":700,"low":580,"confirmMs":5000}]}
```

Repetição idempotente impede duplicar a linha de evento; não impede uma placa comprometida de produzir eventos falsos com uma chave válida. Não há autenticação por certificado de cliente, assinatura individual ou atestado de hardware nesta fase.

## Evidências e manutenção

Exportação: `from` e `to` devem ser ISO UTC com `Z` (segundos obrigatórios, milissegundos opcionais com três dígitos). Intervalo maior que zero, até 24 h, início inclusivo/fim exclusivo. Limite de cinco exportações/minuto por conta, além do limitador geral. Resposta `{payload,sha256,hashEncoding}`: SHA-256 de `JSON.stringify(payload)` UTF-8. Não é assinatura digital. Cabeçalhos `Cache-Control: no-store` e `Content-Disposition: attachment`. Nenhum dado é truncado ao exceder o limite.

O pacote reúne configurações correspondentes às versões das leituras e indica versões ausentes. Não inclui email, destino Telegram, credenciais ou nome cadastrado do dispositivo. IDs/canais ainda podem revelar o local; tratar o arquivo como privado até pseudonimização. Registros antigos sem diagnóstico têm `diagnostics: null`.

Reenvio: exige bot habilitado, destino atual configurado, estado `failed`/`disabled` e menos de três reenvios. Cada rodada reinicia o contador de tentativas automáticas e registra a ação em auditoria. O texto é marcado como evento histórico. Limite de dez solicitações/minuto por conta. Um `202` não comprova entrega: consultar `/notifications` para estado, tentativas, reenvios e `error_code`.

`expectedVersion` é a versão desejada vista pelo editor, não a aplicada pela placa. Edição/restauração valida a versão e grava configuração, revisão e auditoria na mesma transação. Em `409`, recarregar e revisar valores: não repetir sobrescrevendo automaticamente. A restauração mantém a numeração crescente e não remove canais.

## Ensaios

Plano obrigatório: `title` (até 120 caracteres), `objective`, `protocol`, `acceptanceCriteria` (até 2.000 cada), `environment`, `hardware` (até 1.000 cada), `softwareRef` (SHA completo com 40 hexadecimais minúsculos) e `deviceIds` (1–8 IDs próprios distintos). O limite total do corpo de 16 KB também se aplica. Campos de texto são tratados como texto, não HTML.

Estados: `planned` → `running` → `completed`. Início/encerramento duplicados retornam 409; não reiniciam o relógio nem sobrescrevem conclusão. Não há endpoint de editar/apagar protocolo. Anotações são append-only: `kind` é `observation`, `reference`, `network` ou `hardware`; `note` é texto até 1.000 caracteres; `observedAt` é UTC ISO estrito. Sem hora, usa o relógio do banco em ensaio em andamento. Depois de concluído, exige hora explícita dentro do período. Limite de 200 anotações por ensaio.

`outcome` exige `met`, `not_met` ou `inconclusive`; `conclusion` é texto obrigatório até 2.000 caracteres. Todo resultado é declarado pelo pesquisador. Não há inferência de sucesso pelo estado do sensor. Mutações de ensaio compartilham limite de 30/minuto por conta.

Exportação: `mqfire-experiment/1`, `{payload,sha256,hashEncoding}`. Com `from`/`to`, ambos obrigatórios e dentro do período do ensaio. Sem eles, tenta o intervalo completo; períodos acima de 24 h exigem exportação parcial. O máximo de 10.000 leituras é a soma dos dispositivos. Plano, anotações e leituras são consultados na mesma transação. Textos livres podem conter dados privados; revisar antes de compartilhar. Cinco exportações/minuto por conta.
