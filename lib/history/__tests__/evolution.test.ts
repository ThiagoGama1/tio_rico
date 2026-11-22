import { describe, expect, it } from "vitest";
import {
  computeGoalProgress,
  computePortfolioEvolution,
  formatCentsBRL,
  formatPctBR,
  formatSignedCentsBRL,
  formatSignedPctBR,
  formatSignedPpBR,
} from "@/lib/history/evolution";
import { calculatePortfolioWithMotor } from "@/lib/motor/adapter";
import {
  PortfolioEvolutionSummarySchema,
  type CheckInDetail,
  type CheckInPositionDetail,
  type InvestorGoal,
  type MacroIndicators,
  type PortfolioPositionInput,
  type ReferenceMonth,
  type TargetAllocation,
} from "@/lib/types/domain";

const SAMPLE_MACRO: MacroIndicators = {
  selicMetaAnnual: 14.25,
  selicDate: "2026-11-14",
  cdiAnnual: 14.15,
  cdiDaily: 0.0525,
  cdiDate: "2026-11-14",
  ipcaMonthly: 0.29,
  ipca12m: 4.55,
  ipcaDate: "2026-10-01",
  ipcaHistory: [
    { date: "2026-09-01", value: 0.31 },
    { date: "2026-10-01", value: 0.29 },
  ],
  source: "bcb_sgs",
  fetchedAt: "2026-11-15T12:00:00.000Z",
  isStale: false,
};

const TARGET_ALLOCATION: TargetAllocation = {
  renda_fixa_pos: 40,
  renda_fixa_ipca: 20,
  acoes: 25,
  fiis: 15,
};

function buildCheckIn(params: {
  id: string;
  referenceMonth: ReferenceMonth;
  createdAt: string;
  contributionCents: number;
  positions: PortfolioPositionInput[];
  adherenceScore?: number | null;
  targetAllocation?: TargetAllocation;
  omitPositionDetails?: boolean;
}): CheckInDetail {
  const target = params.targetAllocation ?? TARGET_ALLOCATION;
  const motorResult = calculatePortfolioWithMotor({
    riskProfile: "moderado",
    horizonMonths: 60,
    positions: params.positions,
    targetAllocation: target,
    contributionCents: params.contributionCents,
    macro: SAMPLE_MACRO,
  });

  const totalValueCents = motorResult.totalCurrentCents;
  const positionDetails: CheckInPositionDetail[] = params.omitPositionDetails
    ? []
    : params.positions.map((pos, index) => ({
        id: `${params.id}-pos-${index + 1}`,
        assetClass: pos.assetClass,
        assetLabel: pos.name,
        amountCents: pos.amountCents,
        allocationPct:
          totalValueCents > 0
            ? Math.round((pos.amountCents / totalValueCents) * 10000) / 100
            : 0,
        targetPct: target[pos.assetClass] ?? 0,
      }));

  return {
    id: params.id,
    profileId: "profile-test",
    referenceMonth: params.referenceMonth,
    userNotes: `Check-in ${params.referenceMonth}`,
    contributionCents: params.contributionCents,
    totalValueCents,
    adherenceScore:
      params.adherenceScore === undefined
        ? motorResult.adherenceScore
        : params.adherenceScore,
    macroSnapshot: SAMPLE_MACRO,
    motorResult,
    aiAnalysis: null,
    newsSources: null,
    positions: positionDetails,
    createdAt: params.createdAt,
  };
}

describe("Brazilian currency & percentage formatters", () => {
  it("formats positive, negative, and zero integer cents deterministically", () => {
    expect(formatCentsBRL(0)).toBe("R$ 0,00");
    expect(formatCentsBRL(50)).toBe("R$ 0,50");
    expect(formatCentsBRL(5_040_000)).toBe("R$ 50.400,00");
    expect(formatCentsBRL(-123_456)).toBe("-R$ 1.234,56");

    expect(formatSignedCentsBRL(0)).toBe("R$ 0,00");
    expect(formatSignedCentsBRL(310_000)).toBe("+R$ 3.100,00");
    expect(formatSignedCentsBRL(-25_000)).toBe("-R$ 250,00");
  });

  it("formats percentages and percentage points with Brazilian comma separator", () => {
    expect(formatPctBR(19.05)).toBe("19,05%");
    expect(formatSignedPctBR(6.55)).toBe("+6,55%");
    expect(formatSignedPctBR(-2.1)).toBe("-2,10%");
    expect(formatSignedPctBR(0)).toBe("0,00%");
    expect(formatSignedPpBR(6.25)).toBe("+6,25 p.p.");
    expect(formatSignedPpBR(-1.5)).toBe("-1,50 p.p.");
  });
});

describe("computePortfolioEvolution", () => {
  it("handles empty check-ins list cleanly and conforms to PortfolioEvolutionSummarySchema", () => {
    const goals: InvestorGoal[] = [
      {
        title: "Reserva de Emergência",
        targetAmountCents: 3_000_000,
        priority: "alta",
      },
    ];

    const result = computePortfolioEvolution([], {
      id: "profile-test",
      goals,
      targetAllocation: TARGET_ALLOCATION,
    });

    expect(() => PortfolioEvolutionSummarySchema.parse(result)).not.toThrow();
    expect(result.totalCheckIns).toBe(0);
    expect(result.latestTotalCents).toBe(0);
    expect(result.previousTotalCents).toBeNull();
    expect(result.deltaFromPreviousCents).toBeNull();
    expect(result.deltaFromPreviousPct).toBeNull();
    expect(result.deltaFromFirstCents).toBeNull();
    expect(result.deltaFromFirstPct).toBeNull();
    expect(result.totalContributedCents).toBe(0);
    expect(result.latestAdherenceScore).toBeNull();
    expect(result.adherenceDeltaFromPrevious).toBeNull();
    expect(result.classDeltas).toEqual([]);
    expect(result.points).toEqual([]);
    expect(result.periodMetrics).toEqual([]);
    expect(result.estimatedGainFromPreviousCents).toBeNull();
    expect(result.estimatedGainFromFirstCents).toBeNull();
    expect(result.goalProgress).toHaveLength(1);
    expect(result.goalProgress[0].progressPct).toBe(0);
    expect(result.goalProgress[0].remainingCents).toBe(3_000_000);
    expect(result.aiHistoryBrief).toContain(
      "Nenhum check-in histórico registrado até o momento.",
    );
    expect(result.aiHistoryBrief).toContain("Reserva de Emergência");
  });

  it("handles a single check-in as baseline with zero class deltas and no comparative deltas", () => {
    const first = buildCheckIn({
      id: "ci-1",
      referenceMonth: "2026-08",
      createdAt: "2026-08-15T14:00:00.000Z",
      contributionCents: 200_000,
      positions: [
        { name: "Tesouro Selic", assetClass: "renda_fixa_pos", amountCents: 600_000 },
        { name: "ETF Ações", assetClass: "acoes", amountCents: 400_000 },
      ],
      adherenceScore: 80,
    });

    const result = computePortfolioEvolution([first]);

    expect(() => PortfolioEvolutionSummarySchema.parse(result)).not.toThrow();
    expect(result.totalCheckIns).toBe(1);
    expect(result.latestTotalCents).toBe(1_000_000);
    expect(result.previousTotalCents).toBeNull();
    expect(result.deltaFromPreviousCents).toBeNull();
    expect(result.deltaFromPreviousPct).toBeNull();
    expect(result.deltaFromFirstCents).toBeNull();
    expect(result.deltaFromFirstPct).toBeNull();
    expect(result.totalContributedCents).toBe(200_000);
    expect(result.latestAdherenceScore).toBe(80);
    expect(result.adherenceDeltaFromPrevious).toBeNull();
    expect(result.estimatedGainFromPreviousCents).toBeNull();
    expect(result.estimatedGainFromFirstCents).toBeNull();

    // Baseline classDeltas have zero change
    expect(result.classDeltas).toEqual([
      {
        assetClass: "renda_fixa_pos",
        previousCents: 600_000,
        currentCents: 600_000,
        deltaCents: 0,
        previousPct: 60,
        currentPct: 60,
        deltaPct: 0,
      },
      {
        assetClass: "acoes",
        previousCents: 400_000,
        currentCents: 400_000,
        deltaCents: 0,
        previousPct: 40,
        currentPct: 40,
        deltaPct: 0,
      },
    ]);

    expect(result.points[0].allocationsByClass).toEqual({
      renda_fixa_pos: 60,
      acoes: 40,
    });
    expect(result.periodMetrics[0]).toMatchObject({
      cumulativeContributionsCents: 200_000,
      periodDeltaCents: null,
      periodDeltaPct: null,
      estimatedPeriodGainCents: null,
      estimatedCumulativeGainCents: 0,
    });
    expect(result.aiHistoryBrief).toContain("Primeiro check-in registrado em 2026-08");
    expect(result.aiHistoryBrief).toContain("R$ 10.000,00");
    expect(result.aiHistoryBrief).toContain("R$ 2.000,00");
    expect(result.aiHistoryBrief).toContain("80,00/100");
  });

  it("sorts unsorted 4-month series chronologically and computes exact integer-cent math", () => {
    const aug = buildCheckIn({
      id: "ci-aug",
      referenceMonth: "2026-08",
      createdAt: "2026-08-15T14:00:00.000Z",
      contributionCents: 200_000, // R$ 2.000,00
      positions: [
        { name: "Tesouro Selic", assetClass: "renda_fixa_pos", amountCents: 2_520_000 },
        { name: "Tesouro IPCA+", assetClass: "renda_fixa_ipca", amountCents: 630_000 },
        { name: "ETF Ações", assetClass: "acoes", amountCents: 630_000 },
        { name: "Cesta FIIs", assetClass: "fiis", amountCents: 420_000 },
      ], // Total: 4_200_000 (R$ 42.000,00)
      adherenceScore: 80,
    });

    const sep = buildCheckIn({
      id: "ci-sep",
      referenceMonth: "2026-09",
      createdAt: "2026-09-15T14:00:00.000Z",
      contributionCents: 200_000, // R$ 2.000,00 -> delta +250_000, gain +50_000
      positions: [
        { name: "Tesouro Selic", assetClass: "renda_fixa_pos", amountCents: 2_450_000 },
        { name: "Tesouro IPCA+", assetClass: "renda_fixa_ipca", amountCents: 750_000 },
        { name: "ETF Ações", assetClass: "acoes", amountCents: 760_000 },
        { name: "Cesta FIIs", assetClass: "fiis", amountCents: 490_000 },
      ], // Total: 4_450_000 (R$ 44.500,00)
      adherenceScore: 84.5,
    });

    const oct = buildCheckIn({
      id: "ci-oct",
      referenceMonth: "2026-10",
      createdAt: "2026-10-15T14:00:00.000Z",
      contributionCents: 220_000, // R$ 2.200,00 -> delta +170_000, gain -50_000 (drawdown!)
      positions: [
        { name: "Tesouro Selic", assetClass: "renda_fixa_pos", amountCents: 2_310_000 },
        { name: "Tesouro IPCA+", assetClass: "renda_fixa_ipca", amountCents: 850_000 },
        { name: "ETF Ações", assetClass: "acoes", amountCents: 880_000 },
        { name: "Cesta FIIs", assetClass: "fiis", amountCents: 580_000 },
      ], // Total: 4_620_000 (R$ 46.200,00)
      adherenceScore: 88.25,
    });

    const nov = buildCheckIn({
      id: "ci-nov",
      referenceMonth: "2026-11",
      createdAt: "2026-11-15T14:00:00.000Z",
      contributionCents: 250_000, // R$ 2.500,00 -> delta +380_000, gain +130_000
      positions: [
        { name: "Tesouro Selic", assetClass: "renda_fixa_pos", amountCents: 2_250_000 },
        { name: "Tesouro IPCA+", assetClass: "renda_fixa_ipca", amountCents: 950_000 },
        { name: "ETF Ações", assetClass: "acoes", amountCents: 1_100_000 },
        { name: "Cesta FIIs", assetClass: "fiis", amountCents: 700_000 },
      ], // Total: 5_000_000 (R$ 50.000,00)
      adherenceScore: 94.5,
    });

    // Deliberately unsorted input
    const unsortedInput = [oct, aug, nov, sep];
    const snapshotIdsBefore = unsortedInput.map((c) => c.id);

    const goals: InvestorGoal[] = [
      {
        title: "Reserva de Emergência",
        targetAmountCents: 3_000_000,
        priority: "alta",
      },
      {
        title: "Independência Financeira",
        targetAmountCents: 15_000_000,
        priority: "alta",
      },
    ];

    const result = computePortfolioEvolution(unsortedInput, {
      id: "profile-test",
      goals,
      targetAllocation: TARGET_ALLOCATION,
    });

    // Does not mutate caller array
    expect(unsortedInput.map((c) => c.id)).toEqual(snapshotIdsBefore);

    // Strictly validates against domain Zod schema
    expect(() => PortfolioEvolutionSummarySchema.parse(result)).not.toThrow();

    // Sorted chronologically
    expect(result.points.map((p) => p.referenceMonth)).toEqual([
      "2026-08",
      "2026-09",
      "2026-10",
      "2026-11",
    ]);

    expect(result.totalCheckIns).toBe(4);
    expect(result.latestTotalCents).toBe(5_000_000);
    expect(result.previousTotalCents).toBe(4_620_000);

    // Latest period delta: 5_000_000 - 4_620_000 = +380_000 (+8.23%)
    expect(result.deltaFromPreviousCents).toBe(380_000);
    expect(result.deltaFromPreviousPct).toBe(8.23);
    expect(result.latestContributionCents).toBe(250_000);
    expect(result.estimatedGainFromPreviousCents).toBe(130_000);

    // Overall delta: 5_000_000 - 4_200_000 = +800_000 (+19.05%)
    expect(result.deltaFromFirstCents).toBe(800_000);
    expect(result.deltaFromFirstPct).toBe(19.05);

    // Contributions: total = 870_000, since first = 200_000 + 220_000 + 250_000 = 670_000
    expect(result.totalContributedCents).toBe(870_000);
    expect(result.contributionsSinceFirstCents).toBe(670_000);

    // Overall estimated gain excluding contributions: 800_000 - 670_000 = +130_000
    expect(result.estimatedGainFromFirstCents).toBe(130_000);

    // Telescoping sum invariant across periods (+50_000 + -50_000 + +130_000 = +130_000)
    const periodGains = result.periodMetrics.map(
      (m) => m.estimatedPeriodGainCents,
    );
    expect(periodGains).toEqual([null, 50_000, -50_000, 130_000]);
    const summedGains = periodGains.reduce<number>(
      (sum, gain) => sum + (gain ?? 0),
      0,
    );
    expect(summedGains).toBe(result.estimatedGainFromFirstCents);
    expect(result.periodMetrics[3].estimatedCumulativeGainCents).toBe(130_000);
    expect(result.periodMetrics[3].cumulativeContributionsCents).toBe(870_000);

    // Adherence progression: 94.5 - 88.25 = +6.25
    expect(result.latestAdherenceScore).toBe(94.5);
    expect(result.adherenceDeltaFromPrevious).toBe(6.25);

    // Goals progress
    expect(result.goalProgress).toEqual([
      {
        title: "Reserva de Emergência",
        targetAmountCents: 3_000_000,
        currentValueCents: 5_000_000,
        progressPct: 100,
        remainingCents: 0,
        achieved: true,
        targetDate: null,
        priority: "alta",
      },
      {
        title: "Independência Financeira",
        targetAmountCents: 15_000_000,
        currentValueCents: 5_000_000,
        progressPct: 33.33,
        remainingCents: 10_000_000,
        achieved: false,
        targetDate: null,
        priority: "alta",
      },
    ]);

    // AI history brief contains exact numbers and zero fluff / NaN
    expect(result.aiHistoryBrief).toContain("Histórico com 4 check-ins (2026-08 a 2026-11)");
    expect(result.aiHistoryBrief).toContain("R$ 50.000,00");
    expect(result.aiHistoryBrief).toContain("+R$ 3.800,00 (+8,23%)");
    expect(result.aiHistoryBrief).toContain("+R$ 1.300,00");
    expect(result.aiHistoryBrief).toContain("+R$ 8.000,00 (+19,05%)");
    expect(result.aiHistoryBrief).toContain("94,50/100 (+6,25 p.p. vs. check-in anterior)");
    expect(result.aiHistoryBrief).toContain("Reserva de Emergência: 100,00% de R$ 30.000,00 (atingida)");
    expect(result.aiHistoryBrief).not.toMatch(/NaN|Infinity|undefined/);
  });

  it("uses createdAt ascending as tie-breaker when two check-ins share the same referenceMonth", () => {
    const earlier = buildCheckIn({
      id: "ci-a",
      referenceMonth: "2026-10",
      createdAt: "2026-10-05T10:00:00.000Z",
      contributionCents: 100_000,
      positions: [
        { name: "Tesouro Selic", assetClass: "renda_fixa_pos", amountCents: 1_000_000 },
      ],
    });
    const later = buildCheckIn({
      id: "ci-b",
      referenceMonth: "2026-10",
      createdAt: "2026-10-25T18:30:00.000Z",
      contributionCents: 150_000,
      positions: [
        { name: "Tesouro Selic", assetClass: "renda_fixa_pos", amountCents: 1_200_000 },
      ],
    });

    const result = computePortfolioEvolution([later, earlier]);
    expect(result.points.map((p) => p.checkInId)).toEqual(["ci-a", "ci-b"]);
    expect(result.deltaFromPreviousCents).toBe(200_000);
    expect(result.deltaFromPreviousPct).toBe(20);
  });

  it("avoids division-by-zero, NaN, and Infinity when previous or first portfolio value is zero", () => {
    const emptyMonth = buildCheckIn({
      id: "ci-zero",
      referenceMonth: "2026-08",
      createdAt: "2026-08-01T10:00:00.000Z",
      contributionCents: 0,
      positions: [],
      adherenceScore: null,
    });
    const fundedMonth = buildCheckIn({
      id: "ci-funded",
      referenceMonth: "2026-09",
      createdAt: "2026-09-01T10:00:00.000Z",
      contributionCents: 500_000,
      positions: [
        { name: "Tesouro Selic", assetClass: "renda_fixa_pos", amountCents: 500_000 },
      ],
      adherenceScore: 60,
    });

    const result = computePortfolioEvolution([emptyMonth, fundedMonth]);

    expect(() => PortfolioEvolutionSummarySchema.parse(result)).not.toThrow();
    expect(result.previousTotalCents).toBe(0);
    expect(result.deltaFromPreviousCents).toBe(500_000);
    expect(result.deltaFromPreviousPct).toBeNull();
    expect(result.deltaFromFirstCents).toBe(500_000);
    expect(result.deltaFromFirstPct).toBeNull();
    expect(result.estimatedGainFromPreviousCents).toBe(0);
    expect(result.adherenceDeltaFromPrevious).toBeNull();
    expect(result.points[0].allocationsByClass).toEqual({});
    expect(result.points[1].allocationsByClass).toEqual({
      renda_fixa_pos: 100,
    });
    expect(result.aiHistoryBrief).not.toMatch(/NaN|Infinity|undefined/);
  });

  it("computes classDeltas accurately when classes are added, removed, or aggregated from multiple positions", () => {
    const prev = buildCheckIn({
      id: "ci-prev",
      referenceMonth: "2026-09",
      createdAt: "2026-09-10T10:00:00.000Z",
      contributionCents: 100_000,
      positions: [
        { name: "CDB Banco A", assetClass: "renda_fixa_pos", amountCents: 400_000 },
        { name: "Tesouro Selic", assetClass: "renda_fixa_pos", amountCents: 200_000 },
        { name: "Bitcoin ETF", assetClass: "cripto", amountCents: 400_000 },
      ], // 60% renda_fixa_pos (600k), 40% cripto (400k) -> Total 1_000_000
      adherenceScore: 70,
    });

    const latest = buildCheckIn({
      id: "ci-latest",
      referenceMonth: "2026-10",
      createdAt: "2026-10-10T10:00:00.000Z",
      contributionCents: 200_000,
      positions: [
        { name: "Tesouro Selic", assetClass: "renda_fixa_pos", amountCents: 720_000 },
        { name: "ETF S&P 500", assetClass: "internacional", amountCents: 480_000 },
      ], // 60% renda_fixa_pos (720k), 40% internacional (480k), cripto removed -> Total 1_200_000
      adherenceScore: 65.5,
    });

    const result = computePortfolioEvolution([prev, latest]);

    expect(result.adherenceDeltaFromPrevious).toBe(-4.5);

    const rfDelta = result.classDeltas.find(
      (d) => d.assetClass === "renda_fixa_pos",
    );
    const intlDelta = result.classDeltas.find(
      (d) => d.assetClass === "internacional",
    );
    const criptoDelta = result.classDeltas.find(
      (d) => d.assetClass === "cripto",
    );

    expect(rfDelta).toEqual({
      assetClass: "renda_fixa_pos",
      previousCents: 600_000,
      currentCents: 720_000,
      deltaCents: 120_000,
      previousPct: 60,
      currentPct: 60,
      deltaPct: 0,
    });

    // Newly added class
    expect(intlDelta).toEqual({
      assetClass: "internacional",
      previousCents: 0,
      currentCents: 480_000,
      deltaCents: 480_000,
      previousPct: 0,
      currentPct: 40,
      deltaPct: 40,
    });

    // Removed class
    expect(criptoDelta).toEqual({
      assetClass: "cripto",
      previousCents: 400_000,
      currentCents: 0,
      deltaCents: -400_000,
      previousPct: 40,
      currentPct: 0,
      deltaPct: -40,
    });
  });

  it("falls back to motorResult.allocations when check-in positions array is empty", () => {
    const checkIn = buildCheckIn({
      id: "ci-motor-fallback",
      referenceMonth: "2026-11",
      createdAt: "2026-11-10T10:00:00.000Z",
      contributionCents: 100_000,
      positions: [
        { name: "Tesouro Selic", assetClass: "renda_fixa_pos", amountCents: 750_000 },
        { name: "ETF Ações", assetClass: "acoes", amountCents: 250_000 },
      ],
      omitPositionDetails: true,
    });

    expect(checkIn.positions).toEqual([]);
    const result = computePortfolioEvolution([checkIn]);
    expect(result.points[0].allocationsByClass).toEqual({
      renda_fixa_pos: 75,
      acoes: 25,
    });
    expect(result.classDeltas).toHaveLength(2);
  });
});

describe("computeGoalProgress", () => {
  it("handles achieved, partial, zero-target, and open-ended goals safely", () => {
    const goals: InvestorGoal[] = [
      {
        title: "Meta Concluída",
        targetAmountCents: 1_000_000,
        targetDate: "2026-12",
        priority: "alta",
      },
      {
        title: "Meta Parcial",
        targetAmountCents: 4_000_000,
        priority: "media",
      },
      {
        title: "Meta Sem Valor",
        priority: "baixa",
      },
      {
        title: "Meta Zero",
        targetAmountCents: 0,
      },
    ];

    const progress = computeGoalProgress(1_500_000, goals);

    expect(progress).toEqual([
      {
        title: "Meta Concluída",
        targetAmountCents: 1_000_000,
        currentValueCents: 1_500_000,
        progressPct: 100,
        remainingCents: 0,
        achieved: true,
        targetDate: "2026-12",
        priority: "alta",
      },
      {
        title: "Meta Parcial",
        targetAmountCents: 4_000_000,
        currentValueCents: 1_500_000,
        progressPct: 37.5,
        remainingCents: 2_500_000,
        achieved: false,
        targetDate: null,
        priority: "media",
      },
      {
        title: "Meta Sem Valor",
        targetAmountCents: null,
        currentValueCents: 1_500_000,
        progressPct: null,
        remainingCents: null,
        achieved: false,
        targetDate: null,
        priority: "baixa",
      },
      {
        title: "Meta Zero",
        targetAmountCents: 0,
        currentValueCents: 1_500_000,
        progressPct: null,
        remainingCents: 0,
        achieved: true,
        targetDate: null,
        priority: null,
      },
    ]);
  });
});
