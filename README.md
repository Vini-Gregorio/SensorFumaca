# MQ-FIRE — laboratório aberto do TG

ESP32 + MQ-2, API Node.js/Express, MariaDB, dashboard responsivo e alertas Telegram.
Este repositório é a versão **acadêmica, didática e replicável** do projeto da FATEC Cruzeiro, originado na curricularização em parceria com a AAP (Associação Amando o Próximo). A frente comercial fica fora deste repositório, em projeto privado independente.

> V2 em validação. Esta refatoração altera API e esquema de dados. Use um **banco novo** e atualize o firmware junto com o backend. Não substitua uma instalação existente sem backup, revisão e ensaio. O histórico Git antigo ainda pode conter credenciais: leia [SECURITY.md](SECURITY.md).

## O que esta versão faz

- Contas com hash de senha, sessão persistida, autorização por proprietário e proteção de origem nas mutações web.
- Dispositivos com chave individual, rotação e desativação; somente o hash fica no banco.
- Até oito canais MQ-2 por dispositivo no contrato; o firmware vem com um canal em GPIO 34. Outros tipos de sensor precisam de adaptador/unidade própria, ainda não implementados.
- Telemetria autenticada, validação, idempotência e transação: só confirma depois de persistir.
- Histerese e confirmação **no ESP32**, sem depender da rede; configuração versionada e cache em flash.
- Dashboard web/mobile responsivo com leituras, histórico, limites, credenciais e notificações. Não é um aplicativo Android nativo.
- Telegram com outbox transacional, timeout, tentativas limitadas e estado de entrega. Desligado por padrão.
- Testes de API/domínio, integração MariaDB e núcleo C++ do alarme, mais compilação do firmware na CI.

O MQ-2 entrega aqui **ADC bruto (0–4095), não PPM**. Limites 700/580 e confirmação de 5 s são parâmetros iniciais de demonstração, não calibração comprovada. A IA é uma etapa futura de pesquisa; não há modelo treinado nem tomada de decisão por IA nesta versão. Consulte [arquitetura](docs/ARCHITECTURE.md), [contrato](docs/API.md) e [plano do TG](docs/TG-ROADMAP.md).

## 1. Pré-requisitos

- Git; Node.js 24.x e npm (veja `node --version`).
- Docker com Compose v2 para o banco local, ou MariaDB 11.4 em banco vazio.
- Para ESP32: Python 3.12, PlatformIO 6.1.18, cabo USB de dados e placa ESP32-WROOM-32/esp32dev.
- Para testes do núcleo embarcado: compilador C++17 (`g++`). No Windows, use WSL ou execute essa etapa pela CI.

Não precisa de hardware nem Telegram para testar a API com o simulador. As dependências JS usam `package-lock.json`; `npm ci` reproduz o lockfile. Imagens Docker usam versão minor e podem receber patches; registre o digest usado em cada ensaio.

## 2. Subir o software local

```sh
git clone https://github.com/Vini-Gregorio/SensorFumaca.git
cd SensorFumaca
# Enquanto a V2 estiver em revisão, selecione esta branch:
git switch refactor/tg-secure-foundation
npm ci --ignore-scripts
node scripts/setup-env.js
docker compose up -d db
docker compose ps
```

O gerador cria `.env` com senhas locais aleatórias e **não sobrescreve** um arquivo existente. Não copie credenciais antigas. Aguarde o banco aparecer como `healthy`; então:

```sh
npm run db:migrate
npm start
```

Abra **http://localhost:3001**. Crie uma conta (senha de pelo menos 12 caracteres), entre e cadastre um dispositivo, por exemplo `esp32-lab01`. Copie a chave exibida uma única vez para configuração local. Ela não pode ser recuperada; se perder, gere outra no painel.

No cadastro, o canal `mq2` já é criado. A tela mostrará `SEM_DADOS` até receber telemetria. Se acessar por IP/nome de outra máquina, ajuste `APP_ORIGIN` para a origem exata usada no navegador e reinicie; não use curingas.

### Testar sem ESP32

Acrescente no seu `.env` local (não versionado):

```dotenv
DEVICE_ID=esp32-lab01
DEVICE_API_KEY=COLE_A_CHAVE_GERADA_NO_PAINEL
```

Em outro terminal:

```sh
npm run simulate
```

O simulador consulta a configuração e envia uma leitura `NORMAL` para cada canal. Espere HTTP `201` e confira o dashboard. Após 90 s sem observação nova, ele mostra `OFFLINE`, nunca presume ambiente normal. O simulador não valida sensor, sirene ou calibração.

### Parar sem apagar dados

```sh
docker compose stop
```

O volume `mqfire-db` mantém os dados. **Não use `docker compose down -v` em dados que deseja preservar.** Alterar a senha no `.env` depois de inicializar o volume não altera a senha dentro do banco: coordene a troca no banco, ou use uma instalação de teste nova.

## 3. Preparar e gravar o ESP32

1. Copie `arduino/include/secrets.example.h` para `arduino/include/secrets.h` (ignorado pelo Git).
2. Configure Wi-Fi, `DEVICE_ID`, chave gerada no painel e `API_BASE_URL` **sem barra final**.
3. HTTPS: informe a CA raiz válida em `TLS_ROOT_CA`; o firmware valida certificado e sincroniza o relógio. Não há `setInsecure()`.
4. Laboratório local isolado: use `http://IP-DO-PC:3001` e habilite explicitamente `ALLOW_INSECURE_LAB_HTTP`. `localhost` no ESP32 seria o próprio ESP32. Não exponha essa configuração à internet.
5. Confira pinagem e polaridade do relé **com carga de baixa tensão**, antes de conectar o protótipo completo.

| Função | Pino inicial | Observação |
|---|---|---|
| Sinal analógico MQ-2 | GPIO 34 / ADC1 | Adequar tensão de saída ao máximo permitido do ESP32; não aplicar 5 V ao ADC |
| Comando do relé | GPIO 21 | Conferir módulo, polaridade e estágio de acionamento |
| LED | GPIO 4 | Indicador do comando de alarme |
| Botão | GPIO 23 | Entrada pull-up, botão para GND; alterna acionamento manual |

O botão não silencia o alarme automático. Relé não pode ser alimentado diretamente por GPIO. Não monte rede elétrica em protoboard; para sirene de rede, a integração elétrica deve ser realizada por pessoa qualificada, com isolamento e proteção apropriados. A reprodução didática inicial deve usar carga de baixa tensão.

```sh
python -m pip install platformio==6.1.18
pio run
pio run --target upload
pio device monitor
```

Sem `secrets.h`, a compilação usa o exemplo e **não tem credenciais operacionais**. Se necessário, especifique a porta serial com `--upload-port`.

O arquivo `arduino/sensor.cpp` é **C++ para Arduino**, não C puro. A lógica de alarme fica em `arduino/include/alarm.h` e tem teste executável no computador. Há espera inicial de 60 s para demonstração; condicionamento e calibração devem seguir o sensor utilizado e o protocolo experimental do TG.

### Fluxo local e limites conhecidos

Amostragem a cada 100 ms → histerese/confirmação → saída física → fila de telemetria. A rede roda em outra tarefa. Publicação a cada 5 s ou mudança de estado. A fila tem 64 amostras em RAM, cerca de 5 minutos sem mudanças extras: pode perder amostras se encher e é perdida no reinício. O contador de perdas por fila cheia aparece no painel. Não há armazenamento offline durável; HTTP recusado ou amostra expirada também pode causar perda (diagnóstico serial). Não há teste automático de sensor desconectado, de relé ou de sirene: o estado `FAULT` não cobre todos os defeitos físicos.

Limites editados no painel ficam pendentes até a versão aplicada aparecer na telemetria. A configuração é consultada a cada 30 s e gravada em flash quando muda. Para adicionar canal: cadastre no painel, acrescente ID/pino ADC1 em `CHANNELS` e recompile. A configuração é aplicada por inteiro; se os canais não coincidirem, o ESP32 mantém a última configuração válida e informa rejeição no serial. Ao reutilizar uma placa em outra instalação, limpe a configuração NVS conscientemente e reprovisione — não transporte limites de outro ambiente.

## 4. Telegram opcional

Crie/controle seu bot, obtenha um token novo e mantenha-o somente no `.env`/gerenciador de segredos. Configure `TELEGRAM_ENABLED=true` e `TELEGRAM_BOT_TOKEN`; reinicie o servidor. Inicie uma conversa com o bot e cadastre no painel apenas seu chat ou grupo autorizado.

Uma transição para alarme cria uma entrega na outbox; alarme contínuo não gera mensagem a cada leitura. Consulte `pending`, `sending`, `sent`, `failed` ou `disabled` no painel. `sent` significa aceitação pela API Telegram, não leitura pelo destinatário. Mensagens podem se repetir caso a API confirme e o processo caia antes de persistir o resultado. Mensagens sem destinatário falham explicitamente. Não há botão de reenvio nesta versão; não reutilize eventos antigos como ensaio novo. Outros canais são roadmap.

## 5. Executar verificações

```sh
npm test
npx playwright install chromium
npm run test:browser
npm run test:firmware
npm run check:secrets
npm audit --omit=dev
pio run
```

A integração requer banco **descartável separado**, cujo nome termine em `_test`. Defina as variáveis de conexão para esse banco, execute `npm run db:migrate` e `RUN_DB_TESTS=1 npm run test:integration` (PowerShell: `$env:RUN_DB_TESTS='1'`). Sem a flag, o teste é **pulado**, não validado. A CI cria MariaDB próprio, aplica migrações duas vezes e executa a integração. Não aponte testes para o banco de campo.

O smoke de navegador usa Chromium e dublê do banco: não substitui a integração SQL. O inventário e a evidência da refatoração estão em [VALIDATION.md](docs/VALIDATION.md). Testes de carga, segurança operacional e campo têm critérios e pendências no [plano do TG](docs/TG-ROADMAP.md). Aprovar CI não comprova precisão, conformidade ou confiabilidade do protótipo físico.

Roteiro de carga inicial: `tests/load/telemetry.k6.js` (k6 instalado separadamente), somente localhost e com `ALLOW_LOAD_TESTS=1`, `DEVICE_ID` e `DEVICE_API_KEY` no ambiente. Comando: `k6 run tests/load/telemetry.k6.js`. Usa 2 VUs/30 s; metas experimentais iniciais p95 <500 ms e erro <1%, a confirmar antes do ensaio. Não desative o rate limit para mascarar saturação; mais de 120 requisições/minuto por dispositivo deve gerar 429. Ensaios com muitos dispositivos exigem identidades distintas e roteiro ampliado. Nenhum resultado de carga é presumido.

## 6. Implantação e atualização

- Faça backup e ensaie restauração; use banco V2 novo. [Migração](docs/MIGRATION.md).
- Disponibilize HTTPS por proxy reverso. `NODE_ENV=production`, `APP_ORIGIN=https://seu-host`, `ALLOW_REGISTRATION=false` após provisionar contas. Sem tela administrativa de convite nesta versão.
- `TRUST_PROXY=1` apenas atrás de **um proxy confiável**, com acesso direto à API bloqueado. No acesso direto, use `0`.
- Configure TLS do banco com `DB_TLS_CA_FILE` para conexões fora de rede privada. Use usuário restrito; não use root na aplicação.
- Início: `npm ci --ignore-scripts`, migração controlada, `npm start`; ou construa o `Dockerfile` e injete variáveis externas. O container não leva `.env`.
- Execute **um processo de API/worker** inicialmente: rate limit é em memória. Para várias réplicas, adicione limitador compartilhado e valide concorrência/carga.
- `/health/live` verifica processo; `/health/ready` verifica acesso ao banco. Não há deploy automático configurado.
- Defina retenção de telemetria e plano de backup antes de operação prolongada: retenção automática ainda não implementada.

## Organização

```text
arduino/             firmware, configuração local e núcleo C++ do alarme
backend/             API, regras de contrato, acesso SQL e worker Telegram
db/migrations/       esquema novo e versionado
public/              dashboard responsivo sem bibliotecas/CDNs externas
scripts/             instalação local, migração, simulador e verificação básica
tests/               domínio, HTTP, notificações, integração e núcleo embarcado
docs/                contrato, decisões, migração, evidências e plano do TG
```

## Escopo e créditos

Protótipo acadêmico de monitoramento e estudo: não substitui equipamento certificado nem determina gás/concentração somente pela resposta do MQ-2. O valor acadêmico está na integração, nos ensaios rastreáveis, na discussão das limitações e na possibilidade de reprodução.

Projeto original: **Amanda do Prado** (frontend, backend e documentação) e **Vinícius Gregório** (backend). Esta base preserva o histórico de colaboração e usa os avanços da branch `testes-git` como ponto de partida; telas e APIs foram substituídas, sem manter rotas antigas inseguras. Evolução do TG conduzida por Vinícius Gregório. Não se presume concessão de nova licença nem transferência de autoria: definir a licença com os autores é uma decisão pendente. Código público não significa autorização comercial irrestrita.
