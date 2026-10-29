# Ado of Light

Bot e API leves para consultar o mercado de Final Fantasy XIV no data center Primal. As leituras usam Universalis e XIVAPI, são processadas em memória e descartadas ao terminar. O projeto não usa banco de dados nem grava histórico de preços ou vendas.

## O que está implementado

- `GET /api/preco?nome=Excalibur`: consulta JSON sob demanda.
- Comando Discord `/preco nome:<item>`, com autocomplete pela XIVAPI.
- Validação Ed25519 das interações recebidas do Discord.
- Publicação diária às 12h de Brasília via GitHub Actions, com intervalo real das últimas 24 horas.
- Especial mensal executado no último dia do mês, condicionado ao limite verificável do endpoint.
- Nenhuma tabela de novos anúncios: Universalis não fornece timestamp confiável de criação do anúncio. O `lastReviewTime` atual não deve ser tratado como data de criação.

Os rankings representam as vendas registradas nos dados recebidos pelo Universalis. O serviço é abastecido por uploads comunitários e não garante cobertura de todas as transações do jogo. O especial mensal omite a publicação do ranking se algum item atingir o limite de 99.999 registros; isso detecta truncamento pelo limite da resposta, mas não transforma os dados comunitários em um censo completo das vendas.

## Requisitos e execução local

- Node.js 24 LTS ou posterior e npm.
- Uma aplicação/bot Discord e um Worker no Cloudflare para consultas sob demanda.
- GitHub Actions para as publicações agendadas.

```sh
npm ci
cp .env.example .env
```

Preencha `.env` com os valores da seção de configuração. O arquivo `.env` é ignorado pelo Git. Não coloque tokens ou chaves em arquivos commitados.

```sh
npm test
npm run build
npm run job:daily
```

`job:daily` consulta as APIs e publica no canal configurado. Use credenciais e canal de teste durante validação. No GitHub, uma execução manual com `publish: false` consulta os dados e mostra uma prévia nos logs sem enviar mensagens. Para testar apenas cálculos, rode `npm test`, que não faz chamadas de mercado.

Para testar o Worker localmente, use `npm run dev`. O segredo de validação de interações pode ser definido em `.dev.vars` (arquivo ignorado pelo Git) como `DISCORD_PUBLIC_KEY=...`; o endpoint JSON funciona sem esse segredo.

## Configuração do Discord

1. Crie uma aplicação e um bot no [Discord Developer Portal](https://discord.com/developers/applications).
2. Anote o **Application ID**, **Bot Token** e **Public Key**. Convide a aplicação ao servidor com os escopos `bot` e `applications.commands` e permissão para enviar mensagens.
3. Copie `.env.example` para `.env` e defina `DISCORD_BOT_TOKEN`, `DISCORD_CLIENT_ID`, `DISCORD_GUILD_ID` e `DISCORD_CHANNEL_ID`. `DISCORD_PUBLIC_KEY` é usada pelo Worker para validar requisições de interação.
4. Registre o comando no servidor de teste (guild command atualiza imediatamente):

   ```sh
   npm run commands:register
   ```

   Sem `DISCORD_GUILD_ID`, o registro é global e pode demorar para aparecer em todos os servidores.

5. Faça deploy do Worker e defina a URL de interações da aplicação como `https://<worker>.<conta>.workers.dev/interactions` no Developer Portal. A URL da API JSON será `https://<worker>.<conta>.workers.dev/api/preco?nome=Excalibur`.

O Worker responde imediatamente ao comando e conclui a consulta em uma mensagem privada à pessoa que usou `/preco`. A API HTTP retorna `400` para entrada inválida, `404` para item não encontrado, `429` após o limite local temporário e `502` para indisponibilidade das APIs externas. A limitação de consultas por IP/usuário é em memória por isolate; não é uma quota global persistente.

## Cloudflare Workers

O Worker está configurado em [`wrangler.jsonc`](wrangler.jsonc). Faça login e defina o segredo da chave pública do Discord:

```sh
npx wrangler login
npx wrangler secret put DISCORD_PUBLIC_KEY
npm run deploy
```

Alternativamente, o workflow manual `Deploy da API e interações` faz o deploy quando os secrets `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` e `DISCORD_PUBLIC_KEY` estiverem cadastrados no GitHub. O token Cloudflare precisa de permissão para publicar Workers.

O Worker gratuito atende a esta carga pequena, mas seus limites são rígidos e dependem do plano atual da conta. Se o limite gratuito diário de requisições ou o limite de CPU por invocação for atingido, novas consultas podem falhar. A espera por rede externa não consome CPU, mas o tempo total ainda depende das APIs e do prazo do Discord.

## Publicações pelo GitHub Actions

O workflow [`daily-publish.yml`](.github/workflows/daily-publish.yml) roda diariamente às 12h de `America/Sao_Paulo`. No último dia local do mês, também tenta publicar o ranking mensal. O GitHub Actions pode atrasar ou descartar agendamentos sob alta carga; portanto, 12h é o horário solicitado, não uma garantia de execução exata. O timezone é configurado diretamente no cron.

Cadastre como Actions secrets:

- `DISCORD_BOT_TOKEN`
- `DISCORD_CHANNEL_ID`

E, opcionalmente, como Actions variables:

- `UNIVERSALIS_BASE_URL` (padrão `https://universalis.app/api/v2`)
- `XIVAPI_BASE_URL` (padrão `https://v2.xivapi.com/api`)

Execuções manuais do workflow são dry-run por padrão; selecione `publish: true` para publicar. O marcador do mês é incluído na mensagem e o workflow procura mensagens recentes do canal antes de publicar outra edição mensal. Para essa verificação, o bot precisa de `View Channel` e `Read Message History`, além de `Send Messages`. Execuções do workflow são serializadas. Excluir o marcador manualmente remove essa proteção contra reexecução.

O agendamento do Actions funciona apenas na branch padrão. Em repositórios públicos, o GitHub pode desativar workflows agendados após 60 dias sem atividade no repositório. A disponibilidade e eventuais custos/quotas do Actions dependem do tipo de repositório e do plano da conta; confira o consumo nas configurações do GitHub.

## Endpoints do Universalis usados

- `GET /api/v2/marketable`: IDs do catálogo de itens negociáveis.
- `GET /api/v2/history/Primal/{ids}?entriesWithin=...&entriesToReturn=...`: vendas observadas por item; no máximo 100 IDs por chamada.
- `GET /api/v2/Primal/{id}`: anúncios atualmente ativos e estatísticas de mercado para a pesquisa de preço.
- XIVAPI v2 `/api/search` e `/api/sheet/Item/{id}`: autocomplete, busca de item e nomes para exibição.

O cliente usa timeout, tentativas limitadas para erros transitórios, lotes de até 100 itens e quatro chamadas simultâneas ao Universalis, abaixo do limite de oito conexões por IP documentado pelo serviço. Dados de vendas e anúncios existem somente na memória da execução. A lista de IDs vem do endpoint público e não é armazenada pelo projeto.

## Arquitetura

```text
GitHub Actions (12h BRT) ──> Universalis ──> agregação em memória ──> Discord
Discord Interactions ──────> Cloudflare Worker ──> XIVAPI / Universalis
Consulta HTTP JSON ────────> Cloudflare Worker ──> XIVAPI / Universalis
```

O Worker usa Web Crypto para verificar a assinatura Ed25519, responde ao Discord dentro do prazo de três segundos e faz o trabalho de mercado após o deferimento. Não é necessário manter um processo Node.js, gateway Discord ou serviço Render permanentemente ligado. GitHub Actions usa Node.js somente durante as publicações agendadas.

## Limitações conhecidas

- **Novos anúncios em 24h:** indisponível sem snapshots próprios. Anúncios ativos e atualizados não são anúncios recém-criados; a API não oferece um evento confiável de criação.
- **Vendas:** são vendas efetivas reportadas nos registros retornados, porém a cobertura do Universalis depende dos uploads comunitários.
- **Ranking mensal:** uma resposta que atinja 99.999 registros é tratada como truncada e não gera ranking. Fora isso, o endpoint não fornece prova de que a cobertura de mercado seja completa; a mensagem descreve os registros da API, não todas as transações do jogo.
- **Preço agregado:** o menor anúncio é oferta atual reportada; preço médio e compras recentes são dados de vendas concluídas, não ofertas atuais.
- **Render Free:** não é usado. O cold start de cerca de um minuto não atende ao prazo de três segundos das interações do Discord.
- **Custos:** a aplicação depende de APIs públicas gratuitas e dos limites dos planos gratuitos do GitHub/Cloudflare. Nenhum serviço pago é habilitado pelo código; serviços podem rejeitar chamadas quando quotas gratuitas forem excedidas.

## Estrutura

- `src/core/`: tipos, janelas temporais, agregação e formatação.
- `src/services/`: chamadas HTTP, Universalis, XIVAPI e preços.
- `src/worker/`: API HTTP e endpoint das interações Discord.
- `src/jobs/`: publicação diária e mensal via execução temporária do Node.
- `scripts/`: registro do comando slash.
- `tests/`: testes unitários sem chamadas reais às APIs.
- `.github/workflows/`: publicação agendada e deploy manual do Worker.
