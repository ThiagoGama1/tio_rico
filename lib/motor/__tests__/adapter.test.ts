import { describe, expect, it } from "vitest";
import {
  FALLBACK_MOTOR_ENGINE_VERSION,
  calculateAdherenceScore,
  calculateFisherRealRatePct,
  calculatePortfolioWithMotor,
} from "@/lib/motor/adapter";
import {
  AiAnalysisOutputSchema,
  MotorCalculationResultSchema,
  type MacroIndicators,
  type MotorCalculationInput,
} from "@/lib/types/domain";

const SAMPLE_MACRO: MacroIndicators = {
  selicMetaAnnual: 14.75,
  selicDate: "2026-05-01",
  cdiAnnual: 14.65,
  cdiDaily: 0.0542,
  cdiDate: "2026-05-01",
  ipcaMonthly: 0.45,
  ipca12m: 5.0,
  ipcaDate: "2026-04-01",
  ipcaHistory: [
    { date: "2026-03-01", value: 0.51 },
    { date: "2026-04-01", value: 0.45 },
  ],
  source: "bcb_sgs",
  fetchedAt: "2026-05-02T12:00:00.000Z",
  isStale: false,
};

describe("calculateFisherRealRatePct", () => {
  it("computes real rate via Fisher equation (1+nominal)/(1+inflation)-1", () => {
    // (1.1475 / 1.05 - 1) * 100 = 9.2857... -> 9.29
    expect(calculateFisherRealRatePct(14.75, 5.0)).toBe(9.29);
    // (1.10 / 1.10 - 1) * 100 = 0
    expect(calculateFisherRealRatePct(10, 10)).toBe(0);
  });

  it("handles negative or zero inflation safely", () => {
    expect(calculateFisherRealRatePct(10, 0)).toBe(10);
    expect(calculateFisherRealRatePct(10, -2)).toBe(12.24);
  });
});

describe("calculateAdherenceScore", () => {
  it("returns 100 for exact alignment and 0 for completely disjoint allocation", () => {
    expect(
      calculateAdherenceScore([
        { currentPct: 60, targetPct: 60 },
        { currentPct: 40, targetPct: 40 },
      ]),
    ).toBe(100);

    expect(
      calculateAdherenceScore([
        { currentPct: 100, targetPct: 0 },
        { currentPct: 0, targetPct: 100 },
      ]),
    ).toBe(0);
  });

  it("applies 100 - sum(|deviationPct|) / 2", () => {
    // |70-50| + |30-50| = 40 -> 100 - 20 = 80
    expect(
      calculateAdherenceScore([
        { currentPct: 70, targetPct: 50 },
        { currentPct: 30, targetPct: 50 },
      ]),
    ).toBe(80);
  });
});

describe("calculatePortfolioWithMotor", () => {
  it("computes totals, deviations, adherence, Fisher real rate, and exact cent contribution allocation", () => {
    const input: MotorCalculationInput = {
      riskProfile: "moderado",
      horizonMonths: 60,
      positions: [
        {
          name: "Tesouro Selic 2029",
          assetClass: "renda_fixa_pos",
          amountCents: 700_000, // R$ 7.000,00 (70%)
          indexer: "SELIC",
          indexerRate: 100,
        },
        {
          name: "BOVA11",
          assetClass: "acoes",
          amountCents: 200_000, // R$ 2.000,00 (20%)
        },
        {
          name: "HGLG11",
          assetClass: "fiis",
          amountCents: 100_000, // R$ 1.000,00 (10%)
        },
      ],
      targetAllocation: {
        renda_fixa_pos: 50,
        acoes: 30,
        fiis: 20,
      },
      contributionCents: 100_000, // R$ 1.000,00
      macro: SAMPLE_MACRO,
    };

    const result = calculatePortfolioWithMotor(input);

    expect(result.engineVersion).toBe(FALLBACK_MOTOR_ENGINE_VERSION);
    expect(result.totalCurrentCents).toBe(1_000_000);
    expect(result.contributionCents).toBe(100_000);
    expect(result.totalAfterContributionCents).toBe(1_100_000);

    // Adherence before: |70-50| + |20-30| + |10-20| = 40 -> 100 - 20 = 80
    expect(result.adherenceScore).toBe(80);
    // Contribution improves adherence
    expect(result.adherenceScoreAfterContribution).toBeGreaterThan(
      result.adherenceScore,
    );

    // Over-allocated renda_fixa_pos gets 0; under-allocated acoes and fiis split the contribution
    const rfPos = result.allocations.find(
      (a) => a.assetClass === "renda_fixa_pos",
    );
    const acoes = result.allocations.find((a) => a.assetClass === "acoes");
    const fiis = result.allocations.find((a) => a.assetClass === "fiis");

    expect(rfPos?.suggestedContributionCents).toBe(0);
    expect(acoes?.suggestedContributionCents).toBeGreaterThan(0);
    expect(fiis?.suggestedContributionCents).toBeGreaterThan(0);

    const suggestedSum = result.allocations.reduce(
      (sum, item) => sum + item.suggestedContributionCents,
      0,
    );
    expect(suggestedSum).toBe(input.contributionCents);

    expect(result.realInterestRatePct).toBe(9.29);
    expect(result.estimatedAnnualYieldPct).toBeGreaterThan(14);
    expect(result.estimatedRealYieldPct).toBe(
      calculateFisherRealRatePct(
        result.estimatedAnnualYieldPct,
        SAMPLE_MACRO.ipca12m,
      ),
    );
  });

  it("preserves exact integer cent sum on non-divisible contributions (Hamilton apportionment)", () => {
    const input: MotorCalculationInput = {
      riskProfile: "arrojado",
      horizonMonths: 120,
      positions: [],
      targetAllocation: {
        renda_fixa_pos: 33.33,
        acoes: 33.33,
        internacional: 33.34,
      },
      contributionCents: 100, // R$ 1,00 split across 3 classes
      macro: SAMPLE_MACRO,
    };

    const result = calculatePortfolioWithMotor(input);
    const sum = result.allocations.reduce(
      (acc, item) => acc + item.suggestedContributionCents,
      0,
    );

    expect(sum).toBe(100);
    expect(
      result.allocations.map((a) => a.suggestedContributionCents),
    ).toEqual([33, 33, 34]);
    expect(
      result.allocations.every((a) =>
        Number.isInteger(a.suggestedContributionCents),
      ),
    ).toBe(true);
    // |33-33.33| + |33-33.33| + |34-33.34| = 1.32 -> 100 - 0.66 = 99.34
    expect(result.adherenceScoreAfterContribution).toBe(99.34);
    expect(() => MotorCalculationResultSchema.parse(result)).not.toThrow();
  });

  it("handles zero contribution and aggregates multiple positions in the same class", () => {
    const input: MotorCalculationInput = {
      riskProfile: "conservador",
      horizonMonths: 24,
      positions: [
        {
          name: "CDB Banco A",
          assetClass: "renda_fixa_pos",
          amountCents: 300_000,
          indexer: "CDI",
          indexerRate: 110,
        },
        {
          name: "Tesouro Selic",
          assetClass: "renda_fixa_pos",
          amountCents: 200_000,
          indexer: "SELIC",
          indexerRate: 100,
        },
        {
          name: "Tesouro IPCA+",
          assetClass: "renda_fixa_ipca",
          amountCents: 500_000,
          indexer: "IPCA",
          indexerRate: 6.5,
        },
      ],
      targetAllocation: {
        renda_fixa_pos: 50,
        renda_fixa_ipca: 50,
      },
      contributionCents: 0,
      macro: SAMPLE_MACRO,
    };

    const result = calculatePortfolioWithMotor(input);

    expect(result.totalCurrentCents).toBe(1_000_000);
    expect(result.totalAfterContributionCents).toBe(1_000_000);
    expect(result.adherenceScore).toBe(100);
    expect(result.adherenceScoreAfterContribution).toBe(100);
    expect(result.allocations).toHaveLength(2);
    expect(
      result.allocations.every((a) => a.suggestedContributionCents === 0),
    ).toBe(true);
  });

  it("handles empty portfolio and empty target allocation gracefully", () => {
    const input: MotorCalculationInput = {
      riskProfile: "conservador",
      horizonMonths: 12,
      positions: [],
      targetAllocation: {},
      contributionCents: 50_000,
      macro: SAMPLE_MACRO,
    };

    const result = calculatePortfolioWithMotor(input);
    expect(result.totalCurrentCents).toBe(0);
    expect(result.totalAfterContributionCents).toBe(50_000);
    const sum = result.allocations.reduce(
      (acc, item) => acc + item.suggestedContributionCents,
      0,
    );
    expect(sum).toBe(50_000);
  });

  it("validates structured AI output schema with Zod v4", () => {
    const parsed = AiAnalysisOutputSchema.parse({
      resumoExecutivo: "Carteira com boa aderência e foco em renda fixa.",
      diagnosticoAlocacao: "Renda fixa pós-fixada acima do alvo em 20 p.p.",
      evolucaoDesdeUltimoCheckin: "Primeiro check-in registrado.",
      impactoMacroENoticias: "Selic em 14,75% mantém juro real elevado.",
      opcoesDeAjuste: [
        {
          classeAtivo: "acoes",
          acaoSugerida: "Direcionar parte do novo aporte para ações",
          valorSugeridoCentavos: 60_000,
          justificativa: "Classe está 10 p.p. abaixo do alvo definido.",
        },
      ],
      alertas: ["Concentração elevada em renda fixa pós-fixada."],
      fontesConsultadas: [
        {
          titulo: "Copom mantém Selic",
          url: "https://www.bcb.gov.br/",
          fonte: "Banco Central do Brasil",
        },
      ],
      disclaimer:
        "Análise exclusivamente educacional; não constitui recomendação de investimento.",
    });

    expect(parsed.opcoesDeAjuste).toHaveLength(1);
    expect(parsed.opcoesDeAjuste[0].classeAtivo).toBe("acoes");
  });
});
