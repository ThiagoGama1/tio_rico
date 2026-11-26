import { ResultadoMotorSchema } from "../lib/types/domain";
import type { ResultadoMotor } from "../motor/tipos";

/**
 * Conversão do `motorResult` salvo pelo adaptador provisório antigo
 * (`fallback-adapter-v1`, campos em inglês) para o `ResultadoMotor` atual.
 *
 * Os dois formatos têm exatamente os mesmos números, só com nomes diferentes,
 * então a conversão não perde nada. A `versao` mantém o `engineVersion`
 * original, para dar para saber depois quais check-ins vieram do adaptador.
 */

export type ClassificacaoMotorResult =
  | { tipo: "atual" }
  | { tipo: "legado"; convertido: ResultadoMotor }
  | { tipo: "invalido"; motivo: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function converterResultadoLegado(legado: unknown): ResultadoMotor | null {
  if (!isRecord(legado) || !Array.isArray(legado.allocations)) {
    return null;
  }

  const candidato = {
    totalCentavos: legado.totalCurrentCents,
    aporteCentavos: legado.contributionCents,
    totalPosAporteCentavos: legado.totalAfterContributionCents,
    classes: legado.allocations.map((item: unknown) => {
      const a = isRecord(item) ? item : {};
      return {
        classe: a.assetClass,
        valorCentavos: a.currentCents,
        atualPct: a.currentPct,
        alvoPct: a.targetPct,
        desvioPct: a.deviationPct,
        aporteCentavos: a.suggestedContributionCents,
        posAportePct: a.projectedPctAfterContribution,
      };
    }),
    aderencia: legado.adherenceScore,
    aderenciaPosAporte: legado.adherenceScoreAfterContribution,
    rendimentoAnualPct: legado.estimatedAnnualYieldPct,
    rendimentoRealPct: legado.estimatedRealYieldPct,
    juroRealPct: legado.realInterestRatePct,
    versao: legado.engineVersion,
  };

  const parsed = ResultadoMotorSchema.safeParse(candidato);
  return parsed.success ? parsed.data : null;
}

export function classificarMotorResult(raw: unknown): ClassificacaoMotorResult {
  if (ResultadoMotorSchema.safeParse(raw).success) {
    return { tipo: "atual" };
  }
  const convertido = converterResultadoLegado(raw);
  if (convertido) {
    return { tipo: "legado", convertido };
  }
  return {
    tipo: "invalido",
    motivo: isRecord(raw) && "allocations" in raw
      ? "formato do adaptador com campos ausentes ou fora do intervalo"
      : "formato desconhecido",
  };
}
