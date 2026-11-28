import { describe, expect, it } from "vitest";
import { normalizarMes, projetarMeta, rotuloMes, somarMeses } from "@/lib/goals/projecao";

const BASE = {
  valorInicialCentavos: 1_200_000,
  aporteMensalCentavos: 150_000,
  taxaAnualPct: 0,
  mesBase: "2026-11",
};

describe("projeção de metas", () => {
  it("aceita prazo em 12/2027 e 2027-12", () => {
    expect(normalizarMes("12/2027")).toBe("2027-12");
    expect(normalizarMes("2027-12")).toBe("2027-12");
    expect(normalizarMes("13/2027")).toBeNull();
    expect(normalizarMes(undefined)).toBeNull();
  });

  it("soma meses virando o ano e formata mês/ano", () => {
    expect(somarMeses("2026-11", 2)).toBe("2027-01");
    expect(somarMeses("2026-12", 12)).toBe("2027-12");
    expect(rotuloMes("2028-03")).toBe("mar/2028");
  });

  it("no prazo, depois do prazo, nunca e já alcançada", () => {
    expect(projetarMeta({ ...BASE, metaCentavos: 1_500_000, prazo: "12/2027" })).toEqual({
      tipo: "no_prazo",
      mes: "2027-01",
    });
    expect(projetarMeta({ ...BASE, metaCentavos: 6_000_000, prazo: "2026-12" })).toEqual({
      tipo: "depois_do_prazo",
      mes: "2029-07",
      prazo: "2026-12",
    });
    expect(projetarMeta({ ...BASE, aporteMensalCentavos: 0, metaCentavos: 1_500_000 })).toEqual({
      tipo: "nunca",
    });
    expect(projetarMeta({ ...BASE, metaCentavos: 1_000_000 })).toEqual({ tipo: "alcancada" });
  });

  it("taxa em % ao ano: 12% faz chegar antes que só com aportes", () => {
    const semJuros = projetarMeta({ ...BASE, metaCentavos: 6_000_000 });
    const comJuros = projetarMeta({ ...BASE, taxaAnualPct: 12, metaCentavos: 6_000_000 });
    expect(semJuros.tipo === "no_prazo" && comJuros.tipo === "no_prazo").toBe(true);
    if (semJuros.tipo === "no_prazo" && comJuros.tipo === "no_prazo") {
      expect(comJuros.mes < semJuros.mes).toBe(true);
    }
  });
});
