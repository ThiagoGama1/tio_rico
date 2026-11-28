# Rotas da API

Todas as respostas são JSON com `Cache-Control: no-store`. As rotas marcadas com "sessão" respondem `401` sem login e só enxergam os dados do usuário logado.

| Método e rota | Acesso | O que faz |
| :--- | :--- | :--- |
| `GET/POST /api/auth/[...nextauth]` | Público | Rotas internas do Auth.js |
| `GET/DELETE /api/session` | Público | Mostra a sessão atual ou faz logout |
| `POST /api/session/demo` | Público | Cria uma cópia da conta de demonstração e entra nela. Limite de 10 por IP por hora |
| `POST /api/session/email` | Público | Envia o código de login por e-mail. Limite de 1 por minuto por e-mail e 10 por hora por IP |
| `POST /api/session/email/verify` | Público | Confere o código e cria a sessão. Após 5 erros o código é descartado |
| `GET/POST/PATCH /api/profile` | Sessão | Perfil do investidor: dados, metas e alocação-alvo |
| `GET/POST /api/portfolio/assets` | Sessão | Lista ou adiciona investimentos da carteira |
| `GET/PATCH/DELETE /api/portfolio/assets/[id]` | Sessão | Consulta, edita ou remove um investimento |
| `GET /api/portfolio/evolution` | Sessão | Evolução do patrimônio, aportes, aderência e progresso das metas |
| `GET/POST /api/checkins` | Sessão | Lista os check-ins ou registra um novo (Banco Central, motor, notícias, IA e banco) |
| `GET /api/checkins/[id]` | Sessão | Detalhe de um check-in do usuário |
| `POST /api/motor/perfil` | Público | Questionário de perfil: devolve o perfil sugerido e a alocação-alvo arredondada |
| `POST /api/motor/projecao` | Público | Projeção de patrimônio mês a mês e prazo para atingir uma meta |
| `GET /api/indicators` | Público | Selic, CDI e IPCA do Banco Central, com cache |
| `GET /api/health` | Público | Diagnóstico do banco, da IA, da autenticação e das integrações |
| `GET /api/cron/limpar-demo` | Vercel Cron (`CRON_SECRET`) | Apaga as cópias da demo com mais de 24 horas e os limites vencidos |

## `POST /api/motor/perfil`

Recebe:

```json
{ "objetivo": "crescer", "prazo": "3_a_5_anos", "experiencia": "fundos_acoes", "reacaoQueda": "mantem", "excluir": ["cripto"] }
```

Cada resposta vale de 0 a 3 pontos, na ordem abaixo. De 0 a 4 pontos o perfil é conservador, de 5 a 8 é moderado e de 9 a 12 é arrojado. Quem responde `vende_tudo` é sempre conservador.

- `objetivo`: `preservar`, `renda_extra`, `crescer`, `multiplicar`
- `prazo`: `ate_1_ano`, `1_a_3_anos`, `3_a_5_anos`, `mais_de_5_anos`
- `experiencia`: `nenhuma`, `poupanca_renda_fixa`, `fundos_acoes`, `ampla`
- `reacaoQueda`: `vende_tudo`, `vende_parte`, `mantem`, `compra_mais`

Devolve `{ tipo, pontos, alvoSugerido }`, com `alvoSugerido` em percentuais inteiros que somam 100.

## `POST /api/motor/projecao`

Recebe `{ valorInicialCentavos?, aporteMensalCentavos, taxaAnualPct, meses, metaCentavos? }` e devolve `{ valorFinalCentavos, totalAportadoCentavos, rendimentoCentavos, taxaMensalPct, pontos, meta }`. O rendimento entra no fim de cada mês, antes do aporte, e a taxa mensal é a equivalente composta da anual.
