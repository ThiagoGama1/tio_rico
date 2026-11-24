import type { Ativo, Classe, EntradaMotor } from "@/motor/tipos";
import {
  AssetClassSchema,
  type InvestorPreferences,
  type MacroIndicators,
  type PortfolioPositionInput,
  type RiskProfile,
  type TargetAllocation,
} from "@/lib/types/domain";

/**
 * Translates app/database data (English domain contracts) into the motor's
 * input shape. Pure field mapping only: every calculation lives in `motor/`.
 */

export function paraCarteira(
  positions: ReadonlyArray<PortfolioPositionInput>,
): Ativo[] {
  return positions.map((position) => ({
    nome: position.name,
    classe: position.assetClass,
    valorCentavos: position.amountCents,
    indexador: position.indexer ?? null,
    taxaIndexador: position.indexerRate ?? null,
  }));
}

/**
 * Classes the investor does not want in the portfolio, read from
 * `preferences.excluir` (array of asset classes) and the legacy
 * `preferences.excludeCrypto` flag used by the demo seed.
 */
export function exclusoesDasPreferencias(
  preferences: InvestorPreferences | null | undefined,
): Classe[] {
  if (!preferences) return [];

  const excluded = new Set<Classe>();
  const rawList = preferences.excluir;
  if (Array.isArray(rawList)) {
    for (const item of rawList) {
      const parsed = AssetClassSchema.safeParse(item);
      if (parsed.success) excluded.add(parsed.data);
    }
  }
  if (preferences.excludeCrypto === true) {
    excluded.add("cripto");
  }
  return Array.from(excluded);
}

export interface MontarEntradaMotorParams {
  riskProfile: RiskProfile;
  horizonMonths: number;
  positions: ReadonlyArray<PortfolioPositionInput>;
  targetAllocation: TargetAllocation;
  contributionCents: number;
  macro: MacroIndicators;
  preferences?: InvestorPreferences | null;
}

export function montarEntradaMotor(
  params: MontarEntradaMotorParams,
): EntradaMotor {
  return {
    carteira: paraCarteira(params.positions),
    perfil: {
      tipo: params.riskProfile,
      excluir: exclusoesDasPreferencias(params.preferences),
    },
    alvo: { ...params.targetAllocation },
    aporteCentavos: params.contributionCents,
    horizonteMeses: params.horizonMonths,
    indicadores: {
      selicPct: params.macro.selicMetaAnnual,
      cdiPct: params.macro.cdiAnnual,
      ipca12mPct: params.macro.ipca12m,
    },
  };
}
