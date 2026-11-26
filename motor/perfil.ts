import { TipoPerfil } from "./tipos";

//questionario de suitability (perfil de investidor) por pontuacao.
//cada pergunta tem 4 opcoes, valendo de 0 (mais conservadora) a 3 (mais arrojada).
//total vai de 0 a 12.

//"as const" faz o TypeScript guardar os textos exatos como tipos, nao so "string".
//assim o tipo Objetivo abaixo e exatamente uma dessas 4 strings (como um enum do Go).
export const OPCOES_OBJETIVO = ["preservar", "renda_extra", "crescer", "multiplicar"] as const;
export const OPCOES_PRAZO = ["ate_1_ano", "1_a_3_anos", "3_a_5_anos", "mais_de_5_anos"] as const;
export const OPCOES_EXPERIENCIA = ["nenhuma", "poupanca_renda_fixa", "fundos_acoes", "ampla"] as const;
export const OPCOES_REACAO_QUEDA = ["vende_tudo", "vende_parte", "mantem", "compra_mais"] as const;

//(typeof X)[number] = "o tipo de qualquer elemento do array X"
export type Objetivo = (typeof OPCOES_OBJETIVO)[number];
export type Prazo = (typeof OPCOES_PRAZO)[number];
export type Experiencia = (typeof OPCOES_EXPERIENCIA)[number];
export type ReacaoQueda = (typeof OPCOES_REACAO_QUEDA)[number];

export interface RespostasPerfil {
    objetivo: Objetivo; //o que quer com o dinheiro
    prazo: Prazo; //quando vai precisar dele
    experiencia: Experiencia; //com o que ja investiu
    reacaoQueda: ReacaoQueda; //o que faria se a carteira caisse 20%
}

//faixas: 0-4 conservador, 5-8 moderado, 9-12 arrojado
export const PONTOS_MAX_CONSERVADOR = 4;
export const PONTOS_MAX_MODERADO = 8;

//pontos de uma resposta = posicao dela na lista de opcoes (0 a 3)
export function pontuarRespostas(respostas: RespostasPerfil): number {
    return (
        OPCOES_OBJETIVO.indexOf(respostas.objetivo) +
        OPCOES_PRAZO.indexOf(respostas.prazo) +
        OPCOES_EXPERIENCIA.indexOf(respostas.experiencia) +
        OPCOES_REACAO_QUEDA.indexOf(respostas.reacaoQueda)
    );
}

//perfil a partir das respostas.
//trava: quem venderia tudo numa queda de 20% e conservador, nao importa o resto
//(tolerancia a perda e o que mais pesa na pratica; os outros pontos nao compensam).
export function calcularPerfil(respostas: RespostasPerfil): TipoPerfil {
    if (respostas.reacaoQueda === "vende_tudo") {
        return "conservador";
    }
    const pontos = pontuarRespostas(respostas);
    if (pontos <= PONTOS_MAX_CONSERVADOR) return "conservador";
    if (pontos <= PONTOS_MAX_MODERADO) return "moderado";
    return "arrojado";
}
