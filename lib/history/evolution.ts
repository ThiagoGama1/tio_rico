import {
  ASSET_CLASSES,
  ASSET_CLASS_LABELS,
  PortfolioEvolutionSummarySchema,
  type AssetClass,
  type CheckInDetail,
  type ClassDelta,
  type InvestorGoal,
  type InvestorProfile,
  type PortfolioEvolutionPoint,
  type PortfolioEvolutionSummary,
  type ReferenceMonth,
} from "@/lib/types/domain";

export type EvolutionProfileContext = Partial<
  Pick<InvestorProfile, "id" | "goals" | "targetAllocation">
>;

export interface PortfolioPeriodMetric {
  checkInId: string;
  referenceMonth: ReferenceMonth;
  createdAt: string;
  totalValueCents: number;
  contributionCents: number;
  cumulativeContributionsCents: number;
  periodDeltaCents: number | null;
  periodDeltaPct: number | null;
  estimatedPeriodGainCents: number | null;
  estimatedCumulativeGainCents: number;
  adherenceScore: number | null;
}

export interface GoalProgress {
  title: string;
  targetAmountCents: number | null;
  currentValueCents: number;
  progressPct: number | null;
  remainingCents: number | null;
  achieved: boolean;
  targetDate: string | null;
  priority: "alta" | "media" | "baixa" | null;
}

export interface PortfolioEvolutionResult extends PortfolioEvolutionSummary {
  latestContributionCents: number;
  contributionsSinceFirstCents: number;
  estimatedGainFromPreviousCents: number | null;
  estimatedGainFromFirstCents: number | null;
  periodMetrics: PortfolioPeriodMetric[];
  goalProgress: GoalProgress[];
  aiHistoryBrief: string;
}

function round2(value: number): number {
  const rounded = Math.round((value + Number.EPSILON) * 100) / 100;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function clampPct(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return round2(Math.max(0, Math.min(100, value)));
}

function sanitizeNonNegativeInt(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.round(value));
}

function safeDeltaPct(
  currentCents: number,
  baselineCents: number,
): number | null {
  if (baselineCents <= 0) {
    return null;
  }
  const pct = ((currentCents - baselineCents) / baselineCents) * 100;
  return Number.isFinite(pct) ? round2(pct) : null;
}

function formatGroupedInteger(absWhole: number): string {
  return String(absWhole).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/**
 * Deterministic BRL currency formatter from integer cents (locale-independent).
 * Example: 123456 -> "R$ 1.234,56", -5000 -> "-R$ 50,00".
 */
export function formatCentsBRL(cents: number): string {
  const safeCents = Number.isFinite(cents) ? Math.round(cents) : 0;
  const sign = safeCents < 0 ? "-" : "";
  const abs = Math.abs(safeCents);
  const reais = Math.floor(abs / 100);
  const centavos = String(abs % 100).padStart(2, "0");
  return `${sign}R$ ${formatGroupedInteger(reais)},${centavos}`;
}

/**
 * Deterministic signed BRL currency formatter from integer cents.
 * Example: 123456 -> "+R$ 1.234,56", -5000 -> "-R$ 50,00", 0 -> "R$ 0,00".
 */
export function formatSignedCentsBRL(cents: number): string {
  const safeCents = Number.isFinite(cents) ? Math.round(cents) : 0;
  if (safeCents > 0) {
    return `+${formatCentsBRL(safeCents)}`;
  }
  return formatCentsBRL(safeCents);
}

/**
 * Deterministic Brazilian percentage formatter (comma decimal separator).
 * Example: 19.05 -> "19,05%".
 */
export function formatPctBR(value: number): string {
  const safe = Number.isFinite(value) ? round2(value) : 0;
  return `${safe.toFixed(2).replace(".", ",")}%`;
}

/**
 * Deterministic signed percentage formatter.
 * Example: 5.93 -> "+5,93%", -2.1 -> "-2,10%", 0 -> "0,00%".
 */
export function formatSignedPctBR(value: number): string {
  const safe = Number.isFinite(value) ? round2(value) : 0;
  const prefix = safe > 0 ? "+" : "";
  return `${prefix}${safe.toFixed(2).replace(".", ",")}%`;
}

/**
 * Deterministic signed percentage-point formatter.
 * Example: 3.5 -> "+3,50 p.p.", -1.2 -> "-1,20 p.p.", 0 -> "0,00 p.p.".
 */
export function formatSignedPpBR(value: number): string {
  const safe = Number.isFinite(value) ? round2(value) : 0;
  const prefix = safe > 0 ? "+" : "";
  return `${prefix}${safe.toFixed(2).replace(".", ",")} p.p.`;
}

function compareCreatedAt(a: string, b: string): number {
  const timeA = Date.parse(a);
  const timeB = Date.parse(b);
  if (!Number.isNaN(timeA) && !Number.isNaN(timeB) && timeA !== timeB) {
    return timeA - timeB;
  }
  return a.localeCompare(b);
}

/**
 * Returns a new array sorted chronologically by `referenceMonth` ascending,
 * with `createdAt` ascending (and `id` ascending) as deterministic tie-breakers.
 */
export function sortCheckInsChronologically(
  checkIns: ReadonlyArray<CheckInDetail>,
): CheckInDetail[] {
  return [...checkIns].sort((a, b) => {
    const monthDiff = a.referenceMonth.localeCompare(b.referenceMonth);
    if (monthDiff !== 0) return monthDiff;
    const createdDiff = compareCreatedAt(a.createdAt, b.createdAt);
    if (createdDiff !== 0) return createdDiff;
    return a.id.localeCompare(b.id);
  });
}

function extractClassAmountsCents(
  checkIn: CheckInDetail,
): Map<AssetClass, number> {
  const byClass = new Map<AssetClass, number>();

  if (checkIn.positions.length > 0) {
    for (const position of checkIn.positions) {
      const cents = sanitizeNonNegativeInt(position.amountCents);
      if (cents === 0) continue;
      byClass.set(
        position.assetClass,
        (byClass.get(position.assetClass) ?? 0) + cents,
      );
    }
    return byClass;
  }

  for (const resultadoClasse of checkIn.motorResult.classes) {
    const cents = sanitizeNonNegativeInt(resultadoClasse.valorCentavos);
    if (cents === 0) continue;
    byClass.set(
      resultadoClasse.classe,
      (byClass.get(resultadoClasse.classe) ?? 0) + cents,
    );
  }

  return byClass;
}

function computeAllocationsPctByClass(
  classAmounts: ReadonlyMap<AssetClass, number>,
  totalValueCents: number,
): Partial<Record<AssetClass, number>> {
  const sumAmounts = Array.from(classAmounts.values()).reduce(
    (sum, cents) => sum + cents,
    0,
  );
  const denominator = totalValueCents > 0 ? totalValueCents : sumAmounts;
  if (denominator <= 0) {
    return {};
  }

  const allocations: Partial<Record<AssetClass, number>> = {};
  for (const assetClass of ASSET_CLASSES) {
    const cents = classAmounts.get(assetClass) ?? 0;
    if (cents > 0) {
      allocations[assetClass] = clampPct((cents / denominator) * 100);
    }
  }
  return allocations;
}

function normalizeAdherence(score: number | null): number | null {
  if (score === null || !Number.isFinite(score)) {
    return null;
  }
  return clampPct(score);
}

function computeClassDeltas(
  sorted: ReadonlyArray<CheckInDetail>,
  classAmountsList: ReadonlyArray<ReadonlyMap<AssetClass, number>>,
  allocationsList: ReadonlyArray<Partial<Record<AssetClass, number>>>,
): ClassDelta[] {
  if (sorted.length === 0) {
    return [];
  }

  const latestIdx = sorted.length - 1;
  const currentAmounts = classAmountsList[latestIdx];
  const currentPcts = allocationsList[latestIdx];

  // Single check-in: emit baseline snapshot per active class with zero delta.
  if (sorted.length === 1) {
    const deltas: ClassDelta[] = [];
    for (const assetClass of ASSET_CLASSES) {
      const currentCents = currentAmounts.get(assetClass) ?? 0;
      if (currentCents <= 0) continue;
      const currentPct = currentPcts[assetClass] ?? 0;
      deltas.push({
        assetClass,
        previousCents: currentCents,
        currentCents,
        deltaCents: 0,
        previousPct: currentPct,
        currentPct,
        deltaPct: 0,
      });
    }
    return deltas;
  }

  const previousIdx = sorted.length - 2;
  const previousAmounts = classAmountsList[previousIdx];
  const previousPcts = allocationsList[previousIdx];

  const deltas: ClassDelta[] = [];
  for (const assetClass of ASSET_CLASSES) {
    const previousCents = previousAmounts.get(assetClass) ?? 0;
    const currentCents = currentAmounts.get(assetClass) ?? 0;
    if (previousCents === 0 && currentCents === 0) continue;

    const previousPct = previousPcts[assetClass] ?? 0;
    const currentPct = currentPcts[assetClass] ?? 0;
    deltas.push({
      assetClass,
      previousCents,
      currentCents,
      deltaCents: currentCents - previousCents,
      previousPct,
      currentPct,
      deltaPct: round2(currentPct - previousPct),
    });
  }

  return deltas;
}

/**
 * Computes progress toward investor goals using integer cents and safe division.
 */
export function computeGoalProgress(
  currentValueCents: number,
  goals: ReadonlyArray<InvestorGoal> = [],
): GoalProgress[] {
  const safeCurrent = sanitizeNonNegativeInt(currentValueCents);

  return goals.map((goal) => {
    const target =
      typeof goal.targetAmountCents === "number" &&
      Number.isFinite(goal.targetAmountCents)
        ? sanitizeNonNegativeInt(goal.targetAmountCents)
        : null;

    if (target === null) {
      return {
        title: goal.title,
        targetAmountCents: null,
        currentValueCents: safeCurrent,
        progressPct: null,
        remainingCents: null,
        achieved: false,
        targetDate: goal.targetDate ?? null,
        priority: goal.priority ?? null,
      };
    }

    if (target === 0) {
      return {
        title: goal.title,
        targetAmountCents: 0,
        currentValueCents: safeCurrent,
        progressPct: null,
        remainingCents: 0,
        achieved: true,
        targetDate: goal.targetDate ?? null,
        priority: goal.priority ?? null,
      };
    }

    const rawPct = (safeCurrent / target) * 100;
    const progressPct = clampPct(rawPct);
    const remainingCents = Math.max(0, target - safeCurrent);

    return {
      title: goal.title,
      targetAmountCents: target,
      currentValueCents: safeCurrent,
      progressPct,
      remainingCents,
      achieved: safeCurrent >= target,
      targetDate: goal.targetDate ?? null,
      priority: goal.priority ?? null,
    };
  });
}

function formatGoalProgressLine(goalProgress: ReadonlyArray<GoalProgress>): string | null {
  if (goalProgress.length === 0) return null;

  const items = goalProgress.map((goal) => {
    if (goal.targetAmountCents === null) {
      return `${goal.title} (sem valor-alvo definido)`;
    }
    if (goal.targetAmountCents === 0) {
      return `${goal.title} (meta atingida)`;
    }
    const pctLabel =
      goal.progressPct !== null ? formatPctBR(goal.progressPct) : "n/d";
    const status = goal.achieved
      ? "atingida"
      : `faltam ${formatCentsBRL(goal.remainingCents ?? 0)}`;
    return `${goal.title}: ${pctLabel} de ${formatCentsBRL(goal.targetAmountCents)} (${status})`;
  });

  return `Metas: ${items.join("; ")}.`;
}

/**
 * Generates a concise, factual Portuguese brief of portfolio evolution
 * suitable for injection into the AI advisor context builder.
 */
export function buildAiHistoryBrief(params: {
  summary: PortfolioEvolutionSummary;
  latestContributionCents: number;
  estimatedGainFromPreviousCents: number | null;
  estimatedGainFromFirstCents: number | null;
  goalProgress: ReadonlyArray<GoalProgress>;
}): string {
  const {
    summary,
    latestContributionCents,
    estimatedGainFromPreviousCents,
    estimatedGainFromFirstCents,
    goalProgress,
  } = params;

  const lines: string[] = [];

  if (summary.totalCheckIns === 0) {
    lines.push("Nenhum check-in histórico registrado até o momento.");
    const goalsLine = formatGoalProgressLine(goalProgress);
    if (goalsLine) lines.push(goalsLine);
    return lines.join("\n");
  }

  if (summary.totalCheckIns === 1) {
    const onlyPoint = summary.points[0];
    const adherencePart =
      summary.latestAdherenceScore !== null
        ? ` e aderência de ${summary.latestAdherenceScore.toFixed(2).replace(".", ",")}/100`
        : "";
    lines.push(
      `Primeiro check-in registrado em ${onlyPoint.referenceMonth}: patrimônio de ${formatCentsBRL(summary.latestTotalCents)}, aporte de ${formatCentsBRL(latestContributionCents)}${adherencePart}. Sem check-in anterior para comparação.`,
    );
    const goalsLine = formatGoalProgressLine(goalProgress);
    if (goalsLine) lines.push(goalsLine);
    return lines.join("\n");
  }

  const firstPoint = summary.points[0];
  const previousPoint = summary.points[summary.points.length - 2];
  const latestPoint = summary.points[summary.points.length - 1];

  lines.push(
    `Histórico com ${summary.totalCheckIns} check-ins (${firstPoint.referenceMonth} a ${latestPoint.referenceMonth}). Patrimônio atual: ${formatCentsBRL(summary.latestTotalCents)}.`,
  );

  if (summary.deltaFromPreviousCents !== null) {
    const pctSegment =
      summary.deltaFromPreviousPct !== null
        ? ` (${formatSignedPctBR(summary.deltaFromPreviousPct)})`
        : "";
    const gainSegment =
      estimatedGainFromPreviousCents !== null
        ? ` e ganho estimado sem aporte de ${formatSignedCentsBRL(estimatedGainFromPreviousCents)}`
        : "";
    lines.push(
      `Último período (${previousPoint.referenceMonth} -> ${latestPoint.referenceMonth}): variação de ${formatSignedCentsBRL(summary.deltaFromPreviousCents)}${pctSegment}, aporte de ${formatCentsBRL(latestContributionCents)}${gainSegment}.`,
    );
  }

  if (summary.deltaFromFirstCents !== null) {
    const firstPctSegment =
      summary.deltaFromFirstPct !== null
        ? ` (${formatSignedPctBR(summary.deltaFromFirstPct)})`
        : "";
    const firstGainSegment =
      estimatedGainFromFirstCents !== null
        ? ` e ganho estimado sem aportes no intervalo de ${formatSignedCentsBRL(estimatedGainFromFirstCents)}`
        : "";
    lines.push(
      `Evolução acumulada (${firstPoint.referenceMonth} -> ${latestPoint.referenceMonth}): ${formatSignedCentsBRL(summary.deltaFromFirstCents)}${firstPctSegment}, total de aportes registrados de ${formatCentsBRL(summary.totalContributedCents)}${firstGainSegment}.`,
    );
  }

  if (summary.latestAdherenceScore !== null) {
    const adherenceStr = summary.latestAdherenceScore
      .toFixed(2)
      .replace(".", ",");
    const adherenceDeltaStr =
      summary.adherenceDeltaFromPrevious !== null
        ? ` (${formatSignedPpBR(summary.adherenceDeltaFromPrevious)} vs. check-in anterior)`
        : "";
    lines.push(`Aderência atual: ${adherenceStr}/100${adherenceDeltaStr}.`);
  }

  const topMovers = [...summary.classDeltas]
    .filter((delta) => delta.deltaCents !== 0 || delta.deltaPct !== 0)
    .sort((a, b) => Math.abs(b.deltaCents) - Math.abs(a.deltaCents))
    .slice(0, 3);

  if (topMovers.length > 0) {
    const moverDescriptions = topMovers.map(
      (delta) =>
        `${ASSET_CLASS_LABELS[delta.assetClass]} ${formatSignedCentsBRL(delta.deltaCents)} (${formatSignedPpBR(delta.deltaPct)})`,
    );
    lines.push(`Principais variações por classe: ${moverDescriptions.join("; ")}.`);
  }

  const goalsLine = formatGoalProgressLine(goalProgress);
  if (goalsLine) {
    lines.push(goalsLine);
  }

  return lines.join("\n");
}

/**
 * Pure portfolio evolution analytics engine operating strictly on integer cents.
 *
 * Returns a `PortfolioEvolutionResult` that strictly conforms to and extends
 * `PortfolioEvolutionSummarySchema` (validated via Zod at runtime), enriched
 * with period-level contribution vs. estimated gain breakdown, goal progress,
 * and a factual Portuguese `aiHistoryBrief` for the AI advisor context.
 */
export function computePortfolioEvolution(
  checkIns: ReadonlyArray<CheckInDetail>,
  profile?: EvolutionProfileContext,
): PortfolioEvolutionResult {
  const sorted = sortCheckInsChronologically(checkIns);
  const totalCheckIns = sorted.length;

  const classAmountsList = sorted.map((item) => extractClassAmountsCents(item));
  const allocationsList = sorted.map((item, idx) =>
    computeAllocationsPctByClass(
      classAmountsList[idx],
      sanitizeNonNegativeInt(item.totalValueCents),
    ),
  );

  const points: PortfolioEvolutionPoint[] = [];
  const periodMetrics: PortfolioPeriodMetric[] = [];

  let cumulativeContributionsCents = 0;
  let contributionsSinceFirstCents = 0;

  for (let i = 0; i < sorted.length; i++) {
    const current = sorted[i];
    const totalValueCents = sanitizeNonNegativeInt(current.totalValueCents);
    const contributionCents = sanitizeNonNegativeInt(current.contributionCents);
    const adherenceScore = normalizeAdherence(current.adherenceScore);

    cumulativeContributionsCents += contributionCents;
    if (i > 0) {
      contributionsSinceFirstCents += contributionCents;
    }

    points.push({
      checkInId: current.id,
      referenceMonth: current.referenceMonth,
      createdAt: current.createdAt,
      totalValueCents,
      contributionCents,
      adherenceScore,
      allocationsByClass: allocationsList[i],
    });

    if (i === 0) {
      periodMetrics.push({
        checkInId: current.id,
        referenceMonth: current.referenceMonth,
        createdAt: current.createdAt,
        totalValueCents,
        contributionCents,
        cumulativeContributionsCents,
        periodDeltaCents: null,
        periodDeltaPct: null,
        estimatedPeriodGainCents: null,
        estimatedCumulativeGainCents: 0,
        adherenceScore,
      });
    } else {
      const previousTotalCents = points[i - 1].totalValueCents;
      const firstTotalCents = points[0].totalValueCents;
      const periodDeltaCents = totalValueCents - previousTotalCents;
      const periodDeltaPct = safeDeltaPct(totalValueCents, previousTotalCents);
      const estimatedPeriodGainCents = periodDeltaCents - contributionCents;
      const estimatedCumulativeGainCents =
        totalValueCents - firstTotalCents - contributionsSinceFirstCents;

      periodMetrics.push({
        checkInId: current.id,
        referenceMonth: current.referenceMonth,
        createdAt: current.createdAt,
        totalValueCents,
        contributionCents,
        cumulativeContributionsCents,
        periodDeltaCents,
        periodDeltaPct,
        estimatedPeriodGainCents,
        estimatedCumulativeGainCents,
        adherenceScore,
      });
    }
  }

  const latestPoint = totalCheckIns > 0 ? points[totalCheckIns - 1] : null;
  const previousPoint = totalCheckIns >= 2 ? points[totalCheckIns - 2] : null;
  const firstPoint = totalCheckIns > 0 ? points[0] : null;

  const latestTotalCents = latestPoint ? latestPoint.totalValueCents : 0;
  const latestContributionCents = latestPoint
    ? latestPoint.contributionCents
    : 0;
  const previousTotalCents = previousPoint
    ? previousPoint.totalValueCents
    : null;

  const deltaFromPreviousCents =
    latestPoint && previousPoint
      ? latestPoint.totalValueCents - previousPoint.totalValueCents
      : null;
  const deltaFromPreviousPct =
    latestPoint && previousPoint
      ? safeDeltaPct(latestPoint.totalValueCents, previousPoint.totalValueCents)
      : null;

  const deltaFromFirstCents =
    latestPoint && firstPoint && totalCheckIns >= 2
      ? latestPoint.totalValueCents - firstPoint.totalValueCents
      : null;
  const deltaFromFirstPct =
    latestPoint && firstPoint && totalCheckIns >= 2
      ? safeDeltaPct(latestPoint.totalValueCents, firstPoint.totalValueCents)
      : null;

  const latestAdherenceScore = latestPoint ? latestPoint.adherenceScore : null;
  const adherenceDeltaFromPrevious =
    latestPoint &&
    previousPoint &&
    latestPoint.adherenceScore !== null &&
    previousPoint.adherenceScore !== null
      ? round2(latestPoint.adherenceScore - previousPoint.adherenceScore)
      : null;

  const classDeltas = computeClassDeltas(
    sorted,
    classAmountsList,
    allocationsList,
  );

  const baseSummary: PortfolioEvolutionSummary =
    PortfolioEvolutionSummarySchema.parse({
      totalCheckIns,
      latestTotalCents,
      previousTotalCents,
      deltaFromPreviousCents,
      deltaFromPreviousPct,
      deltaFromFirstCents,
      deltaFromFirstPct,
      totalContributedCents: cumulativeContributionsCents,
      latestAdherenceScore,
      adherenceDeltaFromPrevious,
      classDeltas,
      points,
    });

  const estimatedGainFromPreviousCents =
    deltaFromPreviousCents !== null
      ? deltaFromPreviousCents - latestContributionCents
      : null;
  const estimatedGainFromFirstCents =
    deltaFromFirstCents !== null
      ? deltaFromFirstCents - contributionsSinceFirstCents
      : null;

  const goalProgress = computeGoalProgress(
    latestTotalCents,
    profile?.goals ?? [],
  );

  const aiHistoryBrief = buildAiHistoryBrief({
    summary: baseSummary,
    latestContributionCents,
    estimatedGainFromPreviousCents,
    estimatedGainFromFirstCents,
    goalProgress,
  });

  return {
    ...baseSummary,
    latestContributionCents,
    contributionsSinceFirstCents,
    estimatedGainFromPreviousCents,
    estimatedGainFromFirstCents,
    periodMetrics,
    goalProgress,
    aiHistoryBrief,
  };
}
