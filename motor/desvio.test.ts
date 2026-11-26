import { describe, it, expect } from "vitest";
import { calcularAderencia, calcularDesvio } from "./desvio";

describe("calcularDesvio", () => {
  it("calcula atual - alvo em pontos percentuais", () => {
    const desvio = calcularDesvio({ acoes: 16, fiis: 10 }, { acoes: 30, fiis: 20 });
    expect(desvio.acoes).toBeCloseTo(-14);
    expect(desvio.fiis).toBeCloseTo(-10);
  });

  it("inclui classe que so existe no atual ou so no alvo", () => {
    const desvio = calcularDesvio({ cripto: 5 }, { acoes: 100 });
    expect(desvio.cripto).toBeCloseTo(5);
    expect(desvio.acoes).toBeCloseTo(-100);
  });
});

describe("calcularAderencia", () => {
  it("da 100 quando a carteira e igual ao alvo", () => {
    expect(calcularAderencia({ acoes: 40, fiis: 60 }, { acoes: 40, fiis: 60 })).toBeCloseTo(100);
  });

  it("da 0 quando nao ha classe em comum", () => {
    expect(calcularAderencia({ acoes: 100 }, { fiis: 100 })).toBeCloseTo(0);
  });

  it("aplica 100 - soma(|desvio|) / 2", () => {
    //|70-50| + |30-50| = 40 -> 100 - 20 = 80
    expect(
      calcularAderencia({ renda_fixa_pos: 70, acoes: 30 }, { renda_fixa_pos: 50, acoes: 50 }),
    ).toBeCloseTo(80);
  });

  it("carteira vazia contra alvo cheio da 50, nao 0", () => {
    //soma dos desvios = 100 (todo o alvo falta) -> 100 - 50 = 50
    expect(calcularAderencia({}, { acoes: 100 })).toBeCloseTo(50);
  });
});
