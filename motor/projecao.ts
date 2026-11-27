import { centavosValidos } from "./numeros";

//projecao com juros compostos e aporte mensal.
//convencao: em cada mes, primeiro o saldo rende, depois entra o aporte (aporte no fim do mes).
//taxaAnual e DECIMAL (0.12 = 12% ao ano). As rotas do app usam % e dividem por 100 antes.

//converte taxa anual em mensal equivalente: (1 + anual)^(1/12) - 1.
//nao e anual/12: 12% a.a. da 0,9489% a.m., nao 1% (1% ao mes composto da 12,68% ao ano).
export function taxaMensalEquivalente(taxaAnual: number): number {
    return Math.pow(1 + taxaAnual, 1 / 12) - 1;
}

//saldo mes a mes, do mes 0 (valor inicial) ate o mes "meses". Valores em centavos, sem arredondar.
export function projetarSerie(
    valorInicialCentavos: number,
    aporteMensalCentavos: number,
    taxaAnual: number,
    meses: number,
): number[] {
    const taxa = taxaMensalEquivalente(taxaAnual);
    const aporte = centavosValidos(aporteMensalCentavos);
    const totalMeses = Math.max(0, Math.floor(meses));

    const serie = [centavosValidos(valorInicialCentavos)];
    let saldo = serie[0];
    for (let mes = 1; mes <= totalMeses; mes++) {
        saldo = saldo * (1 + taxa) + aporte;
        serie.push(saldo);
    }
    return serie;
}

//valor final em centavos inteiros depois de "meses" meses
export function projetar(
    valorInicialCentavos: number,
    aporteMensalCentavos: number,
    taxaAnual: number,
    meses: number,
): number {
    const serie = projetarSerie(valorInicialCentavos, aporteMensalCentavos, taxaAnual, meses);
    return centavosValidos(serie[serie.length - 1]);
}

//em quantos meses o saldo alcanca a meta. null se nao alcancar ate limiteMeses
//(ex.: sem aporte e com taxa zero ou negativa, a meta nunca chega).
export function mesesParaMeta(
    valorInicialCentavos: number,
    aporteMensalCentavos: number,
    taxaAnual: number,
    metaCentavos: number,
    limiteMeses = 1200,
): number | null {
    const taxa = taxaMensalEquivalente(taxaAnual);
    const aporte = centavosValidos(aporteMensalCentavos);
    let saldo = centavosValidos(valorInicialCentavos);
    if (saldo >= metaCentavos) return 0;
    for (let mes = 1; mes <= limiteMeses; mes++) {
        saldo = saldo * (1 + taxa) + aporte;
        if (saldo >= metaCentavos) return mes;
    }
    return null;
}
