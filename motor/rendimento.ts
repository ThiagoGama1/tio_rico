import { Alocacao, Ativo, Classe, Indicadores } from "./tipos";
import { ORDEM_CLASSES, somarAlocacao } from "./alocacao";
import { arredondar2, centavosValidos } from "./numeros";

//equacao de Fisher: juro real = (1 + nominal) / (1 + inflacao) - 1.
//nao e "nominal - inflacao": com 15% nominal e 5% de inflacao o real e 9,52%, nao 10%.
//entrada e saida em % ao ano (15 = 15%).
export function juroRealFisherPct(nominalPct: number, inflacaoPct: number): number {
    const fatorInflacao = 1 + inflacaoPct / 100;
    if (fatorInflacao <= 0) {
        //inflacao <= -100% nao tem sentido economico; devolve o nominal para nao dividir por zero
        return arredondar2(nominalPct);
    }
    const fatorNominal = 1 + nominalPct / 100;
    return arredondar2((fatorNominal / fatorInflacao - 1) * 100);
}

//rendimento anual estimado de uma classe quando o ativo nao informa indexador.
//sao premissas simples e fixas (mesmas do adaptador provisorio), so para estimativa educacional.
export function rendimentoClassePct(classe: Classe, ind: Indicadores): number {
    const fatorIpca = 1 + ind.ipca12mPct / 100;
    switch (classe) {
        case "renda_fixa_pos":
            return ind.cdiPct;
        case "renda_fixa_pre":
            return ind.selicPct + 0.5;
        case "renda_fixa_ipca":
            return (fatorIpca * 1.06 - 1) * 100; //IPCA + 6%
        case "acoes":
            return ind.selicPct + 3.5;
        case "fiis":
            return (fatorIpca * 1.075 - 1) * 100; //IPCA + 7,5%
        case "internacional":
            return ind.selicPct + 2;
        case "cripto":
            return ind.selicPct + 5;
        case "caixa":
            return ind.cdiPct * 0.85;
        case "outros":
            return ind.cdiPct;
    }
}

//rendimento de um ativo: usa o indexador quando informado
//(ex.: CDI 110 = 110% do CDI; IPCA 6 = IPCA + 6%; PRE 12 = 12% ao ano), senao a estimativa da classe.
export function rendimentoAtivoPct(ativo: Ativo, ind: Indicadores): number {
    const indexador = ativo.indexador?.trim().toUpperCase();
    const taxa = ativo.taxaIndexador;
    if (indexador && typeof taxa === "number" && Number.isFinite(taxa)) {
        switch (indexador) {
            case "CDI":
                return ind.cdiPct * taxa / 100;
            case "SELIC":
                return ind.selicPct * taxa / 100;
            case "IPCA":
            case "IPCA+":
                return ((1 + ind.ipca12mPct / 100) * (1 + taxa / 100) - 1) * 100;
            case "PRE":
            case "PREFIXADO":
                return taxa;
        }
    }
    return rendimentoClassePct(ativo.classe, ind);
}

//media ponderada de rendimentos por classe, usando os pesos dados
function mediaPorClasse(pesos: Alocacao, ind: Indicadores): number {
    const somaPesos = somarAlocacao(pesos);
    let soma = 0;
    for (const classe of ORDEM_CLASSES) {
        const peso = pesos[classe] ?? 0;
        if (peso > 0) soma += peso * rendimentoClassePct(classe, ind);
    }
    return soma / somaPesos;
}

//rendimento nominal anual estimado da carteira (% ao ano), em ordem de preferencia:
//1. carteira com valor: media dos ativos ponderada pelo valor de cada um;
//2. carteira vazia com aporte: media das classes ponderada pelo aporte sugerido;
//3. so com alvo: media das classes ponderada pelo alvo;
//4. nada: o CDI.
export function rendimentoCarteiraPct(
    carteira: Ativo[],
    ind: Indicadores,
    aportePorClasse: Alocacao,
    alvo: Alocacao,
): number {
    let totalCarteira = 0;
    let somaPonderada = 0;
    for (const ativo of carteira) {
        const valor = centavosValidos(ativo.valorCentavos);
        if (valor === 0) continue;
        totalCarteira += valor;
        somaPonderada += valor * rendimentoAtivoPct(ativo, ind);
    }
    if (totalCarteira > 0) {
        return arredondar2(somaPonderada / totalCarteira);
    }
    if (somarAlocacao(aportePorClasse) > 0) {
        return arredondar2(mediaPorClasse(aportePorClasse, ind));
    }
    if (somarAlocacao(alvo) > 0) {
        return arredondar2(mediaPorClasse(alvo, ind));
    }
    return arredondar2(ind.cdiPct);
}
