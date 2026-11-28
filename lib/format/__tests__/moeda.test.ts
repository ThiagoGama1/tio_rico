import { describe, expect, it } from "vitest";
import {
  formatarCentavosParaCampo,
  mascararReais,
  normalizarCampoReais,
  parseReaisParaCentavos,
} from "@/lib/format/moeda";

describe("parseReaisParaCentavos", () => {
  it("trata ponto como milhar: '1.500' é R$ 1.500,00 (bug da #65)", () => {
    expect(parseReaisParaCentavos("1.500")).toBe(150_000);
    expect(parseReaisParaCentavos("1.234.567")).toBe(123_456_700);
  });

  it("aceita vírgula decimal, com ou sem milhar e com R$", () => {
    expect(parseReaisParaCentavos("1.500,50")).toBe(150_050);
    expect(parseReaisParaCentavos("1500,5")).toBe(150_050);
    expect(parseReaisParaCentavos("R$ 30.000,00")).toBe(3_000_000);
    expect(parseReaisParaCentavos("0,99")).toBe(99);
    expect(parseReaisParaCentavos(",5")).toBe(50);
  });

  it("aceita inteiros simples", () => {
    expect(parseReaisParaCentavos("1500")).toBe(150_000);
    expect(parseReaisParaCentavos("0")).toBe(0);
  });

  it("ponto que não forma milhar e vem sem vírgula é decimal", () => {
    expect(parseReaisParaCentavos("10.5")).toBe(1_050);
    expect(parseReaisParaCentavos("10.55")).toBe(1_055);
  });

  it("recusa texto inválido (#47)", () => {
    for (const invalido of ["abc-500", "-500", "1,2,3", "1,234", "1.50.0", "12.3456", "", "  ", "R$", "."]) {
      expect(parseReaisParaCentavos(invalido)).toBeNull();
    }
  });
});

describe("mascararReais (#37)", () => {
  it("agrupa o milhar enquanto digita", () => {
    expect(mascararReais("1")).toBe("1");
    expect(mascararReais("1500")).toBe("1.500");
    expect(mascararReais("1234567")).toBe("1.234.567");
  });

  it("mantém a vírgula e no máximo 2 casas", () => {
    expect(mascararReais("1500,")).toBe("1.500,");
    expect(mascararReais("1500,567")).toBe("1.500,56");
    expect(mascararReais(",5")).toBe("0,5");
  });

  it("refaz o agrupamento quando a pessoa digita pontos", () => {
    expect(mascararReais("1.500")).toBe("1.500");
    expect(mascararReais("15.00")).toBe("1.500");
  });

  it("remove letras, sinais e zeros à esquerda", () => {
    expect(mascararReais("abc-500")).toBe("500");
    expect(mascararReais("007")).toBe("7");
    expect(mascararReais("1,2,3")).toBe("1,23");
  });

  it("o resultado sempre é aceito pelo parser", () => {
    for (const texto of ["1500", "1.500,5", "abc12,345", "000,1"]) {
      expect(parseReaisParaCentavos(mascararReais(texto))).not.toBeNull();
    }
  });
});

describe("formatarCentavosParaCampo / normalizarCampoReais", () => {
  it("formata em pt-BR com 2 casas, sem R$", () => {
    expect(formatarCentavosParaCampo(150_000)).toBe("1.500,00");
    expect(formatarCentavosParaCampo(5)).toBe("0,05");
  });

  it("normaliza o campo ao sair do foco e deixa inválido como está", () => {
    expect(normalizarCampoReais("1.500")).toBe("1.500,00");
    expect(normalizarCampoReais("1500,5")).toBe("1.500,50");
    expect(normalizarCampoReais("abc")).toBe("abc");
    expect(normalizarCampoReais("")).toBe("");
  });
});
