import { describe, expect, it } from "vitest";
import {
  classificarMotorResult,
  converterResultadoLegado,
} from "../legado-motor";

const LEGADO = {
  totalCurrentCents: 4_000_000,
  contributionCents: 150_000,
  totalAfterContributionCents: 4_150_000,
  allocations: [
    {
      assetClass: "renda_fixa_pos",
      currentCents: 2_000_000,
      currentPct: 50,
      targetPct: 25,
      deviationPct: 25,
      suggestedContributionCents: 0,
      projectedPctAfterContribution: 48.19,
    },
    {
      assetClass: "fiis",
      currentCents: 2_000_000,
      currentPct: 50,
      targetPct: 75,
      deviationPct: -25,
      suggestedContributionCents: 150_000,
      projectedPctAfterContribution: 51.81,
    },
  ],
  adherenceScore: 75,
  adherenceScoreAfterContribution: 76.81,
  estimatedAnnualYieldPct: 15.2,
  estimatedRealYieldPct: 9.87,
  realInterestRatePct: 9.44,
  engineVersion: "fallback-adapter-v1",
};

describe("converterResultadoLegado", () => {
  it("maps every adapter field to the ResultadoMotor field with the same value", () => {
    expect(converterResultadoLegado(LEGADO)).toEqual({
      totalCentavos: 4_000_000,
      aporteCentavos: 150_000,
      totalPosAporteCentavos: 4_150_000,
      classes: [
        {
          classe: "renda_fixa_pos",
          valorCentavos: 2_000_000,
          atualPct: 50,
          alvoPct: 25,
          desvioPct: 25,
          aporteCentavos: 0,
          posAportePct: 48.19,
        },
        {
          classe: "fiis",
          valorCentavos: 2_000_000,
          atualPct: 50,
          alvoPct: 75,
          desvioPct: -25,
          aporteCentavos: 150_000,
          posAportePct: 51.81,
        },
      ],
      aderencia: 75,
      aderenciaPosAporte: 76.81,
      rendimentoAnualPct: 15.2,
      rendimentoRealPct: 9.87,
      juroRealPct: 9.44,
      versao: "fallback-adapter-v1",
    });
  });

  it("returns null when a required adapter field is missing", () => {
    const { adherenceScore: _omitido, ...semAderencia } = LEGADO;
    void _omitido;
    expect(converterResultadoLegado(semAderencia)).toBeNull();
  });

  it("returns null for non-objects", () => {
    expect(converterResultadoLegado(null)).toBeNull();
    expect(converterResultadoLegado("x")).toBeNull();
  });
});

describe("classificarMotorResult", () => {
  it("leaves results already in the current format alone", () => {
    const atual = converterResultadoLegado(LEGADO);
    expect(classificarMotorResult(atual)).toEqual({ tipo: "atual" });
  });

  it("flags adapter results as legacy, with the converted value", () => {
    const r = classificarMotorResult(LEGADO);
    expect(r.tipo).toBe("legado");
  });

  it("flags anything else as invalid", () => {
    expect(classificarMotorResult({ foo: 1 }).tipo).toBe("invalido");
    expect(
      classificarMotorResult({ ...LEGADO, totalCurrentCents: -1 }).tipo,
    ).toBe("invalido");
  });
});
