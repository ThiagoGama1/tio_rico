import { describe, it, expect } from "vitest";
import { ResultadoMotorSchema } from "@/lib/types/domain";
import { gerarDiagnostico, VERSAO_MOTOR } from "./diagnostico";
import { alocacaoAlvo } from "./alvo";
import type { EntradaMotor } from "./tipos";

const INDICADORES = { selicPct: 14.75, cdiPct: 14.65, ipca12mPct: 4.85 };

function entrada(parcial: Partial<EntradaMotor>): EntradaMotor {
  return {
    carteira: [],
    perfil: { tipo: "moderado", excluir: [] },
    alvo: {},
    aporteCentavos: 0,
    horizonteMeses: 60,
    indicadores: INDICADORES,
    ...parcial,
  };
}

function linha(resultado: ReturnType<typeof gerarDiagnostico>, classe: string) {
  return resultado.classes.find((c) => c.classe === classe);
}

function somaAportes(resultado: ReturnType<typeof gerarDiagnostico>): number {
  return resultado.classes.reduce((soma, c) => soma + c.aporteCentavos, 0);
}

describe("gerarDiagnostico", () => {
  //mesmo cenario do teste principal do adaptador provisorio
  const cenario = entrada({
    carteira: [
      { nome: "Tesouro Selic 2029", classe: "renda_fixa_pos", valorCentavos: 700_000, indexador: "SELIC", taxaIndexador: 100 },
      { nome: "BOVA11", classe: "acoes", valorCentavos: 200_000 },
      { nome: "HGLG11", classe: "fiis", valorCentavos: 100_000 },
    ],
    alvo: { renda_fixa_pos: 50, acoes: 30, fiis: 20 },
    aporteCentavos: 100_000,
  });

  it("calcula totais, desvios e aderencia", () => {
    const r = gerarDiagnostico(cenario);

    expect(r.versao).toBe(VERSAO_MOTOR);
    expect(r.totalCentavos).toBe(1_000_000);
    expect(r.aporteCentavos).toBe(100_000);
    expect(r.totalPosAporteCentavos).toBe(1_100_000);

    expect(linha(r, "renda_fixa_pos")?.atualPct).toBeCloseTo(70);
    expect(linha(r, "acoes")?.desvioPct).toBeCloseTo(-10);
    //|70-50| + |20-30| + |10-20| = 40 -> 100 - 20 = 80
    expect(r.aderencia).toBeCloseTo(80);
  });

  it("nao da aporte para quem esta acima do alvo e fecha a soma exata", () => {
    const r = gerarDiagnostico(cenario);

    expect(linha(r, "renda_fixa_pos")?.aporteCentavos).toBe(0);
    expect(linha(r, "acoes")?.aporteCentavos).toBe(52_000);
    expect(linha(r, "fiis")?.aporteCentavos).toBe(48_000);
    expect(somaAportes(r)).toBe(100_000);
    expect(r.aderenciaPosAporte).toBeGreaterThan(r.aderencia);
  });

  it("calcula rendimento nominal, real e juro real por Fisher", () => {
    const r = gerarDiagnostico(cenario);

    //70% Selic (14,75) + 20% acoes (18,25) + 10% FII (IPCA+7,5 = 12,71)
    expect(r.rendimentoAnualPct).toBeCloseTo(15.25, 2);
    expect(r.rendimentoRealPct).toBeCloseTo(((1 + r.rendimentoAnualPct / 100) / 1.0485 - 1) * 100, 2);
    expect(r.juroRealPct).toBeCloseTo(9.44, 2);
  });

  it("o resultado passa no ResultadoMotorSchema do app", () => {
    expect(() => ResultadoMotorSchema.parse(gerarDiagnostico(cenario))).not.toThrow();
  });

  it("aporte que nao divide exato: soma continua fechando no centavo", () => {
    const r = gerarDiagnostico(
      entrada({
        alvo: { renda_fixa_pos: 33.33, acoes: 33.33, internacional: 33.34 },
        aporteCentavos: 100,
      }),
    );
    expect(r.classes.map((c) => c.aporteCentavos)).toEqual([33, 33, 34]);
    expect(somaAportes(r)).toBe(100);
    expect(r.classes.every((c) => Number.isInteger(c.aporteCentavos))).toBe(true);
    expect(() => ResultadoMotorSchema.parse(r)).not.toThrow();
  });

  it("aporte zero e varios ativos na mesma classe", () => {
    const r = gerarDiagnostico(
      entrada({
        carteira: [
          { nome: "CDB A", classe: "renda_fixa_pos", valorCentavos: 300_000, indexador: "CDI", taxaIndexador: 110 },
          { nome: "Tesouro Selic", classe: "renda_fixa_pos", valorCentavos: 200_000, indexador: "SELIC", taxaIndexador: 100 },
        ],
        alvo: { renda_fixa_pos: 100 },
      }),
    );
    expect(r.classes).toHaveLength(1);
    expect(linha(r, "renda_fixa_pos")?.valorCentavos).toBe(500_000);
    expect(r.aporteCentavos).toBe(0);
    expect(somaAportes(r)).toBe(0);
    expect(r.aderencia).toBeCloseTo(100);
    expect(r.aderenciaPosAporte).toBeCloseTo(100);
  });

  it("carteira e alvo vazios, sem aporte: nao quebra", () => {
    const r = gerarDiagnostico(entrada({ perfil: { tipo: "moderado", excluir: [] } }));
    //alvo vazio cai no padrao do perfil, entao as classes do moderado aparecem com 0 atual
    expect(r.totalCentavos).toBe(0);
    expect(r.classes.length).toBeGreaterThan(0);
    expect(r.classes.every((c) => c.atualPct === 0)).toBe(true);
    expect(() => ResultadoMotorSchema.parse(r)).not.toThrow();
  });

  it("alvo salvo vazio usa o alvo padrao do perfil", () => {
    const r = gerarDiagnostico(entrada({ perfil: { tipo: "conservador", excluir: [] }, aporteCentavos: 10_000 }));
    const padrao = alocacaoAlvo({ tipo: "conservador", excluir: [] });
    expect(linha(r, "renda_fixa_pos")?.alvoPct).toBeCloseTo(padrao.renda_fixa_pos ?? 0);
    expect(somaAportes(r)).toBe(10_000);
  });

  it("classe excluida sai do alvo, e o resto e reescalado", () => {
    const r = gerarDiagnostico(
      entrada({
        carteira: [{ nome: "BTC", classe: "cripto", valorCentavos: 10_000 }],
        perfil: { tipo: "arrojado", excluir: ["cripto"] },
        alvo: { acoes: 50, cripto: 50 },
        aporteCentavos: 10_000,
      }),
    );
    //cripto continua aparecendo (o usuario tem), mas com alvo 0 e sem aporte
    expect(linha(r, "cripto")?.alvoPct).toBe(0);
    expect(linha(r, "cripto")?.aporteCentavos).toBe(0);
    expect(linha(r, "acoes")?.alvoPct).toBeCloseTo(100);
    expect(linha(r, "acoes")?.aporteCentavos).toBe(10_000);
  });
});
