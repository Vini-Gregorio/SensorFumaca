# Independência do repositório acadêmico

## Situação verificada em 22/09/2026

- Repositório de trabalho: `Vini-Gregorio/SensorFumaca`.
- O GitHub ainda o identifica como fork de `AmandaPradoGit/SensorFumaca`.
- O usuário proprietário possui permissão administrativa; a consulta de permissão de `AmandaPradoGit` retornou `read`, sem escrita ou administração.
- A evolução acadêmica está na branch `refactor/tg-secure-foundation`, PR #7.
- A licença não é identificada pela API do GitHub. Não foi adicionada uma licença presumida.

Estas verificações são uma fotografia, não monitoramento de permissões. Nenhuma desvinculação, exclusão de repositório, remoção de colaborador ou reescrita de histórico foi executada nesta etapa.

## Caminho recomendado: novo repositório independente

Usar **MQ-FIRE-TG** como nome proposto. Criar um repositório normal, sem o botão Fork, e iniciar com uma cópia sanitizada da versão acadêmica aprovada. Manter o repositório anterior durante a transição permite consultar PRs e resultados sem destruir o trabalho. Arquivar, renomear ou apagar o antigo é uma decisão posterior.

O novo repositório terá identidade própria e não deve receber o histórico que contém segredos. Preservar `AUTHORS.md` e os créditos de origem. O primeiro commit deve explicar que se trata de uma importação da versão acadêmica revisada, com referência ao commit de origem, sem atribuir toda a obra a uma pessoa só.

1. Verificar o SHA e os checks da versão escolhida; não copiar a main legada por engano.
2. Revogar credenciais antigas nos serviços externos. Uma cópia sem histórico não revoga os valores expostos no repositório anterior.
3. Exportar somente arquivos versionados da versão escolhida, sem `.git`, `.env`, credenciais locais, `node_modules`, dados de ensaio ou artefatos de compilação. O comando de exportação abaixo recusa árvore suja e destinos existentes.
4. Criar o repositório independente na conta de Vinícius, com nome e visibilidade definidos pelo responsável. Não criar por Fork nem fazer mirror do histórico antigo.
5. Inspecionar e importar o snapshot, preservando créditos e informação de proveniência. Confirmar `fork: false` na API do GitHub ou ausência do vínculo de fork na interface.
6. Atualizar URLs no README, badge/checks, remotes locais e rotina de status semanal; executar instalação limpa e CI no novo destino.
7. Definir o destino do repositório antigo depois de confirmar que a nova base funciona. Não apagar PRs e configurações sem decidir como preservá-los.

## Preparar uma cópia local sem histórico

Após baixar a versão aprovada e com checkout limpo:

```sh
git switch refactor/tg-secure-foundation
npm run export:standalone -- ../mqfire-tg-source.tar
```

O script não cria repositório remoto, não muda remotes e não apaga o fork. O TAR contém somente os arquivos do commit escolhido; um manifesto separado guarda SHA de origem e SHA-256 do arquivo. O verificador de segredos é uma barreira básica: revisar o pacote antes de publicar continua necessário. O conteúdo da branch é o mesmo que será publicado; não usar esse procedimento para transportar banco ou configuração local.

## Alternativa: conservar o nome SensorFumaca

A documentação oficial do GitHub descreve **Settings → General → Danger Zone → Leave fork network**, disponível para fork público, menor que 1 GB e sem forks filhos. É preciso conferir elegibilidade na interface: o contador geral de forks não basta para identificar a estrutura dos filhos.

O GitHub informa que sair da rede é permanente, preserva os metadados dos commits, mas não retém issues, PRs, wiki, estrelas, observadores e outros metadados do fork. Portanto, pode eliminar o PR #7 como objeto do GitHub mesmo mantendo os commits. O histórico com segredos também continua existindo se os commits forem preservados.

**Não executar exclusão/recriação nem force-push como atalho.** Antes de confirmar a opção, decidir expressamente como preservar discussões, evidências de CI, configurações e trabalho de outras pessoas. O caminho de novo repositório permite separar a evolução sem essa perda imediata.

Fonte verificada: [GitHub — Detaching a fork](https://docs.github.com/en/pull-requests/how-tos/work-with-forks/detaching-a-fork).
