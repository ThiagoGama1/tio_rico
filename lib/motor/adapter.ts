import {
  ASSET_CLASSES,
  type AssetClass,
  type ClassAllocationComparison,
  type MacroIndicators,
  type MotorCalculationInput,
  type MotorCalculationResult,
  type PortfolioPositionInput,
} from "@/lib/types/domain";

export const FALLBACK_MOTOR_ENGINE_VERSION = "fallback-adapter-v1";

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Fisher equation for real annual interest rate:
 * real = ((1 + nominal) / (1 + inflation)) - 1
 */
export function calculateFisherRealRatePct(
  nominalAnnualPct: number,
  inflationAnnualPct: number,
): number {
  const inflationFactor = 1 + inflationAnnualPct / 100;
  if (inflationFactor <= 0) {
    return round2(nominalAnnualPct);
  }
  const nominalFactor = 1 + nominalAnnualPct / 100;
  return round2((nominalFactor / inflationFactor - 1) * 100);
}

/**
 * Adherence score in [0, 100] based on L1 deviation distance:
 * Math.max(0, 100 - sum(|currentPct - targetPct|) / 2)
 */
export function calculateAdherenceScore(
  entries: ReadonlyArray<{ currentPct: number; targetPct: number }>,
): number {
  const totalAbsDeviation = entries.reduce(
    (sum, item) => sum + Math.abs(item.currentPct - item.targetPct),
    0,
  );
  const rawScore = 100 - totalAbsDeviation / 2;
  return round2(Math.max(0, Math.min(100, rawScore)));
}

function estimateClassAnnualYieldPct(
  assetClass: AssetClass,
  macro: MacroIndicators,
): number {
  const ipcaFactor = 1 + macro.ipca12m / 100;
  switch (assetClass) {
    case "renda_fixa_pos":
      return macro.cdiAnnual;
    case "renda_fixa_pre":
      return macro.selicMetaAnnual + 0.5;
    case "renda_fixa_ipca":
      return (ipcaFactor * 1.06 - 1) * 100;
    case "acoes":
      return macro.selicMetaAnnual + 3.5;
    case "fiis":
      return (ipcaFactor * 1.075 - 1) * 100;
    case "internacional":
      return macro.selicMetaAnnual + 2.0;
    case "cripto":
      return macro.selicMetaAnnual + 5.0;
    case "caixa":
      return macro.cdiAnnual * 0.85;
    case "outros":
      return macro.cdiAnnual;
  }
}

function estimatePositionAnnualYieldPct(
  position: PortfolioPositionInput,
  macro: MacroIndicators,
): number {
  const indexer = position.indexer?.trim().toUpperCase();
  const rate = position.indexerRate;

  if (indexer && typeof rate === "number" && Number.isFinite(rate)) {
    if (indexer === "CDI") {
      return (macro.cdiAnnual * rate) / 100;
    }
    if (indexer === "SELIC") {
      return (macro.selicMetaAnnual * rate) / 100;
    }
    if (indexer === "IPCA" || indexer === "IPCA+") {
      return ((1 + macro.ipca12m / 100) * (1 + rate / 100) - 1) * 100;
    }
    if (indexer === "PREFIXADO" || indexer === "PRE") {
      return rate;
    }
  }

  return estimateClassAnnualYieldPct(position.assetClass, macro);
}

/**
 * Largest Remainder Method (Hamilton apportionment) to split an integer amount
 * of cents proportionally to positive weights while preserving exact sum.
 */
function apportionCents(
  totalCents: number,
  weights: ReadonlyArray<{ assetClass: AssetClass; weight: number }>,
): Map<AssetClass, number> {
  const result = new Map<AssetClass, number>();
  if (totalCents <= 0 || weights.length === 0) {
    return result;
  }

  const positive = weights.filter((w) => w.weight > 0);
  const weightSum = positive.reduce((sum, item) => sum + item.weight, 0);
  if (weightSum <= 0) {
    return result;
  }

  const shares = positive.map((item) => {
    const exact = (totalCents * item.weight) / weightSum;
    const base = Math.floor(exact);
    return {
      assetClass: item.assetClass,
      weight: item.weight,
      base,
      remainder: exact - base,
      canonicalIndex: ASSET_CLASSES.indexOf(item.assetClass),
    };
  });

  let allocated = shares.reduce((sum, item) => sum + item.base, 0);
  let remaining = totalCents - allocated;

  for (const item of shares) {
    result.set(item.assetClass, item.base);
  }

  if (remaining > 0) {
    const ranked = [...shares].sort((a, b) => {
      if (b.remainder !== a.remainder) return b.remainder - a.remainder;
      if (b.weight !== a.weight) return b.weight - a.weight;
      return a.canonicalIndex - b.canonicalIndex;
    });

    for (let i = 0; i < ranked.length && remaining > 0; i++) {
      const target = ranked[i];
      result.set(target.assetClass, (result.get(target.assetClass) ?? 0) + 1);
      remaining -= 1;
      allocated += 1;
    }
  }

  // Defensive invariant check: exact integer sum preserved
  if (allocated !== totalCents) {
    const first = shares[0];
    result.set(
      first.assetClass,
      (result.get(first.assetClass) ?? 0) + (totalCents - allocated),
    );
  }

  return result;
}

/**
 * Deterministic portfolio calculation adapter.
 *
 * Keeps `motor/index.ts` untouched (owned by the motor branch) while providing
 * full cent-exact allocation, contribution rebalancing, adherence score, and
 * Fisher real-rate calculations for the application and AI analysis pipeline.
 */
export function calculatePortfolioWithMotor(
  input: MotorCalculationInput,
): MotorCalculationResult {
  const contributionCents = Math.max(0, Math.round(input.contributionCents));

  const currentByClass = new Map<AssetClass, number>();
  for (const position of input.positions) {
    const cents = Math.max(0, Math.round(position.amountCents));
    currentByClass.set(
      position.assetClass,
      (currentByClass.get(position.assetClass) ?? 0) + cents,
    );
  }

  const totalCurrentCents = Array.from(currentByClass.values()).reduce(
    (sum, cents) => sum + cents,
    0,
  );
  const totalAfterContributionCents = totalCurrentCents + contributionCents;

  const activeClasses = ASSET_CLASSES.filter((assetClass) => {
    const current = currentByClass.get(assetClass) ?? 0;
    const target = input.targetAllocation[assetClass] ?? 0;
    return current > 0 || target > 0;
  });

  // Compute post-contribution shortfall (deficit in cents) for each active class
  const deficitWeights: Array<{ assetClass: AssetClass; weight: number }> = [];
  for (const assetClass of activeClasses) {
    const current = currentByClass.get(assetClass) ?? 0;
    const targetPct = Math.max(0, input.targetAllocation[assetClass] ?? 0);
    const idealAfterCents = (totalAfterContributionCents * targetPct) / 100;
    const deficit = Math.max(0, idealAfterCents - current);
    if (deficit > 0) {
      deficitWeights.push({ assetClass, weight: deficit });
    }
  }

  let suggestedByClass = new Map<AssetClass, number>();
  if (contributionCents > 0) {
    if (deficitWeights.length > 0) {
      suggestedByClass = apportionCents(contributionCents, deficitWeights);
    } else if (totalCurrentCents > 0) {
      // No target deficits (e.g. empty targetAllocation): distribute proportionally to current holdings
      const holdingWeights = activeClasses
        .map((assetClass) => ({
          assetClass,
          weight: currentByClass.get(assetClass) ?? 0,
        }))
        .filter((item) => item.weight > 0);
      suggestedByClass = apportionCents(contributionCents, holdingWeights);
    } else {
      // Completely empty portfolio and empty target allocation: default safe parking class
      suggestedByClass.set("renda_fixa_pos", contributionCents);
    }
  }

  const finalClasses = ASSET_CLASSES.filter((assetClass) => {
    const current = currentByClass.get(assetClass) ?? 0;
    const target = input.targetAllocation[assetClass] ?? 0;
    const suggested = suggestedByClass.get(assetClass) ?? 0;
    return current > 0 || target > 0 || suggested > 0;
  });

  const allocations: ClassAllocationComparison[] = finalClasses.map(
    (assetClass) => {
      const currentCents = currentByClass.get(assetClass) ?? 0;
      const targetPct = round2(
        Math.max(0, Math.min(100, input.targetAllocation[assetClass] ?? 0)),
      );
      const currentPct =
        totalCurrentCents > 0
          ? round2((currentCents / totalCurrentCents) * 100)
          : 0;
      const deviationPct = round2(currentPct - targetPct);
      const suggestedContributionCents = suggestedByClass.get(assetClass) ?? 0;
      const projectedCents = currentCents + suggestedContributionCents;
      const projectedPctAfterContribution =
        totalAfterContributionCents > 0
          ? round2((projectedCents / totalAfterContributionCents) * 100)
          : 0;

      return {
        assetClass,
        currentCents,
        currentPct,
        targetPct,
        deviationPct,
        suggestedContributionCents,
        projectedPctAfterContribution,
      };
    },
  );

  const adherenceScore = calculateAdherenceScore(
    allocations.map((a) => ({
      currentPct: a.currentPct,
      targetPct: a.targetPct,
    })),
  );

  const adherenceScoreAfterContribution = calculateAdherenceScore(
    allocations.map((a) => ({
      currentPct: a.projectedPctAfterContribution,
      targetPct: a.targetPct,
    })),
  );

  // Weighted estimated annual nominal yield
  let estimatedAnnualYieldPct: number;
  if (totalCurrentCents > 0) {
    const weightedSum = input.positions.reduce((sum, position) => {
      const cents = Math.max(0, Math.round(position.amountCents));
      if (cents === 0) return sum;
      return sum + cents * estimatePositionAnnualYieldPct(position, input.macro);
    }, 0);
    estimatedAnnualYieldPct = round2(weightedSum / totalCurrentCents);
  } else if (contributionCents > 0) {
    const weightedSum = allocations.reduce((sum, item) => {
      if (item.suggestedContributionCents === 0) return sum;
      return (
        sum +
        item.suggestedContributionCents *
          estimateClassAnnualYieldPct(item.assetClass, input.macro)
      );
    }, 0);
    estimatedAnnualYieldPct = round2(weightedSum / contributionCents);
  } else {
    const targetSum = allocations.reduce((sum, item) => sum + item.targetPct, 0);
    if (targetSum > 0) {
      const weightedSum = allocations.reduce(
        (sum, item) =>
          sum +
          item.targetPct *
            estimateClassAnnualYieldPct(item.assetClass, input.macro),
        0,
      );
      estimatedAnnualYieldPct = round2(weightedSum / targetSum);
    } else {
      estimatedAnnualYieldPct = round2(input.macro.cdiAnnual);
    }
  }

  const estimatedRealYieldPct = calculateFisherRealRatePct(
    estimatedAnnualYieldPct,
    input.macro.ipca12m,
  );
  const realInterestRatePct = calculateFisherRealRatePct(
    input.macro.selicMetaAnnual,
    input.macro.ipca12m,
  );

  return {
    totalCurrentCents,
    contributionCents,
    totalAfterContributionCents,
    allocations,
    adherenceScore,
    adherenceScoreAfterContribution,
    estimatedAnnualYieldPct,
    estimatedRealYieldPct,
    realInterestRatePct,
    engineVersion: FALLBACK_MOTOR_ENGINE_VERSION,
  };
}
