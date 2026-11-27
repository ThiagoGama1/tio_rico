import { describe, it, expect } from "vitest";
import { arredondar2, centavosValidos, limitar } from "./numeros";

describe("arredondar2", () => {
  it("arredonda para 2 casas", () => {
    expect(arredondar2(33.3333)).toBe(33.33);
    expect(arredondar2(66.6666)).toBe(66.67);
  });

  it("corrige o erro de ponto flutuante em 1.005", () => {
    expect(arredondar2(1.005)).toBe(1.01);
  });
});

describe("limitar", () => {
  it("prende o valor no intervalo", () => {
    expect(limitar(120, 0, 100)).toBe(100);
    expect(limitar(-5, 0, 100)).toBe(0);
    expect(limitar(42, 0, 100)).toBe(42);
  });
});

describe("centavosValidos", () => {
  it("arredonda, zera negativos e valores invalidos", () => {
    expect(centavosValidos(100.6)).toBe(101);
    expect(centavosValidos(-50)).toBe(0);
    expect(centavosValidos(Number.NaN)).toBe(0);
  });
});
