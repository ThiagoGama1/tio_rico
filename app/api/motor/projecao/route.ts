import type { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { jsonOk, parseJsonBody, unauthorized } from "@/lib/api/responses";
import { MAX_MESES_PROJECAO, ProjecaoRequestSchema } from "@/lib/types/motor";
import {
  mesesParaMeta,
  projetarSerie,
  taxaMensalEquivalente,
} from "@/motor";

/**
 * POST /api/motor/projecao — projeção com juros compostos e aporte mensal,
 * e em quantos meses a meta é alcançada. Só calcula, não salva.
 *
 * `taxaAnualPct` vem em % (como o `rendimentoAnualPct` do check-in) e é
 * convertida para decimal antes de chamar o motor.
 */
export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const parsed = await parseJsonBody(
    request,
    ProjecaoRequestSchema,
    "Dados inválidos para a projeção.",
  );
  if (!parsed.ok) return parsed.response;

  const { valorInicialCentavos, aporteMensalCentavos, taxaAnualPct, meses, metaCentavos } =
    parsed.data;
  const taxaAnual = taxaAnualPct / 100;

  const serie = projetarSerie(valorInicialCentavos, aporteMensalCentavos, taxaAnual, meses);
  const valorFinalCentavos = Math.round(serie[meses]);
  const totalAportadoCentavos = valorInicialCentavos + aporteMensalCentavos * meses;

  // um ponto por ano (mês 12, 24, ...) e o mês final, para o gráfico do front
  const pontos = serie
    .map((valor, mes) => ({ mes, valorCentavos: Math.round(valor) }))
    .filter(({ mes }) => mes > 0 && (mes % 12 === 0 || mes === meses));

  let meta = null;
  if (metaCentavos !== undefined) {
    const mesesAteMeta = mesesParaMeta(
      valorInicialCentavos,
      aporteMensalCentavos,
      taxaAnual,
      metaCentavos,
      MAX_MESES_PROJECAO,
    );
    meta = {
      metaCentavos,
      mesesAteMeta,
      atingeNoPrazo: mesesAteMeta !== null && mesesAteMeta <= meses,
    };
  }

  return jsonOk({
    valorFinalCentavos,
    totalAportadoCentavos,
    rendimentoCentavos: valorFinalCentavos - totalAportadoCentavos,
    // 4 casas: 12% a.a. vira 0,9489% a.m. (com 2 casas viraria 0,95 e esconderia a diferença para 1%)
    taxaMensalPct: Math.round(taxaMensalEquivalente(taxaAnual) * 100 * 10_000) / 10_000,
    pontos,
    meta,
  });
}
