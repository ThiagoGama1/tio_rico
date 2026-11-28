# Tio Rico

Assistente de investimentos que lembra de você e faz a conta certa.

Projeto do Hack Brasil 2026, trilha **Pagamentos & finanças**, do time Stack Underflow (Vitória/ES).

- **Demo:** https://tio-rico-seven.vercel.app (clique em "Entrar com conta de demonstração", sem cadastro)
- **Vídeo:** _link do vídeo_

## O problema

A maioria das pessoas que começa a investir não tem a quem perguntar. Consultor de investimentos é caro, e o que sobra é palpite de amigo, influenciador ou um chat de IA genérico.

Os chats de IA ajudam, mas têm três limitações:

- **Não lembram de você.** É preciso colar a carteira inteira e explicar o próprio perfil toda vez.
- **Erram nas contas.** Percentuais, rendimentos e simulações saem da cabeça do modelo e podem estar errados sem que a pessoa perceba.
- **Não acompanham a evolução.** Não sabem como a carteira estava meses atrás nem se a pessoa está chegando perto das metas.

## A solução

O Tio Rico separa o que a IA faz bem (explicar em linguagem simples) do que ela faz mal (guardar contexto e calcular com precisão).

1. **Perfil e metas.** A pessoa informa perfil de risco, horizonte, renda, metas e quais classes de investimento não quer ter. Fica salvo na conta dela.
2. **Carteira salva.** Os investimentos são cadastrados uma vez e depois só atualizados.
3. **Check-in do mês.** A pessoa registra quanto tem em cada investimento e quanto vai aportar.
4. **Motor de cálculo.** Código próprio, sem IA, calcula a alocação atual, compara com a alocação-alvo do perfil, divide o aporte entre as classes que estão abaixo do alvo e estima o rendimento da carteira com dados oficiais do Banco Central (Selic, CDI e IPCA).
5. **Explicação com IA.** A IA recebe o perfil, os números já calculados pelo motor e notícias econômicas recentes, e explica a situação e as opções de ajuste. Ela não faz conta nenhuma.
6. **Histórico.** Cada check-in fica registrado, e as telas de evolução e metas mostram o caminho ao longo dos meses.

O Tio Rico analisa e explica. Ele não recomenda a compra de ativos específicos e não substitui um profissional certificado.

## Como o motor funciona

O motor fica em [`motor/`](motor/). São funções puras (recebem dados e devolvem resultado, sem banco nem internet), todas com testes.

- **Dinheiro sempre em centavos inteiros**, para não acumular erro de arredondamento.
- **Alocação-alvo por perfil** (conservador, moderado ou arrojado). Se a pessoa exclui uma classe, os percentuais das outras são reescalados para somar 100%.
- **Distribuição do aporte proporcional ao déficit, sem vender nada.** Cada classe abaixo do alvo recebe uma parte do aporte proporcional ao quanto falta. Os centavos que sobram do arredondamento vão para a classe mais distante do alvo.
- **Aderência de 0 a 100**, calculada como `100 − Σ|desvios| / 2`, antes e depois do aporte.
- **Rendimento nominal e real.** O real é calculado pela equação de Fisher, descontando o IPCA.
- **Projeção** de patrimônio mês a mês e de quantos meses faltam para atingir uma meta.
- **Questionário de perfil** (objetivo, prazo, experiência e reação a uma queda) que sugere o perfil de risco.

## Stack

- **Next.js 16 (App Router) + React 19 + TypeScript + Tailwind CSS 4 + shadcn/ui**
- **PostgreSQL + Prisma 7** para perfis, carteiras e histórico
- **Auth.js v5** com conta de demonstração e login por código no e-mail (Resend)
- **API do Banco Central (SGS)** para Selic, CDI e IPCA
- **Vercel AI SDK + Gemini** para a explicação em JSON estruturado
- **Firecrawl** para notícias econômicas recentes
- **Vitest + Testing Library** para testes, e **GitHub Actions** rodando typecheck, lint, testes e build em todo PR
- **Vercel** para hospedagem

## Estrutura

```text
app/                 páginas e rotas da API (Next.js App Router)
components/          telas (pages/) e componentes de interface (ui/)
lib/
  ai/                montagem do contexto e chamada da IA
  auth/              Auth.js, conta demo e login por código
  history/           evolução da carteira entre check-ins
  integrations/      Banco Central e Firecrawl
  motor/             conversão dos dados do app para o formato do motor
  security/          limite de tentativas
  types/             contratos com Zod
motor/               motor de cálculo
prisma/              schema do banco e dados da demo
docs/                deploy e referência da API
```

A lista de rotas da API está em [`docs/API.md`](docs/API.md), e o passo a passo de deploy está em [`docs/DEPLOY_VERCEL.md`](docs/DEPLOY_VERCEL.md).

## Como rodar

Precisa de Node.js 22 ou mais novo e de um PostgreSQL.

```bash
npm install
cp .env.example .env.local   # no Windows: Copy-Item .env.example .env.local
npm run db:push
npm run db:seed
npm run dev
```

As variáveis estão explicadas no [`.env.example`](.env.example). O mínimo para rodar é `DATABASE_URL` e `AUTH_SECRET`. Sem chave de IA o check-in funciona sem a explicação, e sem Firecrawl funciona sem notícias.

Para verificar o código:

```bash
npm run typecheck
npm run lint
npm run test:run
npm run build
```

## Dados da demo

A conta de demonstração usa uma pessoa e uma carteira fictícias. Cada visitante recebe uma cópia própria, que é apagada depois de 24 horas.

## Time

| Pessoa | O que fez |
|---|---|
| Thiago Gama Santoro Moreira | Motor de cálculo (alocação, aporte, aderência, rendimento, projeção e perfil) |
| Rafael Fassina | Back-end: API, banco, autenticação, integrações com Banco Central, Firecrawl e IA, e deploy |
| Lucas Daniel Percebo Teixeira | Front-end: design, componentes e telas |

## Licença

MIT
