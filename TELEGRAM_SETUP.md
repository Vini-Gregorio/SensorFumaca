# Guia de Configuração do Telegram para Alertas

## Problema Identificado
O sistema de alertas por Telegram não estava funcionando corretamente porque:
1. A query para obter o `telegram_chat_id` do usuário era ineficiente (fazia joins desnecessários)
2. O usuário provavelmente não preencheu seu `telegram_chat_id` ao se registrar

## Solução Implementada

### 1. Otimização da Query de Telegram
- **Antes**: Consultava tabela `sensores` JOIN `usuario` para obter chat_id
- **Depois**: Usa o `usuario_id` já obtido na query inicial de sensores, consultando direto na tabela `usuario`
- **Arquivo**: `backend/model/alertaModel.js` (função `addAlerta`)

### 2. Novo Endpoint para Atualizar Chat ID
Foi criado um novo endpoint para que usuários já registrados possam atualizar seu `telegram_chat_id`:

**Endpoint**: `PATCH /usuarios/telegram`
- Autenticação: Requerida (sessão ativa)
- Body: `{ "telegram_chat_id": "SEU_CHAT_ID_AQUI" }`
- Resposta: `{ "sucesso": true, "mensagem": "Telegram Chat ID atualizado com sucesso" }`

## Como Configurar o Telegram

### Passo 1: Obter seu Chat ID do Telegram
1. Abra o Telegram e localize o bot do seu projeto
2. Inicie uma conversa com o bot (envie qualquer mensagem)
3. Acesse este URL no navegador, substituindo `AAFH1k_Rot4V3y9arw5oo1f5OdLE1IS6KAk` pelo seu `TELEGRAM_BOT_TOKEN`:
   ```
   https://api.telegram.org/botAAFH1k_Rot4V3y9arw5oo1f5OdLE1IS6KAk/getUpdates
   ```
4. Procure na resposta por `"chat":{"id": NUMERO_DO_SEU_CHAT}`
5. Copie esse número (ex: `123456789`)

### Passo 2: Atualizar seu Chat ID no Sistema

#### Via Formulário Web (Recomendado)
Será adicionado um formulário na página de perfil do usuário para atualizar o chat ID.

#### Via API
```bash
curl -X PATCH http://localhost:3000/usuarios/telegram \
  -H "Content-Type: application/json" \
  -d '{"telegram_chat_id": "123456789"}' \
  -c cookies.txt  # Se não tiver sessão ativa
```

#### Via JavaScript (no console do navegador, logado)
```javascript
fetch('/usuarios/telegram', {
  method: 'PATCH',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ telegram_chat_id: '123456789' })
})
.then(r => r.json())
.then(d => console.log(d))
```

### Passo 3: Testar Funcionamento

#### Criar um Alerta Manualmente
Se seu bot API estiver pronto, envie:
```bash
curl -X POST http://localhost:3000/api/esp32/alerta \
  -H "Content-Type: application/json" \
  -d '{
    "token": "MQFIRE_2026_SENSOR_X9",
    "sensor": "SENSOR_SALA",
    "valor": 85,
    "nivel": "vermelho"
  }'
```

#### Ou via Portal Web
1. Acesse o dashboard de sensores
2. Crie manualmente um alerta (se houver interface para isso)

#### Verificar Logs
Se o Telegram não enviar a mensagem:
1. Verifique `telegram_failures` table no banco para ver os erros
2. Consulte os logs do backend para mais detalhes
3. Certifique-se que:
   - `TELEGRAM_BOT_TOKEN` está correto em `.env`
   - Seu `telegram_chat_id` foi atualizado no banco
   - O token do bot ainda é válido

## Variáveis de Ambiente Necessárias

No arquivo `.env`:
```
TELEGRAM_BOT_TOKEN=AAFH1k_Rot4V3y9arw5oo1f5OdLE1IS6KAk
TELEGRAM_CHAT_ID=  # Deixe vazio (cada usuário tem seu próprio no BD)
```

## Fluxo de Alerta (Revisado)

1. **ESP32 envia alerta**: POST para `/api/esp32/alerta` com sensor, valor e nível
2. **Backend processa**:
   - Resolve sensor por `identificador` → obtém `id` e `usuario_id`
   - Insere na tabela `alertas` com `sensor_id` (numeric)
   - Se nível = "vermelho" ou "alto":
     - Consulta `usuario` table usando o `usuario_id` já obtido
     - Obtém `telegram_chat_id` do usuário
     - Envia mensagem via API do Telegram
     - Se falhar, registra em `telegram_failures` table

3. **Telegram entrega**: Usuário recebe notificação

## Mudanças de Código (Resumo)

### Arquivos Modificados:
- ✅ `backend/model/alertaModel.js` - Otimizou query de Telegram
- ✅ `backend/model/usuario.js` - Adicionou `atualizarTelegramChatId()`
- ✅ `backend/controller/usuarioController.js` - Novo controller para atualizar
- ✅ `backend/routes/usuarioRoutes.js` - Novo endpoint PATCH `/usuarios/telegram`
- ✅ `backend/.env` - Atualizado com variáveis corretas

## Status de Teste

**Validação de Sintaxe**: ✅ Passou (node --check)
**Próximo Passo**: Teste funcional end-to-end
