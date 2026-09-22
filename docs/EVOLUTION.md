# Evolução orientada a evidências

O próximo salto do MQ-FIRE deve ser tornar cada resultado reproduzível: qual placa, qual montagem, qual versão, quais limites e quais condições produziram aquela leitura. IA e mais sensores fazem sentido quando essa base existe. A aplicação pública continua suficiente para reproduzir o TG; comercialização, clientes e dados privados pertencem a outro projeto.

## O que foi acrescentado nesta evolução

| Problema | Implementação | Limite que ainda precisa de ensaio |
|---|---|---|
| Limites antigos desapareciam ao editar | Snapshot por versão, restauração e bloqueio de edição concorrente | Limites continuam exigindo justificativa experimental |
| Difícil explicar uma falha no ensaio | Diagnóstico da placa, idade da leitura e aviso de API sem atualização | Sem autodiagnóstico completo de sensor, sirene ou alimentação |
| Série de dados sem contexto | Exportação com configurações, unidade, diagnóstico e hash | Protocolo, rótulos independentes e montagem são registrados pelo pesquisador |
| Leituras periódicas atrasavam mudanças após perda de rede | Fila dedicada a mudanças, coalescência de periódicas e contadores | RAM finita; perda no reboot e possível transbordamento |
| Notificação falha sem recuperação orientada | Motivo sanitizado, reserva por token e reenvio histórico limitado | Entrega remota pode duplicar; não confirma leitura humana |
| Atualização de banco sem verificar dados existentes | Migração aditiva e ensaio 001 → 002 na CI | Backup/restore operacional ainda deve ser exercitado |

Ver [VALIDATION.md](VALIDATION.md) para verificações executadas. Implementação não equivale a ensaio físico aprovado.

## Três prioridades seguintes

1. **P0 — encerrar a exposição e reproduzir a instalação.** O responsável revoga os segredos antigos nos provedores; outro colega segue o README em ambiente limpo. Registrar commit, configuração sem segredos, CI e resultado. Ensaiar restauração de backup antes de qualquer corte. Aceite: nenhuma dependência de credencial legada e instalação repetida a partir do guia. A limpeza coordenada do histórico vem depois da revogação, sem apagar autoria.
2. **P0 — validar dois dispositivos e múltiplos canais em bancada.** Começar com carga de baixa tensão e procedimento aprovado. Usar pelo menos dois dispositivos e dois canais em uma placa quando houver hardware; testar limites independentes, perda de internet, recuperação, reboot e destino Telegram. Aceite: saída local independente da rede, eventos sem duplicação SQL, perdas explícitas, configuração aplicada confirmada e pacote de evidências por ensaio. Não usar ensaio de rede como comprovação de detecção de incêndio.
3. **P1 — fechar o ciclo requisito → resultado → TG.** Definir metas antes do ensaio; coletar dados autorizados, registrar falhas e atualizar o texto com resultados e limitações. Separar o que foi observado em bancada do que foi validado no local. Aceite: cada afirmação relevante do relatório aponta para método, versão e evidência. Definir com orientador o recorte da IA e o mínimo para a defesa; web responsivo já atende consulta móvel, app nativo segue como decisão futura.

## Depois que a bancada passar

| Ordem | Entrega sugerida | Critério para considerar pronta |
|---|---|---|
| 1 | Inventário de hardware por dispositivo | Revisão da placa, alimentação, módulo MQ-2, adaptação elétrica e montagem associados ao ensaio; sem expor endereço do local |
| 2 | Protocolo de caracterização do sensor | Condicionamento, baseline, repetições e variabilidade documentados; limiar justificado sem converter ADC em PPM por suposição |
| 3 | Operação prolongada | Ensaio com duração previamente definida, reconexão e reset registrados; curva de memória/fila e ausência de dados analisadas |
| 4 | Backup, retenção e restauração | Recuperação testada em banco separado, acesso restrito e política de descarte acordada; sem exclusão automática antes disso |
| 5 | Carga com identidades distintas | Rodadas 2/10/50 dispositivos em ambiente autorizado; p50/p95/p99, rejeições 429, memória e atraso de notificações medidos |
| 6 | Integração além do MQ-2 | Novo tipo com unidade/faixa, adaptador, schema, visualização e testes próprios; não reutilizar `adc_raw` como temperatura ou concentração |

Métricas mínimas: disponibilidade de observações, latência por etapa, frequência de falsos alarmes por tempo observado, perdas e substituições por boot, reinícios, atraso da fila e sucesso de entrega. Para detecção, falsos negativos e sensibilidade exigem ocorrências independentes rotuladas e amostra adequada; ausência de alarmes num período não comprova segurança. Reportar denominadores, condições e limitações, não apenas porcentagens.

## IA com pergunta de pesquisa definida

**Estado: planejada, não implementada.** Pergunta candidata: "Uma análise consultiva das séries consegue identificar deriva, comportamento atípico ou necessidade de inspeção com utilidade maior que regras simples?" Isso é uma hipótese a comparar, não resultado esperado garantido.

1. Versionar protocolo e dataset autorizado; separar leitura bruta, configuração, contexto e rótulo independente. Marcar lacunas, boot, aquecimento, reconfiguração e períodos sem comunicação.
2. Estabelecer baseline simples e reprodutível. Comparar primeiro métodos estatísticos de janela e detecção de anomalias; um LLM não é necessário para interpretar ADC nem deve decidir o alarme.
3. Separar treino, validação e teste por sessão/dispositivo; ajustar normalização e parâmetros somente no treino. Não dividir aleatoriamente amostras vizinhas do mesmo ensaio nem usar o próprio `ALARM` como prova de acerto.
4. Medir benefício sobre baseline, falsos positivos/negativos conforme rótulos, tempo de processamento, cobertura e limitações. Fixar versão do dataset, configuração, seed quando aplicável e ambiente.
5. Só depois de ganho mensurável, criar módulo consultivo com resultado separado: versão do modelo, janela, score, dados faltantes e explicação das limitações. Nenhuma saída de IA silencia relé, muda limites ou substitui a máquina de estados local.

Uma pasta vazia chamada `ai/` não comprova módulo de IA. A primeira entrega útil é um experimento reproduzível com comparação honesta; a integração online vem depois. Dados e modelos específicos de clientes ficam fora do TG público.

## Decisões que merecem registro antes de ampliar

- **Limites por ambiente:** quem pode alterá-los, como justificar e como revisar o efeito após sincronização.
- **Retenção offline:** quanto tempo de dados precisa ser preservado e qual perda é aceitável. Só então escolher armazenamento persistente e avaliar desgaste/recuperação.
- **MQTT/OTA/múltiplas réplicas:** adotar quando carga, operação ou atualização em campo demonstrarem necessidade; exigir autenticação, atualização assinada e plano de recuperação no escopo correspondente.
- **Móvel:** manter web responsivo como entrega atual; app nativo precisa de benefício concreto, autenticação própria e orçamento de manutenção.
- **Licença e autoria:** decidir com os autores antes de publicar licença ou reaproveitar a base comercialmente. O repositório público não depende do futuro repositório privado.

Datas e responsáveis são definidos com o orientador e colaboradores. A ordem acima explicita dependências e critérios; não promete maturidade operacional apenas por adicionar funcionalidades.
