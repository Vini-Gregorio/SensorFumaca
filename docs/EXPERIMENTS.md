# Caderno de ensaios do TG

O caderno conecta o método registrado pelo pesquisador às configurações e leituras do MQ-FIRE. É privado por conta, usa a mesma autenticação do dashboard e não comanda o relé. Não comprova presença de gás, calibração, certificação ou aprovação de um ensaio.

## Roteiro reproduzível

1. Instale a versão atual e aplique a migração 003, com API/worker parados e backup validado. Cadastre os dispositivos e canais, provisione firmware e confira comunicação.
2. No dashboard, abra **Planejar novo ensaio**. Preencha título, objetivo, procedimento aprovado, critério de aceite, condições, montagem e SHA completo do commit. No checkout usado, obtenha o SHA com `git rev-parse HEAD`; informe separadamente a versão do firmware e a montagem no campo de hardware. O SHA é declarado pelo operador, não atestado automaticamente pelo deploy.
3. Escolha de um a oito dispositivos próprios. O plano fica preservado; para mudar o método, crie outro ensaio e indique a relação entre os dois no protocolo. Não se apaga ou reescreve um resultado anterior pela interface.
4. Selecione **Iniciar ensaio**. O início é registrado no relógio do banco; o sistema captura a configuração desejada de cada dispositivo em transação. Dispositivo com ingestão desativada impede o início. A captura não prova que a placa recebeu os limites: confira aplicada = desejada no painel e na telemetria.
5. Registre observações. Categorias: observação geral, referência independente, rede e hardware. Descreva o que foi observado e como. Não copie `ALARM` como se fosse uma referência externa. A anotação não altera o estado declarado pelo firmware.
6. Se precisar registrar algo depois, informe a hora em que ocorreu. Ela deve estar entre início e fim do ensaio, sem data futura. O banco guarda também a hora de registro, permitindo distinguir anotações retrospectivas. Em ensaio concluído, a hora da observação é obrigatória.
7. Conclua explicitamente como **critério atendido**, **não atendido** ou **inconclusivo**, com justificativa e limitações. O sistema nunca aprova automaticamente. O encerramento e a conclusão ficam preservados. Podem ser adicionadas anotações retrospectivas, sem apagar as anteriores.
8. Baixe o pacote do ensaio. Guarde o original privado e registre o hash do arquivo utilizado na análise. Reenvios tardios de telemetria e novas anotações podem mudar uma exportação posterior; não misture versões do dataset silenciosamente.

## O que vai na exportação

| Conteúdo | Interpretação |
|---|---|
| Protocolo, critérios, montagem e conclusão | Declarações do pesquisador, não prova automática de execução |
| Configuração desejada no início | Snapshot preservado; a versão aplicada é a informada em cada leitura |
| Leituras por dispositivo e versões correspondentes | Mesma evidência do endpoint individual, reunida em uma transação |
| Anotações, hora de ocorrência e de registro | Observações manuais separadas da classificação do firmware |
| Janela e contagem total | Intervalo UTC `[início,fim)`; nenhuma truncagem silenciosa |
| SHA-256 do payload | Verificação de integridade do JSON, sem assinatura ou atestado de autoria |

A exportação aceita até **24 h e 10.000 leituras somando todos os dispositivos**. Um ensaio pode durar mais: informe início/fim parciais dentro de seu período e exporte intervalos consecutivos. Sem datas, tenta exportar o período completo até o encerramento ou o instante atual. Uma tentativa sem duração positiva é recusada; não cria dados artificiais.

Todas as anotações do ensaio acompanham cada pacote, mesmo quando a janela de leituras é parcial. Use `observed_at` para selecionar as pertinentes à análise. `configuration_at_start` é preservada mesmo se os limites mudarem durante o ensaio; as leituras incluem suas versões individuais. Lacunas antigas de configuração continuam explícitas.

Limites operacionais: 50 ensaios mais recentes na listagem (os demais continuam acessíveis por ID), 200 anotações por ensaio, 30 mutações/minuto por conta e cinco exportações/minuto por conta, além do limite geral da API. Ultrapassar um limite retorna erro, sem apagar registros. O corpo JSON continua limitado a 16 KB.

## Exemplo de ensaio inicial

**Objetivo:** verificar se uma interrupção de comunicação não interrompe a lógica local e se a recuperação não duplica eventos no banco.

**Preparação:** procedimento de bancada aprovado, carga de baixa tensão, dois dispositivos identificados, versões e limites conferidos. Definir duração e critérios com o orientador antes de executar. Não usar chama ou liberação improvisada de gás como procedimento de teste.

**Registros:** início do ensaio; perda e retorno de conectividade; observação independente da saída local; contador de perdas/substituições; reinício, se houver; confirmação de recepção da API; conclusão conforme os critérios. O teste de rede não mede precisão de detecção.

Para medir latência real entre estímulo e saída, é necessário um método de medição independente apropriado. A hora de observação calculada a partir da idade declarada pela placa não fornece, sozinha, latência metrológica.

## Privacidade e uso em IA

Os campos livres podem conter informações identificáveis mesmo sem email ou chat ID na estrutura. Use códigos de local e de operador; nunca registre credenciais. Revise e pseudonimize textos e IDs antes de publicar dados do TG. Exportação é privada por padrão, com `no-store` e autorização por proprietário.

O caderno fornece organização e proveniência para pesquisa futura. Não treina modelo, calcula precisão nem transforma anotações em verdade de campo validada. Uma comparação de IA precisa de método independente de rotulagem, separação por sessão/dispositivo e comparação com uma referência simples.
