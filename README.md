# Ado of Light 🌟⚔

Bot de publicação diária do mercado de Final Fantasy XIV no data center Primal. Todos os dias, o processo coleta no Universalis as vendas registradas nas últimas 24 horas, monta um ranking de compras e publica no canal Discord configurado. No último dia do mês, também tenta publicar o ranking mensal.

O bot não recebe comandos de chat nem faz consultas de preço sob demanda. O Render hospeda um pequeno servidor HTTP que agenda a publicação para 12h no horário de São Paulo. O GitHub Actions acorda o Render as 11h55 e acompanha a tentativa de publicacao.

## O que é publicado

- Ranking diário dos itens com maior volume de unidades vendidas nas últimas 24 horas.
- Menor preço anunciado atualmente em cada um dos sete mundos de Primal para os itens do ranking, quando a API informa esse dado.
- Ranking mensal no último dia do mês, desde que a resposta do Universalis não tenha atingido o limite de registros.

As vendas representam os registros recebidos pelo Universalis, que depende de uploads comunitários e não garante cobertura de todas as transações do jogo. O projeto não armazena histórico. Não há tabela de novos anúncios: a API não fornece uma data confiável de criação dos anúncios.

## Implantação no Render

1. Envie este projeto para um repositório GitHub.
2. No Render, escolha **New → Blueprint** e conecte o repositório. O arquivo [`render.yaml`](render.yaml) configura o serviço web gratuito, o comando de build, o servidor e a verificação de saúde.
3. Nas variáveis de ambiente do serviço Render, configure:
   - `DISCORD_BOT_TOKEN`: token do bot Discord.
   - `DISCORD_CHANNEL_ID`: ID do canal onde as publicações devem aparecer.
   - `RENDER_WAKE_TOKEN`: segredo aleatório usado para autorizar o GitHub Actions a acordar o servidor.
4. Convide o bot ao servidor e dê ao cargo do bot acesso ao canal, com `View Channel`, `Send Messages` e `Embed Links`. A leitura do histórico (`Read Message History`) também é usada para evitar a duplicação do especial mensal.

O endpoint GET `/health` e usado pelo Render. Os endpoints POST `/wake` e `/publish-now`, alem do GET `/status`, exigem `Authorization: Bearer <RENDER_WAKE_TOKEN>`.

## Agendamento no GitHub Actions

O workflow [`wake-render.yml`](.github/workflows/wake-render.yml) acorda o Render às **11h55 de São Paulo** (`14:55 UTC`). O serviço agenda a publicação para **12h00**. Enquanto a publicação consulta o Universalis, o GitHub Actions verifica `/status` a cada cinco minutos para manter o Render gratuito ativo.

As consultas ao Universalis repetem falhas temporarias por ate **uma hora no total**. Ao atingir esse prazo, a solicitacao e cancelada e o workflow termina com falha.

Para publicar manualmente, abra **Actions → Publicar mercado no Discord → Run workflow** e selecione `publicar_agora`. A opção `acordar` prepara o serviço para o meio-dia; se usada depois do meio-dia, pode iniciar a publicação imediatamente.

No repositório GitHub, abra **Settings → Secrets and variables → Actions** e configure `RENDER_SERVICE_URL` em **Variables** e `RENDER_WAKE_TOKEN` em **Secrets**. Use a URL base do Render, sem `/wake`, e o mesmo token configurado no Render.

O Render gratuito suspende o serviço após 15 minutos sem tráfego de entrada. As verificações do workflow mantêm a instância ativa durante a tentativa, mas o plano gratuito ainda pode reiniciar o serviço e não garante execução pontual.
## Discord

Como o bot apenas publica mensagens, ele não precisa de URL de interações nem de URL de redirecionamento OAuth2. Para adicioná-lo ao servidor, use o link de instalação com o escopo `bot` e conceda as permissões de canal acima. O escopo `applications.commands` só é necessário se o projeto voltar a oferecer comandos slash.

## Desenvolvimento local

Requisitos: Node.js 24 ou posterior e npm.

```sh
npm ci
cp .env.example .env
```

Preencha no `.env` `DISCORD_BOT_TOKEN`, `DISCORD_CHANNEL_ID` e `RENDER_WAKE_TOKEN`. Para apenas gerar uma prévia sem postar:

```powershell
$env:PUBLISH_TO_DISCORD="false"
npm run job:daily
```

Para publicar manualmente no canal configurado, execute `npm run job:daily` sem definir `PUBLISH_TO_DISCORD=false`.

Para iniciar o servidor local:

```sh
npm run build
npm start
```

O servidor agendará a publicação para o próximo meio-dia de São Paulo. Para acordá-lo manualmente pelo endpoint, envie `POST http://localhost:10000/wake` com o cabeçalho `Authorization: Bearer <RENDER_WAKE_TOKEN>`.

## Arquitetura

```text
GitHub Actions (11h50 BRT) ──POST /wake──> Render
                                               │ agenda para 12h BRT
Universalis ──> agregação em memória ──────────┴──> canal Discord
XIVAPI ───────> nomes dos itens
```

O serviço não precisa de banco de dados. As respostas do mercado existem somente na memória durante a execução da publicação.

## Estrutura

- `src/core/`: janelas temporais, tipos, ranking e formatação.
- `src/services/`: chamadas HTTP ao Universalis e XIVAPI.
- `src/jobs/`: coleta e publicação diária e mensal; agendamento pelo servidor.
- `src/server.ts`: endpoints de saúde e de ativação autenticada.
- `.github/workflows/`: chamada diária para acordar o Render.
- `tests/`: testes unitários sem chamadas reais às APIs.
