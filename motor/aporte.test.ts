import { describe, it, expect } from "vitest";
import { somarAlocacao } from "./alocacao";
import {
  calcularDeficits,
  distribuirAporte,
  repartirProporcional,
} from "./aporte";

describe("repartirProporcional", () => {
  it("divide exatamente quando a conta e redonda", () => {
    expect(repartirProporcional(1000, { acoes: 3, fiis: 1 })).toEqual({ acoes: 750, fiis: 250 });
  });

  it("a sobra do arredondamento vai para a classe de maior peso", () => {
    //100 em 3 partes iguais-ish: 33,33 / 33,33 / 33,34 -> base 33+33+33 = 99, sobra 1
    const partes = repartirProporcional(100, {
      renda_fixa_pos: 33.33,
      acoes: 33.33,
      internacional: 33.34,
    });
    expect(partes).toEqual({ renda_fixa_pos: 33, acoes: 33, internacional: 34 });
    expect(somarAlocacao(partes)).toBe(100);
  });

  it("empate de peso: a sobra vai para a primeira classe na ordem padrao", () => {
    const partes = repartirProporcional(10, { acoes: 1, renda_fixa_pos: 1, fiis: 1 });
    expect(partes).toEqual({ renda_fixa_pos: 4, acoes: 3, fiis: 3 });
  });

  it("devolve vazio sem total ou sem pesos positivos", () => {
    expect(repartirProporcional(0, { acoes: 1 })).toEqual({});
    expect(repartirProporcional(100, { acoes: 0 })).toEqual({});
  });

  it("a soma sempre fecha no total, mesmo com valores quebrados", () => {
    const pesos = { renda_fixa_pos: 7.3, acoes: 1.9, fiis: 3.3, cripto: 0.7, caixa: 11.1 };
    for (const total of [1, 7, 99, 1001, 123457]) {
      expect(somarAlocacao(repartirProporcional(total, pesos))).toBe(total);
    }
  });
});

describe("calcularDeficits", () => {
  it("calcula quanto falta para cada classe depois do aporte", () => {
    //total pos aporte = 1.100.000; ideal acoes 30% = 330.000, tem 200.000 -> falta 130.000
    const deficits = calcularDeficits(
      { renda_fixa_pos: 700_000, acoes: 200_000, fiis: 100_000 },
      { renda_fixa_pos: 50, acoes: 30, fiis: 20 },
      100_000,
    );
    expect(deficits.renda_fixa_pos).toBeUndefined(); //ideal 550.000 < 700.000
    expect(deficits.acoes).toBeCloseTo(130_000);
    expect(deficits.fiis).toBeCloseTo(120_000);
  });
});

describe("distribuirAporte", () => {
  it("nunca da aporte para classe acima do alvo e fecha a soma", () => {
    const aporte = distribuirAporte(
      { renda_fixa_pos: 700_000, acoes: 200_000, fiis: 100_000 },
      { renda_fixa_pos: 50, acoes: 30, fiis: 20 },
      100_000,
    );
    expect(aporte.renda_fixa_pos).toBeUndefined();
    //deficits 130.000 e 120.000 -> 52% e 48% do aporte
    expect(aporte).toEqual({ acoes: 52_000, fiis: 48_000 });
  });

  it("aporte zero nao distribui nada", () => {
    expect(distribuirAporte({ acoes: 100 }, { acoes: 100 }, 0)).toEqual({});
  });

  it("sem deficit, divide na proporcao do que ja existe", () => {
    //alvo vazio (ex.: tudo excluido) com carteira existente
    expect(distribuirAporte({ acoes: 300, fiis: 100 }, {}, 100)).toEqual({ acoes: 75, fiis: 25 });
  });

  it("carteira e alvo vazios: tudo na renda fixa pos", () => {
    expect(distribuirAporte({}, {}, 5_000)).toEqual({ renda_fixa_pos: 5_000 });
  });

  it("carteira vazia com alvo: segue o alvo", () => {
    expect(distribuirAporte({}, { acoes: 60, fiis: 40 }, 1_000)).toEqual({ acoes: 600, fiis: 400 });
  });
});
