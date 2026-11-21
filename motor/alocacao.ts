import { Alocacao, Ativo, Classe } from "./tipos";

export function calcularAlocacao(carteira: Ativo[]): Alocacao {
    if (carteira.length === 0) {
        return {};
    }
    let valorTotal: number = 0;
    const somaPorClasse: Alocacao = {};
    for (const ativo of carteira) {
        somaPorClasse[ativo.classe] = (somaPorClasse[ativo.classe] ?? 0) + ativo.valorCentavos;
        valorTotal += ativo.valorCentavos;
    }
    if (valorTotal === 0) {
        return {};
    }
    const resultado: Alocacao = {};
    for (const [classe, valor] of Object.entries(somaPorClasse)) {
        resultado[classe as Classe] = valor / valorTotal * 100;
    }
    return resultado;

}