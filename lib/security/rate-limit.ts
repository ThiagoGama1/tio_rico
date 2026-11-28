import { getPrisma } from "@/lib/db/prisma";

/**
 * Fixed-window rate limiter stored in PostgreSQL (table `rate_limits`).
 *
 * Serverless instances on Vercel do not share memory, so the counter lives in
 * the database every instance already uses. Each call to `consumirLimite` is a
 * single atomic `INSERT ... ON CONFLICT DO UPDATE`, so concurrent requests
 * cannot both slip under the limit.
 */

export interface ResultadoLimite {
  /** true while the count (including this call) is within the limit */
  permitido: boolean;
  /** how many calls are still allowed in the current window */
  restante: number;
  /** when the current window ends */
  reiniciaEm: Date;
}

interface LinhaLimite {
  count: number;
  resetAt: Date;
}

/** Counts one call for `chave` and says whether it is still within `limite`. */
export async function consumirLimite(
  chave: string,
  limite: number,
  janelaMs: number,
): Promise<ResultadoLimite> {
  const agora = new Date();
  const novoReset = new Date(agora.getTime() + janelaMs);

  const linhas = await getPrisma().$queryRaw<LinhaLimite[]>`
    INSERT INTO rate_limits ("key", "count", "resetAt")
    VALUES (${chave}, 1, ${novoReset})
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE WHEN rate_limits."resetAt" <= ${agora} THEN 1
                     ELSE rate_limits."count" + 1 END,
      "resetAt" = CASE WHEN rate_limits."resetAt" <= ${agora} THEN ${novoReset}
                       ELSE rate_limits."resetAt" END
    RETURNING "count", "resetAt"`;

  const { count, resetAt } = linhas[0];
  return {
    permitido: count <= limite,
    restante: Math.max(0, limite - count),
    reiniciaEm: resetAt,
  };
}

/** True when `chave` already reached `limite` in a window that has not ended. */
export async function limiteEsgotado(
  chave: string,
  limite: number,
): Promise<boolean> {
  const linha = await getPrisma().rateLimit.findUnique({ where: { key: chave } });
  if (!linha) return false;
  return linha.resetAt > new Date() && linha.count >= limite;
}

/** Clears the counter for `chave` (e.g. after a successful login). */
export async function zerarLimite(chave: string): Promise<void> {
  await getPrisma().rateLimit.deleteMany({ where: { key: chave } });
}

/** Deletes rows whose window already ended. Returns how many were removed. */
export async function apagarLimitesVencidos(): Promise<number> {
  const { count } = await getPrisma().rateLimit.deleteMany({
    where: { resetAt: { lte: new Date() } },
  });
  return count;
}

/**
 * Client IP for rate limiting. On Vercel `x-forwarded-for` is set by the
 * platform (first entry is the client). Falls back to a shared bucket so a
 * missing header never disables the limit.
 */
export function ipDaRequisicao(headers: Headers | null | undefined): string {
  const encaminhado = headers?.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (encaminhado) return encaminhado;
  const real = headers?.get("x-real-ip")?.trim();
  if (real) return real;
  return "desconhecido";
}
