# Segurança e tratamento dos vazamentos

## Situação desta refatoração

A árvore V2 remove o `.env` rastreado, configuração de banco com valores fixos, chave de dispositivo embutida, segredo padrão de sessão, logs de cabeçalhos/tokens e rota `/debug`. O código antigo foi substituído, não exposto em rotas de compatibilidade. Não foram revogadas credenciais nos serviços externos nem reescrito o histórico Git.

**Apagar um arquivo em um commit novo não apaga commits antigos, branches, forks, clones, caches ou artefatos.** Considere qualquer credencial que tenha estado no repositório comprometida, mesmo se ele depois se tornar privado.

## Ordem de resposta do responsável

1. Revogar/regenerar token do bot Telegram, credenciais de banco e chaves de dispositivos que tenham sido publicadas. Invalidar sessões do sistema antigo; reconfigurar serviços e placas sem reutilizar valores antigos. Verificar logs dos provedores sem publicar dados pessoais.
2. Fazer backup controlado dos dados e inventário de branches/tags/forks/artefatos afetados. Não criar um backup público dos segredos.
3. Integrar a versão sanitizada e revisar o diff da **árvore atual**. `npm run check:secrets` é uma barreira básica, não um detector completo.
4. Combinar com colaboradores a janela de reescrita de histórico. Usar ferramenta apropriada, mapa de substituições mantido fora do Git e revisão de todas as refs afetadas. Isso altera SHAs e exige coordenação de clones/PRs. Não executar force-push indiscriminado nem apagar branches de trabalho sem acordo.
5. Tratar cópias em forks/caches/artefatos com seus responsáveis e suporte do GitHub quando necessário. Não é possível garantir apagar todas as cópias externas. Revogação é indispensável.
6. Habilitar proteção da main, revisão obrigatória e checks; habilitar secret scanning/push protection quando disponíveis para a conta. Manter dependências e firmware atualizados.

Nenhum valor vazado é reproduzido neste documento. O sanitizador local não percorre o histórico justamente para não confundir remediação de credenciais com um check de código novo.

## Controles implementados

| Risco | Controle | Limite / próxima validação |
|---|---|---|
| Chave global de ingestão | Chave aleatória por dispositivo, hash SHA-256, rotação, desativação | Chave fica em flash no ESP32; extração física é possível |
| Autenticação ausente | Header obrigatório; checagem do vínculo dentro da transação | TLS e provisionamento físico continuam essenciais |
| Leitura duplicada / ACK falso | ID de evento único e commit antes de HTTP 201 | Não é assinatura criptográfica de cada leitura |
| Acesso de outro usuário | Todas as consultas e alterações web vinculadas ao proprietário | Testar isolamento na integração e antes de adicionar endpoints |
| SQL injection | Prepared statements; IDs, números e contratos validados | Nome é texto literal, nunca fragmento SQL |
| Sessão/CSRF | Token aleatório de 256 bits, hash no banco, expiração 8 h, HttpOnly, SameSite strict, origem exata e JSON em mutações | Requer HTTPS na produção; não há reset de senha/admin nesta fase |
| XSS | DOM com `textContent`, sem `innerHTML` para dados; CSP sem CDN/inline | Revisão de qualquer futura interpolação obrigatória |
| Abuso/DoS | Corpo 16 KB, rate limit limitado em memória, tentativas de login limitadas | Um processo inicialmente; proxy e rate limit distribuído para escalar |
| Exfiltração em logs | Erros genéricos; não registrar headers, payload completo ou URL Telegram | Provedores/proxy também precisam de política de logs |
| Falha de rede bloqueando alarme | Tarefa de rede separada do loop físico | Validar watchdog, queda de energia e carga de rede no hardware |

## Comunicação de problemas

Não abra issue pública contendo credencial, dump de banco ou dado pessoal. Avise o mantenedor por canal privado já verificado; combine um canal de divulgação responsável antes de ampliar o uso. Este projeto ainda não oferece canal privado de segurança próprio.

## Dados e operação

Coletar somente o necessário. Email e identificador de chat são dados de conta, não devem aparecer em conjuntos públicos do TG. Exportações de ensaios devem usar IDs pseudonimizados. Registrar consentimento/autorização do local, responsáveis, retenção e descarte. Política de retenção automática, backups agendados, recuperação de conta e auditoria administrativa são pendências de operação, não funcionalidades prontas.
