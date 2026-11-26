import { describe, it, expect } from "vitest";
import { calcularPerfil, pontuarRespostas, type RespostasPerfil } from "./perfil";

const MAIS_CONSERVADORA: RespostasPerfil = {
  objetivo: "preservar",
  prazo: "ate_1_ano",
  experiencia: "nenhuma",
  reacaoQueda: "vende_parte",
};

const MAIS_ARROJADA: RespostasPerfil = {
  objetivo: "multiplicar",
  prazo: "mais_de_5_anos",
  experiencia: "ampla",
  reacaoQueda: "compra_mais",
};

describe("pontuarRespostas", () => {
  it("vai de 0 a 12", () => {
    expect(pontuarRespostas({ ...MAIS_CONSERVADORA, reacaoQueda: "vende_tudo" })).toBe(0);
    expect(pontuarRespostas(MAIS_ARROJADA)).toBe(12);
  });

  it("cada resposta vale a posicao dela na lista", () => {
    //crescer(2) + 3_a_5_anos(2) + poupanca_renda_fixa(1) + mantem(2) = 7
    expect(
      pontuarRespostas({
        objetivo: "crescer",
        prazo: "3_a_5_anos",
        experiencia: "poupanca_renda_fixa",
        reacaoQueda: "mantem",
      }),
    ).toBe(7);
  });
});

describe("calcularPerfil", () => {
  it("pontuacao baixa e conservador", () => {
    expect(calcularPerfil(MAIS_CONSERVADORA)).toBe("conservador"); //1 ponto
  });

  it("pontuacao media e moderado", () => {
    expect(
      calcularPerfil({
        objetivo: "crescer",
        prazo: "3_a_5_anos",
        experiencia: "poupanca_renda_fixa",
        reacaoQueda: "mantem",
      }),
    ).toBe("moderado"); //7 pontos
  });

  it("pontuacao alta e arrojado", () => {
    expect(calcularPerfil(MAIS_ARROJADA)).toBe("arrojado");
  });

  it("limites das faixas: 4 conservador, 5 moderado, 8 moderado, 9 arrojado", () => {
    //preservar(0) + 1_a_3(1) + fundos(2) + vende_parte(1) = 4
    expect(calcularPerfil({ objetivo: "preservar", prazo: "1_a_3_anos", experiencia: "fundos_acoes", reacaoQueda: "vende_parte" })).toBe("conservador");
    //renda_extra(1) + 1_a_3(1) + fundos(2) + vende_parte(1) = 5
    expect(calcularPerfil({ objetivo: "renda_extra", prazo: "1_a_3_anos", experiencia: "fundos_acoes", reacaoQueda: "vende_parte" })).toBe("moderado");
    //crescer(2) + 3_a_5(2) + fundos(2) + mantem(2) = 8
    expect(calcularPerfil({ objetivo: "crescer", prazo: "3_a_5_anos", experiencia: "fundos_acoes", reacaoQueda: "mantem" })).toBe("moderado");
    //multiplicar(3) + 3_a_5(2) + fundos(2) + mantem(2) = 9
    expect(calcularPerfil({ objetivo: "multiplicar", prazo: "3_a_5_anos", experiencia: "fundos_acoes", reacaoQueda: "mantem" })).toBe("arrojado");
  });

  it("quem venderia tudo numa queda de 20% e conservador mesmo com pontuacao alta", () => {
    expect(calcularPerfil({ ...MAIS_ARROJADA, reacaoQueda: "vende_tudo" })).toBe("conservador");
  });
});
