import { Alocacao, Classe, Perfil, TipoPerfil } from "./tipos";

export const ALVOS_POR_PERFIL: Record<TipoPerfil, Alocacao> = {
    conservador: {
        renda_fixa_pos: 50,
        renda_fixa_ipca: 20,
        renda_fixa_pre: 10,
        caixa: 10,
        fiis: 5,
        acoes: 5,
    },
    moderado: {
        renda_fixa_pos: 30,
        renda_fixa_ipca: 15,
        renda_fixa_pre: 10,
        caixa: 5,
        fiis: 10,
        acoes: 20,
        internacional: 8,
        cripto: 2,
    },
    arrojado: {
        renda_fixa_pos: 15,
        renda_fixa_ipca: 10,
        renda_fixa_pre: 5,
        fiis: 10,
        acoes: 35,
        internacional: 15,
        cripto: 5,
        caixa: 5,
    },
};
export function alocacaoAlvo(perfil: Perfil): Alocacao {
    const base = ALVOS_POR_PERFIL[perfil.tipo];

    const restantes: Alocacao = {};
    let soma = 0;
    for (const [classe, valor] of Object.entries(base)) {
        if (perfil.excluir.includes(classe as Classe)) {
            continue;
        }
        restantes[classe as Classe] = valor;
        soma += valor;
    }
    if (soma === 0) {
        return {};
    }
    const resultado: Alocacao = {};
    for (const [classe, valor] of Object.entries(restantes)) {
        resultado[classe as Classe] = valor / soma * 100;
    }
    return resultado;
}