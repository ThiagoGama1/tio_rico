# Guia de Deploy na Vercel — Tio Rico

Passo a passo prático para publicar o **Tio Rico** (Next.js 16.4 + Prisma 7 + PostgreSQL + Vercel AI SDK + Firecrawl + API BCB SGS) na Vercel com suporte completo a **Fluid Compute** e **Cache Components**.

---

## 1. Pré-requisitos e vínculo do projeto (`vercel link`)

### Pré-requisitos
- Conta na [Vercel](https://vercel.com) com acesso ao repositório GitHub **`ThiagoGama1/tio_rico`**.
- **Node.js 22+ ou 24.x** instalado localmente.
- **Vercel CLI** instalado (globalmente ou via `npx`):
  ```bash
  npm i -g vercel
  vercel --version
  ```
- Autenticação na CLI:
  ```bash
  vercel login
  vercel whoami
  ```

### Vincular o repositório local ao projeto na Vercel
Na raiz do projeto (`tio_rico`):

```bash
vercel link
```

Durante o assistente interativo:
1. Selecione o escopo/time da Vercel.
2. Crie um novo projeto (ou selecione o existente) apontando para o repositório GitHub **`ThiagoGama1/tio_rico`**.
3. Confirme o framework **Next.js** e mantenha o diretório raiz `./` (a pasta `.vercel/` é gerada localmente e já está ignorada no `.gitignore`).

---

## 2. Provisionamento de PostgreSQL via Vercel Marketplace

> **Aviso importante:** O pacote legado **`@vercel/postgres` foi descontinuado** pela Vercel. Novos projetos devem provisionar PostgreSQL diretamente via **Vercel Marketplace** usando integrações nativas.

Escolha **uma** das integrações abaixo diretamente pela Vercel CLI (ou pela aba **Storage → Create Database** no dashboard da Vercel):

### Opção A — Prisma Postgres (recomendado para Prisma ORM)
```bash
vercel integration add prisma
```
Integração oficial da Prisma no Marketplace, com baixa latência e suporte nativo ao Prisma ORM 7.

### Opção B — Neon Serverless Postgres
```bash
vercel integration add neon
```
Excelente opção serverless com suporte a *database branching* (útil para bancos isolados em Preview Deploys de PRs).

### Conexão direta (`DATABASE_URL`) vs. Pooled (`DATABASE_URL_POOLED`)
O Tio Rico separa explicitamente a URL de migração/CLI da URL de runtime serverless:

| Variável | Uso no Tio Rico | Tipo de conexão | Por quê? |
| :--- | :--- | :--- | :--- |
| `DATABASE_URL` | `prisma.config.ts`, `prisma db push`, migrações | **Direta (non-pooled)** | Operações de DDL e *advisory locks* do Prisma falham ou travam atrás de poolers em modo transacional (PgBouncer). |
| `DATABASE_URL_POOLED` | `lib/db/prisma.ts` em runtime (prioridade sobre `DATABASE_URL`) | **Pooled (PgBouncer / pooler do provedor)** | Evita esgotamento de conexões (`too many clients`) sob concorrência no **Vercel Fluid Compute**. |

> **Dica de mapeamento:** Dependendo da integração escolhida no Marketplace, a Vercel pode criar variáveis com nomes como `POSTGRES_URL`, `POSTGRES_PRISMA_URL`, `POSTGRES_URL_NON_POOLING` ou `DATABASE_URL_UNPOOLED`. Verifique na aba **Settings → Environment Variables** do projeto e garanta que:
> - `DATABASE_URL` aponte para a URL **direta (non-pooled)** com `?sslmode=require`;
> - `DATABASE_URL_POOLED` aponte para a URL **pooled** (opcional caso o provedor já faça pooling transparente em `DATABASE_URL`).

---

## 3. Variáveis de Ambiente

Configure as variáveis em **Vercel Dashboard → Settings → Environment Variables** (ou via `vercel env add <NOME>`):

| Variável | Obrigatória | Ambientes | Exemplo / Valores aceitos | Finalidade |
| :--- | :---: | :--- | :--- | :--- |
| `DATABASE_URL` | Sim | Production, Preview, Development | `postgresql://user:pass@host/db?sslmode=require` | Conexão direta PostgreSQL (Prisma CLI, `db push`, fallback de runtime). |
| `DATABASE_URL_POOLED` | Recomendada | Production, Preview | `postgresql://user:pass@pooler-host/db?sslmode=require` | Conexão com *connection pooling* usada prioritariamente por `lib/db/prisma.ts` em Fluid Compute. |
| `AI_PROVIDER` | Opcional | Production, Preview, Development | `anthropic` ou `google` | Seleciona explicitamente o provedor de LLM. Se omitida, faz autodetecção pelas chaves presentes (`ANTHROPIC_API_KEY` → `anthropic`, senão Google). |
| `AI_MODEL` | Opcional | Production, Preview, Development | `claude-sonnet-4-5`, `gemini-3.5-flash-lite` | Sobrescreve o modelo padrão do provedor escolhido. |
| `ANTHROPIC_API_KEY` | Sim (se Anthropic) | Production, Preview, Development | `sk-ant-...` | Chave privada da API Anthropic (Claude). Obrigatória quando `AI_PROVIDER="anthropic"`. |
| `GOOGLE_GENERATIVE_AI_API_KEY` | Sim (se Google) | Production, Preview, Development | `AIza...` | Chave privada da API Google Gemini. Obrigatória quando `AI_PROVIDER="google"` (o alias `GEMINI_API_KEY` também é aceito). |
| `FIRECRAWL_API_KEY` | Opcional | Production, Preview, Development | `fc-...` | Coleta de notícias econômicas brasileiras. Se ausente, a análise continua normalmente em modo degradado sem notícias. |
| `AUTH_SECRET` | Sim | Production, Preview, Development | Gerado por `npx auth secret` | Segredo usado pelo Auth.js v5 para assinar o cookie de sessão JWT. |
| `AUTH_RESEND_KEY` | Sim (para login por e-mail) | Production, Preview, Development | `re_...` | Chave da API Resend para envio do código de login por e-mail (`/api/session/email`). |
| `AUTH_EMAIL_FROM` | Sim (para login por e-mail) | Production, Preview, Development | `Tio Rico <onboarding@resend.dev>` | Remetente verificado na Resend para os e-mails de login. Sem domínio próprio, `onboarding@resend.dev` entrega apenas ao e-mail da conta Resend. |

> **Observações:**
> - A API do **Banco Central (BCB SGS)** é pública e **não exige chave**.
> - **Nunca** exponha segredos com prefixo `NEXT_PUBLIC_` e **nunca** defina `NODE_ENV=production` manualmente como variável de build na Vercel (isso faria o `npm install` pular `devDependencies` como `prisma`).

Exemplo rápido via CLI:

```bash
vercel env add AI_PROVIDER
vercel env add ANTHROPIC_API_KEY
vercel env add FIRECRAWL_API_KEY
```

---

## 4. Aplicando o Schema e Populando Dados da Demo

Após provisionar o banco e configurar as variáveis na Vercel, baixe as variáveis localmente e inicialize o PostgreSQL:

```bash
# 1. Puxa as variáveis do projeto Vercel para .env.local (padrão da Vercel CLI)
vercel env pull --yes

# 2. Puxa também para .env (lido pelo prisma.config.ts via dotenv/config)
vercel env pull .env --yes

# 3. Aplica o schema Prisma no PostgreSQL (cria/atualiza tabelas e índices)
npx prisma db push

# 4. Popula a investidora fictícia da demo (Marina Costa + carteira + histórico de check-ins)
npm run db:seed
```

> **Notas:**
> - Tanto `.env` quanto `.env.local` estão no `.gitignore` e nunca devem ser commitados.
> - Para aplicar no banco de **produção**, use `vercel env pull .env --environment=production --yes` antes de rodar `npx prisma db push` e `npm run db:seed` (lembre-se de voltar `.env` para desenvolvimento depois).
> - O script `npm run db:seed` é **idempotente**: executá-lo novamente atualiza/preserva o perfil demo (`demo-marina-costa`) sem duplicar registros. Nenhum dado financeiro real de usuários é utilizado.

---

## 5. Notas Técnicas: Vercel + Next.js 16.4

### Geração do Prisma Client no build (`postinstall`)
- O `package.json` já inclui `"postinstall": "prisma generate"`, garantindo que o Prisma Client (`v7.10.1`) seja gerado automaticamente durante o `npm install` na Vercel antes do `next build`.
- Como `prisma.config.ts` protege a ausência de `DATABASE_URL`, o `prisma generate` e o `next build` funcionam com segurança mesmo em ambientes sem banco provisionado.
- Se um deploy alterar apenas `prisma/schema.prisma` sem alterar `package-lock.json` e o cache de `node_modules` pular `postinstall`, execute um redeploy sem cache ou garanta `prisma generate && next build` no comando de build.

### Node.js Fluid Compute (sem Edge Runtime)
- Todas as rotas da API executam no **runtime Node.js padrão** com **Vercel Fluid Compute**.
- **Não utilize Edge Runtime (`runtime = "edge"`):** o driver `pg` (`pg.Pool`), `@prisma/adapter-pg` e `attachDatabasePool` (`@vercel/functions`) dependem de APIs nativas de Node.js.
- Em `lib/db/prisma.ts`, `attachDatabasePool(pool)` integra o ciclo de vida do pool PostgreSQL ao Fluid Compute, reutilizando conexões entre invocações concorrentes e fechando conexões ociosas antes da suspensão da instância.
- As rotas de análise com IA (`/api/checkins` e `/api/checkins/analyze`) se beneficiam automaticamente dos limites ampliados de execução do Fluid Compute para chamadas de LLM + Firecrawl.

### Next.js 16.4 com `cacheComponents: true`
- O projeto usa `cacheComponents: true` e `partialPrefetching: true` em `next.config.ts`.
- **Restrição obrigatória:** **não exportar** `runtime`, `dynamic`, `revalidate` ou `fetchCache` em Route Handlers ou páginas — no Next.js 16.4 com `cacheComponents: true`, esses exports legados causam erro de build.
- Rotas `GET` que leem propriedades da requisição (`request.nextUrl.searchParams`) ou executam I/O dinâmico são tratadas automaticamente como dinâmicas em tempo de requisição.
- Parâmetros dinâmicos de rota (`context.params`, ex.: `/api/checkins/[id]`) são `Promise<...>` e devem sempre receber `await`.

---

## 6. Checklist de Validação Pós-Deploy

Substitua `BASE_URL` pela URL do seu Preview ou Produção (ex.: `https://tio-rico.vercel.app`). No Windows PowerShell, use `curl.exe` para evitar conflito com o alias `Invoke-WebRequest`.

### 6.1. Health Check (`/api/health` e `/api/health?strict=true`)
```bash
curl.exe -i "https://SEU-DOMINIO.vercel.app/api/health"
curl.exe -i "https://SEU-DOMINIO.vercel.app/api/health?strict=true"
```
**Esperado:**
- HTTP `200` com `Cache-Control: no-store`.
- `"status": "ok"` quando PostgreSQL estiver conectado (`database.connected: true`), o provedor de IA configurado (`ai.configured: true`) **e** o Auth.js configurado (`auth.configured: true`).
- Se faltar banco, chave de IA ou `AUTH_SECRET`: `/api/health` retorna HTTP `200` com `"status": "degraded"`, enquanto `/api/health?strict=true` retorna HTTP `503` (ideal para validação automatizada de prontidão).
- Nenhum segredo ou string de conexão aparece na resposta.

Exemplo de resposta saudável:
```json
{
  "status": "ok",
  "timestamp": "2026-05-02T12:00:00.000Z",
  "checks": {
    "database": { "configured": true, "connected": true, "latencyMs": 42 },
    "ai": { "configured": true, "provider": "anthropic" },
    "auth": { "configured": true, "emailLoginConfigured": true },
    "firecrawl": { "configured": true },
    "bcb": { "configured": true }
  }
}
```

### 6.2. Indicadores Macroeconômicos BCB (`/api/indicators`)
```bash
curl.exe -s "https://SEU-DOMINIO.vercel.app/api/indicators"
# Para forçar atualização ignorando o cache em memória:
curl.exe -s "https://SEU-DOMINIO.vercel.app/api/indicators?refresh=true"
```
**Esperado:** HTTP `200` com `selicMetaAnnual`, `cdiAnnual`, `ipcaMonthly`, `ipca12m`, `ipcaHistory` e `source: "bcb_sgs"` (ou `"database_cache"` / `"fallback"` se o BCB estiver temporariamente indisponível).

### 6.2.1. Sessão e Login (`/api/session` e `/api/session/demo`)
```bash
# Verifica sessão anônima inicial (retorna authenticated: false)
curl.exe -s "https://SEU-DOMINIO.vercel.app/api/session"

# Faz login na conta demo e salva cookie de sessão (cookies.txt)
curl.exe -c cookies.txt -X POST "https://SEU-DOMINIO.vercel.app/api/session/demo"
```
**Esperado:** `POST /api/session/demo` retorna HTTP `200` com `authenticated: true` e define o cookie de sessão para as rotas autenticadas (`/api/profile`, `/api/portfolio/*`, `/api/checkins*`).

### 6.3. Evolução e Histórico da Carteira (`/api/portfolio/evolution`)
Requer cookie de sessão autenticado (`-b cookies.txt`):
```bash
curl.exe -b cookies.txt -s "https://SEU-DOMINIO.vercel.app/api/portfolio/evolution"
```
**Esperado:** HTTP `200` retornando o perfil da sessão (`demo-marina-costa`), `checkInsCount > 0` e a série histórica em `evolution.points` após rodar o seed (sem sessão retorna `401`).

### 6.4. Check-ins Persistidos (`/api/checkins`)
Listar check-ins da sessão autenticada:
```bash
curl.exe -b cookies.txt -s "https://SEU-DOMINIO.vercel.app/api/checkins"
```
Criar um check-in de teste (persiste no PostgreSQL para o perfil da sessão com cálculo do motor, indicadores BCB e análise de IA):
```bash
curl.exe -b cookies.txt -X POST "https://SEU-DOMINIO.vercel.app/api/checkins" \
  -H "Content-Type: application/json" \
  -d "{\"referenceMonth\":\"2026-06\",\"userNotes\":\"Check-in de validacao pos-deploy\",\"contributionCents\":150000,\"includeNews\":true,\"includeAiAnalysis\":true}"
```
**Esperado:** HTTP `201` retornando o check-in salvo com `id`, `motorResult`, `macroSnapshot`, `aiAnalysis` e `positions` (sem sessão retorna `401`).

### 6.5. Análise Stateless com IA (`/api/checkins/analyze`)
```bash
curl.exe -X POST "https://SEU-DOMINIO.vercel.app/api/checkins/analyze" \
  -H "Content-Type: application/json" \
  -d "{\"profile\":{\"name\":\"Marina Costa\",\"riskProfile\":\"moderado\",\"horizonMonths\":60,\"goals\":[{\"title\":\"Reserva e independencia\"}],\"targetAllocation\":{\"renda_fixa_pos\":50,\"acoes\":30,\"fiis\":20}},\"positions\":[{\"name\":\"Tesouro Selic\",\"assetClass\":\"renda_fixa_pos\",\"amountCents\":700000},{\"name\":\"ETF Ibovespa\",\"assetClass\":\"acoes\",\"amountCents\":200000},{\"name\":\"Carteira FIIs\",\"assetClass\":\"fiis\",\"amountCents\":100000}],\"referenceMonth\":\"2026-06\",\"userNotes\":\"Teste de analise apos deploy\",\"contributionCents\":100000,\"macroIndicators\":{\"selicMetaAnnual\":14.75,\"selicDate\":\"2026-05-01\",\"cdiAnnual\":14.65,\"cdiDaily\":0.0542,\"cdiDate\":\"2026-05-01\",\"ipcaMonthly\":0.45,\"ipca12m\":5.0,\"ipcaDate\":\"2026-04-01\",\"ipcaHistory\":[{\"date\":\"2026-04-01\",\"value\":0.45}],\"source\":\"bcb_sgs\",\"fetchedAt\":\"2026-05-02T12:00:00.000Z\",\"isStale\":false},\"skipNews\":false}"
```
**Esperado:** HTTP `200` com `analysis` (JSON estruturado contendo `resumoExecutivo`, `opcoesDeAjuste` e `disclaimer` educacional), `motorResult`, `news` e `meta` (`provider`, `modelId`).

---

## 7. Fluxo de Preview Deploy por PR e Promoção para Produção

1. **Branch e Pull Request:**
   - Envie a branch de trabalho (ex.: `feat/integracoes-ia-historico`) para o GitHub (`git push -u origin feat/integracoes-ia-historico`) e abra um Pull Request contra `main`.
2. **Preview Deploy automático:**
   - A integração GitHub da Vercel dispara automaticamente um **Preview Deploy** isolado com URL dedicada (`https://tio-rico-git-feat-integracoes-...vercel.app`) e comenta o link no PR.
   - As variáveis configuradas para o escopo **Preview** são injetadas automaticamente (recomenda-se usar um banco de staging ou *Neon branch* separado do banco de produção).
3. **Validação no Preview:**
   - Execute o checklist da Seção 6 contra a URL de Preview, começando por `GET /api/health?strict=true` (deve retornar HTTP `200` e `status: "ok"`).
   - Se o Preview usar um banco novo, aplique `npx prisma db push` e `npm run db:seed` apontando para o banco de Preview.
4. **Promoção para Produção:**
   - Com o PR revisado e o Preview validado, faça o **merge na branch `main`**.
   - A Vercel executa automaticamente o build de **Production** usando as variáveis do escopo `Production` e promove o novo deployment para o domínio principal.
   - Caso precise promover manualmente um deployment específico (ou fazer rollback instantâneo), use a aba **Deployments** no Dashboard da Vercel ou a CLI:
     ```bash
     vercel promote <DEPLOYMENT_URL>
     # ou em caso de rollback:
     vercel rollback
     ```
