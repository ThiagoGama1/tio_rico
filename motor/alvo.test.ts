import { describe, it, expect } from "vitest";
import { alocacaoAlvo, excluirEReescalar, resolverAlvo } from "./alvo";

function somar(alocacao: Record<string, number | undefined>): number {
  return Object.values(alocacao).reduce<number>((total, v) => total + (v ?? 0), 0);
}

describe("alocacaoAlvo", () => {
  it("cada perfil soma 100 sem exclusões", () => {
    for (const tipo of ["conservador", "moderado", "arrojado"] as const) {
      expect(somar(alocacaoAlvo({ tipo, excluir: [] }))).toBeCloseTo(100);
    }
  });

  it("remove a classe excluída e redistribui o resto", () => {
    const alvo = alocacaoAlvo({ tipo: "moderado", excluir: ["cripto"] });
    expect(alvo.cripto).toBeUndefined();
    expect(alvo.renda_fixa_pos).toBeCloseTo(30.61, 2);
    expect(somar(alvo)).toBeCloseTo(100);
  });

  it("devolve vazio quando todas as classes são excluídas", () => {
    const alvo = alocacaoAlvo({
      tipo: "conservador",
      excluir: ["renda_fixa_pos", "renda_fixa_ipca", "renda_fixa_pre", "caixa", "fiis", "acoes"],
    });
    expect(alvo).toEqual({});
  });
});

describe("excluirEReescalar", () => {
  it("reescala para somar 100 quando o alvo salvo soma menos", () => {
    const alvo = excluirEReescalar({ acoes: 30, fiis: 30 }, []);
    expect(alvo.acoes).toBeCloseTo(50);
    expect(alvo.fiis).toBeCloseTo(50);
  });

  it("ignora classes com zero", () => {
    expect(excluirEReescalar({ acoes: 0, fiis: 40 }, [])).toEqual({ fiis: 100 });
  });
});

describe("resolverAlvo", () => {
  const perfil = { tipo: "moderado" as const, excluir: [] };

  it("usa o alvo salvo quando ele existe", () => {
    const alvo = resolverAlvo({ renda_fixa_pos: 50, acoes: 30, fiis: 20 }, perfil);
    expect(alvo).toEqual({ renda_fixa_pos: 50, acoes: 30, fiis: 20 });
  });

  it("cai no alvo padrao do perfil quando o salvo vem vazio", () => {
    expect(resolverAlvo({}, perfil)).toEqual(alocacaoAlvo(perfil));
  });

  it("remove do alvo salvo as classes excluidas e reescala", () => {
    const alvo = resolverAlvo(
      { renda_fixa_pos: 50, acoes: 30, cripto: 20 },
      { tipo: "arrojado", excluir: ["cripto"] },
    );
    expect(alvo.cripto).toBeUndefined();
    expect(alvo.renda_fixa_pos).toBeCloseTo(62.5);
    expect(alvo.acoes).toBeCloseTo(37.5);
  });
});