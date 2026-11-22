# Tio Rico

Assistente de investimentos que lembra de você e faz a conta certa.

Projeto do Hack Brasil 2026, trilha **Pagamentos & finanças**.

## O problema

A maioria das pessoas que começa a investir não tem a quem perguntar. Consultor de investimentos é caro, e o que sobra é palpite de amigo, influenciador ou um chat de IA genérico.

Os chats de IA ajudam, mas têm três limitações:

- **Não lembram de você.** É preciso colar a carteira inteira e explicar o próprio perfil toda vez.
- **Erram nas contas.** Percentuais, rendimentos e simulações saem da cabeça do modelo e podem estar errados sem que a pessoa perceba.
- **Não acompanham a evolução.** Não sabem como a carteira estava meses atrás nem se a pessoa está chegando perto das metas.

## A solução

O Tio Rico junta o que um chat de IA faz bem (conversar, pesquisar e explicar) com o que ele faz mal (guardar contexto e calcular com precisão).

1. **Perfil do investidor.** Um questionário sobre objetivos, prazos, tolerância a risco e preferências. Fica salvo.
2. **Carteira salva.** Os investimentos são cadastrados uma vez e depois só atualizados.
3. **Check-in do mês.** A pessoa conta como foi o mês e quanto tem para investir, em texto livre.
4. **Motor de cálculo.** Usa dados oficiais do Banco Central (Selic, CDI e IPCA) para calcular a alocação atual, comparar com a ideal para o perfil e simular o aporte.
5. **Análise com IA.** A IA recebe o perfil, a carteira, os números calculados e notícias econômicas recentes, e explica em linguagem simples a situação e as opções de ajuste.
6. **Histórico.** Cada check-in fica registrado e mostra a evolução ao longo do tempo.

O Tio Rico analisa e explica. Ele não recomenda a compra de ativos específicos e não substitui um profissional certificado.

## Stack

- **Next.js 16 + TypeScript** para front e backend no mesmo projeto
- **PostgreSQL + Prisma 7** para persistência e histórico
- **API do Banco Central (SGS)** para indicadores econômicos (Selic, CDI e IPCA)
- **Vercel AI SDK + LLM (Claude ou Gemini)** para análise em JSON estruturado
- **Firecrawl** para coletar notícias econômicas recentes
- **Vercel** para hospedagem (Fluid Compute) e Preview Deploys

## Como rodar

### Pré-requisitos
- **Node.js 22+** (recomendado 24 LTS)
- **PostgreSQL** (local ou provisionado via Vercel Marketplace)

### Passo a passo local

1. Instale as dependências:
   ```bash
   npm install
   ```
2. Copie o arquivo de exemplo de variáveis de ambiente e preencha suas chaves:
   ```powershell
   Copy-Item .env.example .env.local
   ```
   ```bash
   # Linux / macOS
   cp .env.example .env.local
   ```
   Principais variáveis em `.env.local` (consulte [`.env.example`](.env.example)):
   - `DATABASE_URL` (e opcionalmente `DATABASE_URL_POOLED` em produção)
   - `AI_PROVIDER` (`"anthropic"` ou `"google"`) e `AI_MODEL` (opcional)
   - `ANTHROPIC_API_KEY` ou `GOOGLE_GENERATIVE_AI_API_KEY` / `GEMINI_API_KEY`
   - `FIRECRAWL_API_KEY` (opcional; sem ela, a análise segue sem notícias)
3. Aplique o schema no banco e popule os dados fictícios da demo:
   ```bash
   npm run db:push
   npm run db:seed
   ```
4. Inicie o servidor de desenvolvimento:
   ```bash
   npm run dev
   ```

### Verificação e qualidade

```bash
npm run typecheck
npm run lint
npm run test:run
npm run build
```

Para publicar na Vercel (PostgreSQL via Marketplace, variáveis de ambiente, Preview Deploys e checklist pós-deploy), consulte o guia completo em [docs/DEPLOY_VERCEL.md](docs/DEPLOY_VERCEL.md).

## Endpoints da API

| Método & Rota | Descrição |
| :--- | :--- |
| `GET /api/indicators` | Busca Selic (`432`), CDI (`4389`/`12`) e IPCA (`433`/`13522`) no BCB SGS com cache e fallback (`?refresh=true` força atualização) |
| `GET /api/checkins` | Lista o histórico de check-ins do perfil de investidor |
| `POST /api/checkins` | Orquestrador completo do check-in (BCB + histórico + motor + Firecrawl + LLM + persistência no PostgreSQL) |
| `GET /api/checkins/[id]` | Retorna os detalhes completos de um check-in salvo |
| `POST /api/checkins/analyze` | Executa a análise estruturada com IA de forma stateless (não exige banco configurado) |
| `GET /api/portfolio/evolution` | Calcula série histórica patrimonial, deltas entre check-ins e evolução da aderência à alocação alvo |
| `GET /api/health` | Verifica conectividade com o PostgreSQL (`SELECT 1`) e presença das variáveis de ambiente (`?strict=true` retorna `503` se degradado) |

## Status — Integrações, IA, Histórico e Deploy (Rafael)

### Já implementado
- [x] **API do Banco Central (BCB SGS):** integração das séries `432` (Meta Selic), `4389` (CDI anualizado), `12` (CDI diário), `433` (IPCA mensal) e `13522` (IPCA 12m com cálculo composto de fallback), timeout/retry, cache em memória, persistência em `MacroSnapshot` e fallback para `database_cache` / `fallback` ([`lib/integrations/bcb.ts`](lib/integrations/bcb.ts), `GET /api/indicators`).
- [x] **Modelagem PostgreSQL + Prisma 7:** schema relacional (`InvestorProfile`, `PortfolioAsset`, `CheckIn`, `CheckInPosition`, `MacroSnapshot`), inicialização lazy segura para `next build` com `pg.Pool` + `attachDatabasePool` para Fluid Compute e seed demo idempotente ([`prisma/schema.prisma`](prisma/schema.prisma), [`lib/db/prisma.ts`](lib/db/prisma.ts), [`prisma/seed.ts`](prisma/seed.ts)).
- [x] **Histórico e evolução da carteira:** cálculos puros em centavos inteiros para série temporal, aportes acumulados, ganho estimado, deltas entre check-ins e por classe de ativo, aderência à carteira alvo e resumo factual em PT-BR para a IA ([`lib/history/evolution.ts`](lib/history/evolution.ts), [`lib/history/repository.ts`](lib/history/repository.ts), `GET /api/portfolio/evolution`, `GET /api/checkins/[id]`).
- [x] **Serviço de IA + Firecrawl:** coleta de notícias econômicas com sanitização contra *prompt injection* e degradação graciosa ([`lib/integrations/firecrawl.ts`](lib/integrations/firecrawl.ts)), seleção configurável entre Claude e Gemini ([`lib/ai/provider.ts`](lib/ai/provider.ts)), montagem de contexto com guardrails ([`lib/ai/context-builder.ts`](lib/ai/context-builder.ts)), saída JSON estruturada via Vercel AI SDK ([`lib/ai/advisor.ts`](lib/ai/advisor.ts)) e rotas `/api/checkins` e `/api/checkins/analyze`.
- [x] **Contratos de domínio e adaptador provisório do motor:** tipos/schemas Zod compartilhados e adaptador determinístico até a definição oficial de `motor/index.ts` ([`lib/types/domain.ts`](lib/types/domain.ts), [`lib/motor/adapter.ts`](lib/motor/adapter.ts)).
- [x] **Prontidão Vercel e testes:** healthcheck (`GET /api/health`), `.env.example`, guia [`docs/DEPLOY_VERCEL.md`](docs/DEPLOY_VERCEL.md), 88 testes unitários (Vitest) e `npm run build` validados.

### O que ainda falta
- [ ] **Definir e conectar a chave privada do LLM (Claude ou Gemini):** decidir o provedor final, configurar `ANTHROPIC_API_KEY` ou `GOOGLE_GENERATIVE_AI_API_KEY` (`GEMINI_API_KEY`) + `AI_PROVIDER`/`AI_MODEL` e validar a geração JSON ao vivo (atualmente testada apenas com mocks nos testes unitários).
- [ ] **Configurar chave da Firecrawl e validar busca real:** definir `FIRECRAWL_API_KEY` e validar ao vivo a relevância das notícias em PT-BR, latência e consumo de créditos (sem a chave, o fluxo funciona em modo degradado sem notícias).
- [ ] **Acoplar ao motor de cálculo oficial (`motor/index.ts`):** substituir o adaptador provisório em [`lib/motor/adapter.ts`](lib/motor/adapter.ts) pela implementação oficial assim que a branch `motor` definir o contrato final.
- [ ] **Provisionar PostgreSQL e concluir o deploy real na Vercel:** instalar/autenticar a Vercel CLI ou vincular o repositório no dashboard da Vercel, provisionar o PostgreSQL via Vercel Marketplace (`prisma` ou `neon`), configurar `DATABASE_URL`/`DATABASE_URL_POOLED` e chaves de API nos ambientes Preview e Production, executar `npm run db:push` e `npm run db:seed` no banco remoto e validar o checklist de [`docs/DEPLOY_VERCEL.md`](docs/DEPLOY_VERCEL.md) (incluindo `GET /api/health?strict=true`).
- [ ] **Testes E2E com serviços reais:** executar um check-in completo (`POST /api/checkins`) gravando no PostgreSQL real com consultas ao vivo no BCB, Firecrawl e LLM.
- [ ] **Conectar ao Frontend (UI):** integrar as telas de check-in, gráficos de evolução/histórico e exibição da análise estruturada aos endpoints da API.

## Dados da demo

A demonstração usa apenas dados fictícios. Nenhuma informação financeira real de usuários é exposta.

## Time

- Thiago Gama Santoro Moreira           
- Rafael Fassina
- Lucas Daniel Percebo Teixeira

## Licença

MIT
