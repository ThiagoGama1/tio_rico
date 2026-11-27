import { describe, it, expect } from "vitest";
import {
  mesesParaMeta,
  projetar,
  projetarSerie,
  taxaMensalEquivalente,
} from "./projecao";

describe("taxaMensalEquivalente", () => {
  it("12% ao ano da ~0,9489% ao mes, nao 1%", () => {
    expect(taxaMensalEquivalente(0.12) * 100).toBeCloseTo(0.9489, 4);
  });

  it("12 meses da taxa mensal voltam a taxa anual", () => {
    expect(Math.pow(1 + taxaMensalEquivalente(0.15), 12) - 1).toBeCloseTo(0.15, 10);
  });
});

describe("projetar", () => {
  it("sem aporte, 12 meses a 12% a.a. rende exatamente 12%", () => {
    expect(projetar(100_000, 0, 0.12, 12)).toBe(112_000);
  });

  it("taxa zero: so soma os aportes", () => {
    expect(projetar(10_000, 1_000, 0, 12)).toBe(22_000);
  });

  it("zero meses devolve o valor inicial", () => {
    expect(projetar(50_000, 1_000, 0.1, 0)).toBe(50_000);
  });

  it("bate com a formula fechada de serie de pagamentos", () => {
    //VF = P(1+i)^n + A * ((1+i)^n - 1) / i
    const i = taxaMensalEquivalente(0.1);
    const n = 60;
    const esperado = 1_000_000 * Math.pow(1 + i, n) + 50_000 * ((Math.pow(1 + i, n) - 1) / i);
    expect(projetar(1_000_000, 50_000, 0.1, n)).toBe(Math.round(esperado));
  });

  it("devolve centavos inteiros", () => {
    expect(Number.isInteger(projetar(12_345, 678, 0.137, 37))).toBe(true);
  });
});

describe("projetarSerie", () => {
  it("tem meses + 1 pontos, comecando no valor inicial", () => {
    const serie = projetarSerie(1_000, 100, 0, 3);
    expect(serie).toEqual([1_000, 1_100, 1_200, 1_300]);
  });
});

describe("mesesParaMeta", () => {
  it("devolve 0 se ja bateu a meta", () => {
    expect(mesesParaMeta(100_000, 0, 0.1, 50_000)).toBe(0);
  });

  it("taxa zero: meta / aporte", () => {
    expect(mesesParaMeta(0, 1_000, 0, 12_000)).toBe(12);
  });

  it("e o primeiro mes em que o saldo passa da meta", () => {
    const meses = mesesParaMeta(0, 100_000, 0.12, 5_000_000);
    expect(meses).not.toBeNull();
    expect(projetar(0, 100_000, 0.12, meses!)).toBeGreaterThanOrEqual(5_000_000);
    expect(projetar(0, 100_000, 0.12, meses! - 1)).toBeLessThan(5_000_000);
  });

  it("null quando nunca alcanca (sem aporte e sem rendimento)", () => {
    expect(mesesParaMeta(1_000, 0, 0, 2_000)).toBeNull();
  });
});
