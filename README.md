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

1. **Perfil do investidor.** Um questionário sobre objetivos, prazos, tolerância a risco e preferências. Fica salvo por usuário.
2. **Carteira salva.** Os investimentos são cadastrados uma vez e depois só atualizados.
3. **Check-in do mês.** A pessoa conta como foi o mês e quanto tem para investir, em texto livre.
4. **Motor de cálculo.** Usa dados oficiais do Banco Central (Selic, CDI e IPCA) para calcular a alocação atual, comparar com a ideal para o perfil e simular o aporte.
5. **Análise com IA.** A IA recebe o perfil, a carteira, os números calculados e notícias econômicas recentes, e explica em linguagem simples a situação e as opções de ajuste.
6. **Histórico.** Cada check-in fica registrado e mostra a evolução ao longo do tempo.

O Tio Rico analisa e explica. Ele não recomenda a compra de ativos específicos e não substitui um profissional certificado.

## Stack

- **Next.js 16.4 (App Router + Cache Components) + React 19 + TypeScript + Tailwind CSS 4 + shadcn/ui**
- **PostgreSQL + Prisma 7 (`@prisma/adapter-pg` + `pg`)** para persistência e histórico
- **Auth.js v5 (`next-auth`) + `@auth/prisma-adapter` + Resend** para autenticação por link mágico e conta de demonstração
- **API do Banco Central (SGS)** para indicadores econômicos (Selic, CDI e IPCA)
- **Vercel AI SDK (`ai`) + LLM (Gemini `gemini-3.5-flash-lite` ou Claude `claude-sonnet-4-5`)** para análise em JSON estruturado
- **Firecrawl** para coletar notícias econômicas recentes
- **Vercel** para hospedagem (Fluid Compute) e Preview Deploys

## Arquitetura do Projeto

```text
app/
  api/
    auth/[...nextauth]/   # Handlers do Auth.js v5
    session/              # Sessão atual (GET/DELETE), login demo (POST /demo) e magic link (POST /email)
    profile/              # Perfil do investidor autenticado (GET/POST/PATCH)
    portfolio/
      assets/             # CRUD completo de ativos da carteira do usuário autenticado
      evolution/          # Série histórica patrimonial, metas e aderência da sessão (GET)
    checkins/
      analyze/            # Análise estruturada stateless com IA (POST)
      [id]/               # Detalhe de check-in isolado por perfil da sessão (GET)
      route.ts            # Listagem (GET) e orquestrador completo do check-in (POST)
    indicators/           # Indicadores BCB SGS com cache em memória e fallback (GET)
    health/               # Diagnóstico de DB, IA, Auth.js, Firecrawl e BCB (GET)
components/
  pages/                  # Componentes de página (ex.: formLogin.tsx)
  ui/                     # Primitivos de interface (button, input)
lib/
  ai/                     # Seleção de provedor (Gemini/Claude), prompt/contexto e análise estruturada
  api/                    # Respostas HTTP padrão (`Cache-Control: no-store`) e parser Zod
  auth/                   # Configuração Auth.js v5 (`trustHost`), helper de sessão e conta demo
  db/                     # Instância lazy do PrismaClient compatível com Fluid Compute
  history/                # Cálculo puro de evolução em centavos e repositório de check-ins
  integrations/           # Clientes resilientes para BCB SGS e Firecrawl
  motor/                  # Adaptador determinístico provisório (até acoplamento com `motor/index.ts`)
  portfolio/              # Repositório CRUD da carteira amarrado ao usuário logado
  profile/                # Repositório de perfil por usuário
  types/                  # Contratos compartilhados de domínio e contas (Zod + TypeScript)
motor/                    # Pasta reservada para o motor oficial de cálculo
prisma/                   # Schema PostgreSQL, config Prisma 7 e seed demo idempotente
docs/                     # Guia completo de deploy e validação na Vercel
```

## Como rodar

### Pré-requisitos
- **Node.js 22+** (recomendado 24 LTS) e **npm**
- **PostgreSQL** (local ou provisionado via Vercel Marketplace, ex.: Prisma Postgres / Neon)

### Passo a passo local

1. Instale as dependências:
   ```bash
   npm install
   ```
2. Copie o arquivo de exemplo de variáveis de ambiente para `.env.local` e preencha suas chaves:
   ```powershell
   Copy-Item .env.example .env.local
   ```
   ```bash
   # Linux / macOS
   cp .env.example .env.local
   ```
   Principais variáveis em `.env.local` (consulte [`.env.example`](.env.example)):
   - `DATABASE_URL` (e opcionalmente `DATABASE_URL_POOLED` em runtime serverless)
   - `AUTH_SECRET` (gere com `npx auth secret`)
   - `AUTH_RESEND_KEY` e `AUTH_EMAIL_FROM` (necessários para login por link mágico no e-mail; a conta demo via `POST /api/session/demo` funciona mesmo sem Resend)
   - `AI_PROVIDER` (`"google"` ou `"anthropic"`) e `AI_MODEL` (opcional; padrão `gemini-3.5-flash-lite` / `claude-sonnet-4-5`)
   - `GOOGLE_GENERATIVE_AI_API_KEY` (ou `GEMINI_API_KEY`) / `ANTHROPIC_API_KEY`
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

Para publicar na Vercel (PostgreSQL via Marketplace, variáveis de ambiente, Preview Deploys e checklist pós-deploy), consulte [docs/DEPLOY_VERCEL.md](docs/DEPLOY_VERCEL.md).

## Endpoints da API

| Método & Rota | Acesso | Descrição |
| :--- | :--- | :--- |
| `GET/POST /api/auth/[...nextauth]` | Público | Rotas internas do Auth.js v5 (callback, CSRF, providers) |
| `GET/DELETE /api/session` | Público | Consulta o usuário/perfil da sessão atual ou encerra a sessão (logout) |
| `POST /api/session/demo` | Público | Autentica na conta fictícia da demo (`Marina Costa`) e grava o cookie de sessão |
| `POST /api/session/email` | Público | Envia link de login sem senha via Resend (`AUTH_RESEND_KEY`) |
| `GET/POST/PATCH /api/profile` | Sessão obrigatória | Consulta, cria ou atualiza parcialmente o perfil do investidor logado |
| `GET/POST /api/portfolio/assets` | Sessão obrigatória | Lista ou adiciona ativos na carteira do usuário logado |
| `GET/PATCH/DELETE /api/portfolio/assets/[id]` | Sessão obrigatória | Consulta, edita ou remove um ativo pertencente ao usuário logado |
| `GET /api/portfolio/evolution` | Sessão obrigatória | Calcula série histórica patrimonial, deltas entre check-ins e aderência da sessão |
| `GET/POST /api/checkins` | Sessão obrigatória | Lista histórico ou executa o check-in completo (BCB + histórico + motor + Firecrawl + LLM + PostgreSQL) |
| `GET /api/checkins/[id]` | Sessão obrigatória | Retorna os detalhes de um check-in pertencente ao perfil da sessão (proteção contra IDOR) |
| `POST /api/checkins/analyze` | Público (stateless) | Executa a análise estruturada com IA sem exigir banco configurado |
| `GET /api/indicators` | Público | Busca Selic (`432`), CDI (`4389`/`12`) e IPCA (`433`/`13522`) no BCB SGS com cache e fallback (`?refresh=true`) |
| `GET /api/health` | Público | Verifica conectividade com PostgreSQL (`SELECT 1`) e configuração de IA, Auth.js, Firecrawl e BCB (`?strict=true`) |

## Status do Projeto

### Já implementado e validado
- [x] **Autenticação, perfil e carteira por sessão:** Auth.js v5 (`next-auth`) com conta demo e login por e-mail (Resend), CRUD de perfil e carteira, proteção `401`/IDOR nas rotas de check-ins e evolução e `trustHost: true` para produção.
- [x] **API do Banco Central (BCB SGS):** integração das séries `432`, `4389`, `12`, `433` e `13522` (com cálculo composto de fallback), timeout/retry, cache em memória e persistência em `MacroSnapshot` ([`lib/integrations/bcb.ts`](lib/integrations/bcb.ts)).
- [x] **PostgreSQL + Prisma 7 provisionado:** schema unificado (Auth.js + domínio), pool compatível com Vercel Fluid Compute ([`lib/db/prisma.ts`](lib/db/prisma.ts)), banco **Prisma Postgres** criado e sincronizado via `db:push` + `db:seed` idempotente.
- [x] **Histórico e evolução da carteira:** cálculos puros em centavos inteiros para série temporal, aportes, ganho estimado, deltas por classe, aderência e resumo factual para a IA ([`lib/history/evolution.ts`](lib/history/evolution.ts)).
- [x] **Serviço de IA + Firecrawl validado ao vivo:** coleta de notícias com sanitização contra *prompt injection* ([`lib/integrations/firecrawl.ts`](lib/integrations/firecrawl.ts)), contexto com guardrails ([`lib/ai/context-builder.ts`](lib/ai/context-builder.ts)) e geração JSON estruturada via Vercel AI SDK testada ponta a ponta com `gemini-3.5-flash-lite` + Firecrawl + BCB + Prisma Postgres.
- [x] **Qualidade e prontidão Vercel:** healthcheck completo (`GET /api/health`), projeto configurado na Vercel com variáveis de ambiente preenchidas, [`docs/DEPLOY_VERCEL.md`](docs/DEPLOY_VERCEL.md), testes unitários (Vitest) e `npm run build` verdes.

### Próximos passos
- [ ] **Acoplar ao motor de cálculo oficial (`motor/index.ts`):** substituir o adaptador provisório em [`lib/motor/adapter.ts`](lib/motor/adapter.ts) pela implementação final da branch `motor`.
- [ ] **Conectar o repositório GitHub no projeto da Vercel:** instalar/autorizar a GitHub App da Vercel em `ThiagoGama1/tio_rico` para habilitar Preview Deploys e deploy contínuo em produção.
- [ ] **Finalizar páginas e fluxo do Frontend (UI):** conectar login, onboarding/perfil, carteira, check-in mensal e gráficos de evolução às rotas da API.
- [ ] **Validar envio real de e-mail via Resend:** testar `/api/session/email` com destinatário autorizado (ou domínio verificado na Resend).

## Dados da demo

A demonstração usa apenas dados fictícios (`demo-marina-costa`). Nenhuma informação financeira real de usuários é exposta.

## Time

- Thiago Gama Santoro Moreira
- Rafael Fassina
- Lucas Daniel Percebo Teixeira

## Licença

MIT
