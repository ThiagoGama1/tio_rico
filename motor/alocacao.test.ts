import { describe, it, expect } from "vitest";
import {
  ORDEM_CLASSES,
  calcularAlocacao,
  somarAlocacao,
  valoresPorClasse,
} from "./alocacao";

describe("valoresPorClasse", () => {
  it("soma os centavos por classe", () => {
    const carteira = [
      { nome: "A", classe: "acoes" as const, valorCentavos: 100 },
      { nome: "B", classe: "acoes" as const, valorCentavos: 250 },
      { nome: "C", classe: "fiis" as const, valorCentavos: 50 },
    ];
    expect(valoresPorClasse(carteira)).toEqual({ acoes: 350, fiis: 50 });
  });

  it("trata valor negativo como zero", () => {
    const carteira = [{ nome: "X", classe: "caixa" as const, valorCentavos: -10 }];
    expect(valoresPorClasse(carteira)).toEqual({ caixa: 0 });
  });
});

describe("somarAlocacao", () => {
  it("soma os valores e ignora ausentes", () => {
    expect(somarAlocacao({ acoes: 10, fiis: 5 })).toBe(15);
    expect(somarAlocacao({})).toBe(0);
  });
});

describe("ORDEM_CLASSES", () => {
  it("lista as 9 classes, comecando pela renda fixa pos", () => {
    expect(ORDEM_CLASSES).toHaveLength(9);
    expect(ORDEM_CLASSES[0]).toBe("renda_fixa_pos");
  });
});

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