//arredonda para 2 casas decimais (percentuais que o motor devolve)
//o Number.EPSILON corrige casos como 1.005, que em ponto flutuante vira 1.00499...
export function arredondar2(valor: number): number {
    return Math.round((valor + Number.EPSILON) * 100) / 100;
}

//prende o valor entre min e max
export function limitar(valor: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, valor));
}

//garante centavos inteiros e nao negativos
export function centavosValidos(valor: number): number {
    if (!Number.isFinite(valor)) return 0;
    return Math.max(0, Math.round(valor));
}
