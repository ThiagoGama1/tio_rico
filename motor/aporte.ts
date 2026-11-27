import { Alocacao, Classe } from "./tipos";
import { ORDEM_CLASSES, somarAlocacao } from "./alocacao";
import { centavosValidos } from "./numeros";

//classe usada quando nao ha carteira nem alvo: renda fixa pos (liquidez e baixo risco)
export const CLASSE_PADRAO_APORTE: Classe = "renda_fixa_pos";

//divide um valor inteiro de centavos na proporcao dos pesos.
//cada parte e arredondada para baixo; a sobra (sempre < numero de classes) vai
//inteira para a classe de MAIOR peso (empate: a que vem primeiro em ORDEM_CLASSES).
//garante: soma das partes === totalCentavos.
export function repartirProporcional(totalCentavos: number, pesos: Alocacao): Alocacao {
    const total = centavosValidos(totalCentavos);
    const classes = ORDEM_CLASSES.filter((classe) => (pesos[classe] ?? 0) > 0);
    const somaPesos = classes.reduce((soma, classe) => soma + (pesos[classe] ?? 0), 0);
    if (total === 0 || somaPesos === 0) {
        return {};
    }

    const partes: Alocacao = {};
    let distribuido = 0;
    let maiorClasse = classes[0];
    for (const classe of classes) {
        const peso = pesos[classe] ?? 0;
        const parte = Math.floor(total * peso / somaPesos);
        partes[classe] = parte;
        distribuido += parte;
        if (peso > (pesos[maiorClasse] ?? 0)) {
            maiorClasse = classe;
        }
    }

    const sobra = total - distribuido;
    if (sobra > 0) {
        partes[maiorClasse] = (partes[maiorClasse] ?? 0) + sobra;
    }
    return partes;
}

//quanto falta, em centavos, para cada classe chegar no alvo DEPOIS do aporte.
//classe acima do alvo tem deficit 0 (o motor nunca sugere vender).
export function calcularDeficits(
    valoresCentavos: Alocacao,
    alvo: Alocacao,
    aporteCentavos: number,
): Alocacao {
    const totalPosAporte = somarAlocacao(valoresCentavos) + centavosValidos(aporteCentavos);
    const deficits: Alocacao = {};
    for (const classe of ORDEM_CLASSES) {
        const alvoPct = alvo[classe] ?? 0;
        if (alvoPct <= 0) continue;
        const ideal = totalPosAporte * alvoPct / 100;
        const falta = ideal - (valoresCentavos[classe] ?? 0);
        if (falta > 0) {
            deficits[classe] = falta;
        }
    }
    return deficits;
}

//sugere quanto do aporte vai para cada classe, sem vender nada.
//1. se alguma classe esta abaixo do alvo: divide na proporcao do deficit;
//2. senao, se ja existe carteira: divide na proporcao do que cada classe ja tem;
//3. senao (carteira e alvo vazios): tudo na CLASSE_PADRAO_APORTE.
export function distribuirAporte(
    valoresCentavos: Alocacao,
    alvo: Alocacao,
    aporteCentavos: number,
): Alocacao {
    const aporte = centavosValidos(aporteCentavos);
    if (aporte === 0) {
        return {};
    }

    const deficits = calcularDeficits(valoresCentavos, alvo, aporte);
    if (somarAlocacao(deficits) > 0) {
        return repartirProporcional(aporte, deficits);
    }
    if (somarAlocacao(valoresCentavos) > 0) {
        return repartirProporcional(aporte, valoresCentavos);
    }
    return { [CLASSE_PADRAO_APORTE]: aporte };
}
