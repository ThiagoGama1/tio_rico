import { describe, it, expect } from "vitest";
import {
  juroRealFisherPct,
  rendimentoAtivoPct,
  rendimentoCarteiraPct,
  rendimentoClassePct,
} from "./rendimento";
import type { Indicadores } from "./tipos";

const IND: Indicadores = { selicPct: 14.75, cdiPct: 14.65, ipca12mPct: 4.85 };

describe("juroRealFisherPct", () => {
  it("usa (1+nominal)/(1+inflacao)-1, nao a subtracao", () => {
    expect(juroRealFisherPct(15, 5)).toBeCloseTo(9.52, 2);
  });

  it("Selic 14,75 contra IPCA 4,85 da 9,44", () => {
    expect(juroRealFisherPct(14.75, 4.85)).toBeCloseTo(9.44, 2);
  });

  it("com inflacao zero o real e igual ao nominal", () => {
    expect(juroRealFisherPct(10, 0)).toBeCloseTo(10);
  });

  it("inflacao <= -100% devolve o nominal sem dividir por zero", () => {
    expect(juroRealFisherPct(10, -100)).toBeCloseTo(10);
  });
});

describe("rendimentoClassePct", () => {
  it("renda fixa pos rende o CDI e caixa 85% do CDI", () => {
    expect(rendimentoClassePct("renda_fixa_pos", IND)).toBeCloseTo(14.65);
    expect(rendimentoClassePct("caixa", IND)).toBeCloseTo(12.45, 2);
  });

  it("IPCA+ e composto, nao somado", () => {
    //(1,0485 * 1,06) - 1 = 11,141%
    expect(rendimentoClassePct("renda_fixa_ipca", IND)).toBeCloseTo(11.14, 2);
  });
});

describe("rendimentoAtivoPct", () => {
  it("110% do CDI", () => {
    const ativo = { nome: "CDB", classe: "renda_fixa_pos" as const, valorCentavos: 1, indexador: "cdi", taxaIndexador: 110 };
    expect(rendimentoAtivoPct(ativo, IND)).toBeCloseTo(16.115, 3);
  });

  it("prefixado usa a taxa direto", () => {
    const ativo = { nome: "LTN", classe: "renda_fixa_pre" as const, valorCentavos: 1, indexador: "PRE", taxaIndexador: 13 };
    expect(rendimentoAtivoPct(ativo, IND)).toBeCloseTo(13);
  });

  it("sem indexador cai na estimativa da classe", () => {
    const ativo = { nome: "BOVA11", classe: "acoes" as const, valorCentavos: 1 };
    expect(rendimentoAtivoPct(ativo, IND)).toBeCloseTo(18.25);
  });

  it("indexador desconhecido cai na estimativa da classe", () => {
    const ativo = { nome: "X", classe: "renda_fixa_pos" as const, valorCentavos: 1, indexador: "TR", taxaIndexador: 100 };
    expect(rendimentoAtivoPct(ativo, IND)).toBeCloseTo(14.65);
  });
});

describe("rendimentoCarteiraPct", () => {
  it("pondera os ativos pelo valor", () => {
    //75% em CDI (14,65) + 25% em acoes (18,25) = 15,55
    const carteira = [
      { nome: "A", classe: "renda_fixa_pos" as const, valorCentavos: 300 },
      { nome: "B", classe: "acoes" as const, valorCentavos: 100 },
    ];
    expect(rendimentoCarteiraPct(carteira, IND, {}, {})).toBeCloseTo(15.55, 2);
  });

  it("carteira vazia: pondera pelo aporte sugerido", () => {
    expect(rendimentoCarteiraPct([], IND, { acoes: 100 }, { fiis: 100 })).toBeCloseTo(18.25);
  });

  it("so alvo: pondera pelo alvo", () => {
    expect(rendimentoCarteiraPct([], IND, {}, { renda_fixa_pos: 100 })).toBeCloseTo(14.65);
  });

  it("nada informado: devolve o CDI", () => {
    expect(rendimentoCarteiraPct([], IND, {}, {})).toBeCloseTo(14.65);
  });
});
