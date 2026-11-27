import { describe, it, expect } from "vitest";
import { ALVOS_POR_PERFIL, alocacaoAlvo, arredondarAlvo, excluirEReescalar, resolverAlvo } from "./alvo";
import { arredondarAlvo as arredondarAlvoDoIndex } from "./index";
import { Classe, TipoPerfil } from "./tipos";

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

describe("excluirEReescalar", () => {
  it("reescala para somar 100 quando o alvo salvo soma menos", () => {
    const alvo = excluirEReescalar({ acoes: 30, fiis: 30 }, []);
    expect(alvo.acoes).toBeCloseTo(50);
    expect(alvo.fiis).toBeCloseTo(50);
  });

  it("ignora classes com zero", () => {
    expect(excluirEReescalar({ acoes: 0, fiis: 40 }, [])).toEqual({ fiis: 100 });
  });
});

describe("resolverAlvo", () => {
  const perfil = { tipo: "moderado" as const, excluir: [] };

  it("usa o alvo salvo quando ele existe", () => {
    const alvo = resolverAlvo({ renda_fixa_pos: 50, acoes: 30, fiis: 20 }, perfil);
    expect(alvo).toEqual({ renda_fixa_pos: 50, acoes: 30, fiis: 20 });
  });

  it("cai no alvo padrao do perfil quando o salvo vem vazio", () => {
    expect(resolverAlvo({}, perfil)).toEqual(alocacaoAlvo(perfil));
  });

  it("remove do alvo salvo as classes excluidas e reescala", () => {
    const alvo = resolverAlvo(
      { renda_fixa_pos: 50, acoes: 30, cripto: 20 },
      { tipo: "arrojado", excluir: ["cripto"] },
    );
    expect(alvo.cripto).toBeUndefined();
    expect(alvo.renda_fixa_pos).toBeCloseTo(62.5);
    expect(alvo.acoes).toBeCloseTo(37.5);
  });
});
describe("arredondarAlvo", () => {
  //soma em unidades inteiras (pontos ou decimos de ponto) para nao depender de ponto flutuante
  function somaEmUnidades(alocacao: Record<string, number | undefined>, casas = 0): number {
    const escala = 10 ** casas;
    return Object.values(alocacao).reduce<number>(
      (total, v) => total + Math.round((v ?? 0) * escala),
      0,
    );
  }

  function soInteiros(alocacao: Record<string, number | undefined>): boolean {
    return Object.values(alocacao).every((v) => Number.isInteger(v));
  }

  const PERFIS: TipoPerfil[] = ["conservador", "moderado", "arrojado"];
  const EXCLUSOES: Classe[][] = [[], ["cripto"], ["acoes", "internacional"], ["renda_fixa_pos", "caixa"]];

  for (const tipo of PERFIS) {
    for (const excluir of EXCLUSOES) {
      it(`${tipo} excluindo [${excluir.join(", ")}]: inteiros que somam exatamente 100`, () => {
        const r = arredondarAlvo(alocacaoAlvo({ tipo, excluir }));
        expect(somaEmUnidades(r)).toBe(100);
        expect(soInteiros(r)).toBe(true);
        for (const classe of excluir) {
          expect(classe in r).toBe(false);
        }
      });
    }
  }

  it("tabela sem exclusoes ja soma 100: devolve os mesmos valores", () => {
    for (const tipo of PERFIS) {
      expect(arredondarAlvo(alocacaoAlvo({ tipo, excluir: [] }))).toEqual(ALVOS_POR_PERFIL[tipo]);
    }
  });

  it("moderado sem cripto: 31/15/10/5/10/21/8 (o maior resto leva a sobra)", () => {
    //sem cripto sobra 98, reescalado: 30,61 / 15,31 / 10,20 / 5,10 / 10,20 / 20,41 / 8,16
    //arredondado para baixo soma 98; os 2 pontos vao para os maiores restos: pos (,61) e acoes (,41)
    expect(arredondarAlvo(alocacaoAlvo({ tipo: "moderado", excluir: ["cripto"] }))).toEqual({
      renda_fixa_pos: 31,
      renda_fixa_ipca: 15,
      renda_fixa_pre: 10,
      caixa: 5,
      fiis: 10,
      acoes: 21,
      internacional: 8,
    });
  });

  it("classes excluidas, zeradas ou ausentes nao aparecem no resultado", () => {
    const r = arredondarAlvo({ acoes: 50, fiis: 0, renda_fixa_pos: 50 });
    expect(r).toEqual({ renda_fixa_pos: 50, acoes: 50 });
    expect("fiis" in r).toBe(false);
  });

  it("alvo vazio, so com zeros ou com valores negativos devolve {}", () => {
    expect(arredondarAlvo({})).toEqual({});
    expect(arredondarAlvo({ acoes: 0, fiis: 0 })).toEqual({});
    expect(arredondarAlvo({ acoes: -10 })).toEqual({});
  });

  it("casas = 1: uma casa decimal e soma exatamente 100", () => {
    const r = arredondarAlvo(alocacaoAlvo({ tipo: "moderado", excluir: ["cripto"] }), 1);
    //30,612 / 15,306 / 10,204 / 5,102 / 10,204 / 20,408 / 8,163 -> sobra 0,1 vai para internacional (,63)
    expect(r).toEqual({
      renda_fixa_pos: 30.6,
      renda_fixa_ipca: 15.3,
      renda_fixa_pre: 10.2,
      caixa: 5.1,
      fiis: 10.2,
      acoes: 20.4,
      internacional: 8.2,
    });
    expect(somaEmUnidades(r, 1)).toBe(1000);
  });

  it("casas = 1 nos 3 perfis com exclusoes tambem soma exatamente 100", () => {
    for (const tipo of PERFIS) {
      for (const excluir of EXCLUSOES) {
        expect(somaEmUnidades(arredondarAlvo(alocacaoAlvo({ tipo, excluir }), 1), 1)).toBe(1000);
      }
    }
  });

  it("alvo que nao soma 100 e normalizado antes de arredondar", () => {
    //1/3 de cada: 33,33 cada, sobra 1 ponto para a primeira da ORDEM_CLASSES (empate de resto)
    expect(arredondarAlvo({ acoes: 1, fiis: 1, renda_fixa_pos: 1 })).toEqual({
      renda_fixa_pos: 34,
      acoes: 33,
      fiis: 33,
    });
  });

  it("e exportada pelo index do motor (@/motor)", () => {
    expect(arredondarAlvoDoIndex).toBe(arredondarAlvo);
  });
});
