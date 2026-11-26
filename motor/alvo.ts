import { Alocacao, Classe, Perfil, TipoPerfil } from "./tipos";
import { somarAlocacao } from "./alocacao";

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

//tira as classes excluidas e reescala o que sobrou para somar 100.
//classes com valor 0 ou negativo tambem saem. Devolve {} se nao sobrar nada.
export function excluirEReescalar(base: Alocacao, excluir: Classe[]): Alocacao {
    const restantes: Alocacao = {};
    for (const [classe, valor] of Object.entries(base)) {
        if (excluir.includes(classe as Classe) || !(valor > 0)) {
            continue;
        }
        restantes[classe as Classe] = valor;
    }
    const soma = somarAlocacao(restantes);
    if (soma === 0) {
        return {};
    }
    const resultado: Alocacao = {};
    for (const [classe, valor] of Object.entries(restantes)) {
        resultado[classe as Classe] = valor / soma * 100;
    }
    return resultado;
}

//alvo padrao do perfil, sem as classes excluidas
export function alocacaoAlvo(perfil: Perfil): Alocacao {
    return excluirEReescalar(ALVOS_POR_PERFIL[perfil.tipo], perfil.excluir);
}

//alvo usado no diagnostico: o salvo pelo usuario; se vier vazio, o padrao do perfil.
//nos dois casos as classes excluidas saem e o resto soma 100.
export function resolverAlvo(alvoSalvo: Alocacao, perfil: Perfil): Alocacao {
    const temAlvoSalvo = somarAlocacao(alvoSalvo) > 0;
    const base = temAlvoSalvo ? alvoSalvo : ALVOS_POR_PERFIL[perfil.tipo];
    return excluirEReescalar(base, perfil.excluir);
}
