import { Alocacao, Ativo, Classe } from "./tipos";
import { centavosValidos } from "./numeros";

//ordem fixa das classes, usada para o resultado sair sempre na mesma sequencia
//e para desempatar. O Record<Classe, true> obriga a listar TODAS as classes:
//se alguem criar uma classe nova em tipos.ts e esquecer daqui, o TypeScript nao compila.
const TODAS_AS_CLASSES: Record<Classe, true> = {
    renda_fixa_pos: true,
    renda_fixa_pre: true,
    renda_fixa_ipca: true,
    acoes: true,
    fiis: true,
    internacional: true,
    cripto: true,
    caixa: true,
    outros: true,
};
export const ORDEM_CLASSES = Object.keys(TODAS_AS_CLASSES) as Classe[];

//soma os centavos de cada classe (varios ativos da mesma classe viram um valor so)
export function valoresPorClasse(carteira: Ativo[]): Alocacao {
    const soma: Alocacao = {};
    for (const ativo of carteira) {
        const valor = centavosValidos(ativo.valorCentavos);
        soma[ativo.classe] = (soma[ativo.classe] ?? 0) + valor;
    }
    return soma;
}

//soma todos os valores de uma Alocacao (centavos ou percentuais)
export function somarAlocacao(alocacao: Alocacao): number {
    let total = 0;
    for (const valor of Object.values(alocacao)) {
        total += valor ?? 0;
    }
    return total;
}

//percentual de cada classe na carteira (soma 100), ou {} se a carteira esta vazia/zerada
export function calcularAlocacao(carteira: Ativo[]): Alocacao {
    const somaPorClasse = valoresPorClasse(carteira);
    const valorTotal = somarAlocacao(somaPorClasse);
    if (valorTotal === 0) {
        return {};
    }
    const resultado: Alocacao = {};
    for (const [classe, valor] of Object.entries(somaPorClasse)) {
        resultado[classe as Classe] = valor / valorTotal * 100;
    }
    return resultado;
}
