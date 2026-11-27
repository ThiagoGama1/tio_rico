import { Alocacao, Classe } from "./tipos";
import { arredondar2, limitar } from "./numeros";

//desvio de cada classe em pontos percentuais: atual - alvo.
//positivo = acima do alvo, negativo = abaixo. Inclui classes que estao so no atual ou so no alvo.
export function calcularDesvio(atual: Alocacao, alvo: Alocacao): Alocacao {
    const classes = new Set<Classe>([
        ...(Object.keys(atual) as Classe[]),
        ...(Object.keys(alvo) as Classe[]),
    ]);
    const desvio: Alocacao = {};
    for (const classe of classes) {
        desvio[classe] = (atual[classe] ?? 0) - (alvo[classe] ?? 0);
    }
    return desvio;
}

//aderencia de 0 a 100: 100 - (soma dos |desvios|) / 2.
//divide por 2 porque cada ponto que sobra numa classe falta em outra (a soma conta tudo duas vezes).
//100 = carteira igual ao alvo; 0 = nenhuma classe em comum.
export function calcularAderencia(atual: Alocacao, alvo: Alocacao): number {
    let somaAbsoluta = 0;
    for (const valor of Object.values(calcularDesvio(atual, alvo))) {
        somaAbsoluta += Math.abs(valor ?? 0);
    }
    return arredondar2(limitar(100 - somaAbsoluta / 2, 0, 100));
}
