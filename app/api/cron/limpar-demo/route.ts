import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { apagarDemosAntigas } from "@/lib/auth/demo";
import {
  databaseNotConfigured,
  jsonError,
  jsonOk,
} from "@/lib/api/responses";
import { isDatabaseConfigured } from "@/lib/db/prisma";
import { apagarLimitesVencidos } from "@/lib/security/rate-limit";

function segredoConfere(recebido: string, esperado: string): boolean {
  const a = Buffer.from(recebido);
  const b = Buffer.from(esperado);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * GET /api/cron/limpar-demo — limpeza diária, chamada pelo Vercel Cron
 * (vercel.json). Apaga as contas de demonstração com mais de 24 h e as linhas
 * vencidas de `rate_limits`.
 *
 * Exige `Authorization: Bearer <CRON_SECRET>` (a Vercel envia esse cabeçalho
 * quando a variável CRON_SECRET existe). Sem CRON_SECRET configurado, a rota
 * recusa tudo, para nunca ficar aberta.
 */
export async function GET(request: NextRequest) {
  const authorization = request.headers.get("authorization") ?? "";
  const secret = process.env.CRON_SECRET?.trim();

  if (!secret) {
    return jsonError(503, "Limpeza desativada: defina CRON_SECRET.");
  }
  if (!segredoConfere(authorization, `Bearer ${secret}`)) {
    return jsonError(401, "Não autorizado.");
  }
  if (!isDatabaseConfigured()) {
    return databaseNotConfigured("limpar as contas de demonstração");
  }

  try {
    const demos = await apagarDemosAntigas();
    const limites = await apagarLimitesVencidos();
    return jsonOk({ ok: true, demos, limitesApagados: limites });
  } catch {
    return jsonError(500, "Falha na limpeza das contas de demonstração.");
  }
}
