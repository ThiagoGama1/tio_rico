import { describe, expect, it } from "vitest";
import {
  AiAnalysisOutputSchema,
  ResultadoMotorSchema,
} from "@/lib/types/domain";

describe("AiAnalysisOutputSchema", () => {
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

describe("ResultadoMotorSchema", () => {
  const resultadoValido = {
    totalCentavos: 1_000_000,
    aporteCentavos: 100_000,
    totalPosAporteCentavos: 1_100_000,
    classes: [
      {
        classe: "renda_fixa_pos",
        valorCentavos: 1_000_000,
        atualPct: 100,
        alvoPct: 50,
        desvioPct: 50,
        aporteCentavos: 0,
        posAportePct: 90.91,
      },
    ],
    aderencia: 50,
    aderenciaPosAporte: 54.55,
    rendimentoAnualPct: 14.65,
    rendimentoRealPct: 9.19,
    juroRealPct: 9.29,
    versao: "motor-v1",
  };

  it("accepts a motor result in the motor's own shape", () => {
    expect(ResultadoMotorSchema.parse(resultadoValido)).toEqual(resultadoValido);
  });

  it("rejects results stored in the old adapter shape", () => {
    const formatoAntigo = {
      totalCurrentCents: 1_000_000,
      allocations: [],
      adherenceScore: 50,
      engineVersion: "fallback-adapter-v1",
    };
    expect(ResultadoMotorSchema.safeParse(formatoAntigo).success).toBe(false);
  });

  it("rejects fractional cents", () => {
    expect(
      ResultadoMotorSchema.safeParse({ ...resultadoValido, aporteCentavos: 10.5 })
        .success,
    ).toBe(false);
  });
});
