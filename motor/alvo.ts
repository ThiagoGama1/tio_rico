import { Alocacao, Classe, Perfil, TipoPerfil } from "./tipos";
import { ORDEM_CLASSES, somarAlocacao } from "./alocacao";

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

//arredonda o alvo para exibir em tela (casas = 0 da inteiros; casas = 1, uma casa decimal)
//mantendo a soma EXATAMENTE 100, pelo metodo do maior resto:
//1. normaliza para somar 100 e conta em "unidades" (casas 0: 1 ponto; casas 1: 0,1 ponto);
//2. cada classe recebe o valor arredondado para baixo;
//3. as unidades que sobraram vao, uma a uma, para as classes de maior resto
//   (empate: a que vem primeiro em ORDEM_CLASSES).
//classes ausentes, com valor 0 ou que arredondam para 0 nao aparecem. Alvo vazio da {}.
export function arredondarAlvo(alvo: Alocacao, casas = 0): Alocacao {
    const escala = 10 ** Math.max(0, Math.floor(casas));
    const classes = ORDEM_CLASSES.filter((classe) => (alvo[classe] ?? 0) > 0);
    const soma = classes.reduce((total, classe) => total + (alvo[classe] ?? 0), 0);
    if (soma === 0) {
        return {};
    }

    const totalUnidades = 100 * escala;
    const partes = classes.map((classe) => {
        const exato = (alvo[classe] ?? 0) / soma * totalUnidades;
        //o 1e-9 evita que 3061 vire 3060.9999... e perca uma unidade no floor
        const base = Math.floor(exato + 1e-9);
        return { classe, base, resto: exato - base };
    });

    let sobra = totalUnidades - partes.reduce((total, p) => total + p.base, 0);
    //sort estavel: em empate de resto, mantem a ordem de ORDEM_CLASSES
    const porResto = [...partes].sort((a, b) => b.resto - a.resto);
    for (const parte of porResto) {
        if (sobra <= 0) break;
        parte.base += 1;
        sobra -= 1;
    }

    const resultado: Alocacao = {};
    for (const parte of partes) {
        if (parte.base > 0) {
            //divide de volta e corta o ruido de ponto flutuante (ex.: 30.600000000000001)
            resultado[parte.classe] = Number((parte.base / escala).toFixed(Math.log10(escala)));
        }
    }
    return resultado;
}
