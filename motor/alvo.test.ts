import { describe, it, expect } from "vitest";
import { alocacaoAlvo } from "./alvo";

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