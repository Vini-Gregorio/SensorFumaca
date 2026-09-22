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
| PUT `/devices/:id/sensors/:channel/config` | `high`, `low`, `confirmMs` | Nova versão pendente de sincronização |
| GET `/devices/:id/sensors/:channel/readings` | `?before=<id>` opcional | Até 100 registros, ID decrescente; use menor ID como próximo cursor |
| GET `/notifications` | — | Últimos 100 estados de entrega do proprietário |
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
  "readings": [{"channel": "mq2", "value": 400, "state": "NORMAL"}]
}
```

- `bootId`: 16 hex aleatórios por boot; `sequence`: uint32 incremental por amostra.
- `uptimeMs`: uint32 do relógio monotônico; `ageMs`: 0–86.400.000, recalculado ao retransmitir.
- `configVersion`: inteiro positivo, nunca maior que a versão desejada no banco. Versão antiga é aceita para tolerar sincronização, mas mostrada como pendente no painel.
- De 1 a 8 canais distintos, previamente cadastrados. Canais recém-adicionados podem permanecer sem dados até firmware atualizado.
- `value`: inteiro 0–4095 ADC bruto. Estados: `WARMUP`, `NORMAL`, `PENDING`, `ALARM`, `FAULT`.
- `manualAlarm`: acionamento manual; pode coexistir com leitura normal. Saída física é OR dos alarmes locais e manual.
- `droppedSamples`: contador cumulativo de perda por fila cheia no boot. Não representa todo tipo de perda possível.
- `high`: 1–4095; `low`: 0 até `high-1`; `confirmMs`: 100–60.000.

401: credencial/sessão inválida. 403: origem ou vínculo do payload inválido. 404: recurso web não existe ou não pertence à conta. 409: duplicidade de cadastro/conflito de evento/versão futura. 413: corpo grande. 422: canal desconhecido. 429: limite de taxa. 5xx: não considerar leitura confirmada; repetir com **mesmo bootId/sequence e mesmo conteúdo**, alterando apenas idade.

Resposta de configuração:

```json
{"version":1,"sensors":[{"channel":"mq2","kind":"MQ2","unit":"adc_raw","high":700,"low":580,"confirmMs":5000}]}
```

Repetição idempotente impede duplicar a linha de evento; não impede uma placa comprometida de produzir eventos falsos com uma chave válida. Não há autenticação por certificado de cliente, assinatura individual ou atestado de hardware nesta fase.
