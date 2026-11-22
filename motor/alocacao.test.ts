import { describe, it, expect } from "vitest";
import { calcularAlocacao } from "./alocacao";

describe("calcularAlocacao", () => {
  it("devolve objeto vazio para carteira vazia", () => {
    expect(calcularAlocacao([])).toEqual({});
  });

  it("devolve 100% quando só tem uma classe", () => {
    const carteira = [
      { nome: "PETR4", classe: "acoes" as const, valorCentavos: 50000 },
    ];
    expect(calcularAlocacao(carteira)).toEqual({ acoes: 100 });
  });

  it("soma ativos da mesma classe e calcula o percentual de cada uma", () => {
    const carteira = [
      { nome: "Tesouro Selic", classe: "renda_fixa_pos" as const, valorCentavos: 60000 },
      { nome: "CDB Banco X", classe: "renda_fixa_pos" as const, valorCentavos: 15000 },
      { nome: "PETR4", classe: "acoes" as const, valorCentavos: 25000 },
    ];
    expect(calcularAlocacao(carteira)).toEqual({ renda_fixa_pos: 75, acoes: 25 });
  });

  it("devolve objeto vazio quando todos os ativos valem zero", () => {
    const carteira = [
      { nome: "Ativo zerado", classe: "caixa" as const, valorCentavos: 0 },
    ];
    expect(calcularAlocacao(carteira)).toEqual({});
  });
});