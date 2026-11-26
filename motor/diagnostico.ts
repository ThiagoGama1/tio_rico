import { Alocacao, EntradaMotor, ResultadoClasse, ResultadoMotor } from "./tipos";
import { ORDEM_CLASSES, somarAlocacao, valoresPorClasse } from "./alocacao";
import { resolverAlvo } from "./alvo";
import { distribuirAporte } from "./aporte";
import { calcularAderencia } from "./desvio";
import { arredondar2, centavosValidos, limitar } from "./numeros";
import { juroRealFisherPct, rendimentoCarteiraPct } from "./rendimento";

export const VERSAO_MOTOR = "motor-v1";

//percentual de parte sobre total, ou 0 se o total for zero
function pct(parte: number, total: number): number {
    return total > 0 ? arredondar2(parte / total * 100) : 0;
}

//ponto de ligacao com o app: as rotas de check-in, o seed e a IA chamam esta funcao.
//junta alocacao, alvo, desvio, aporte e rendimento e devolve um ResultadoMotor.
export function gerarDiagnostico(entrada: EntradaMotor): ResultadoMotor {
    //1. quanto tem hoje em cada classe
    const valores = valoresPorClasse(entrada.carteira);
    const totalCentavos = somarAlocacao(valores);

    //2. alvo: o salvo (ou o padrao do perfil), sem as classes excluidas, somando 100
    const alvo = resolverAlvo(entrada.alvo, entrada.perfil);

    //3. aporte distribuido pelo deficit de cada classe, sem vender nada
    const aporteCentavos = centavosValidos(entrada.aporteCentavos);
    const totalPosAporteCentavos = totalCentavos + aporteCentavos;
    const aportePorClasse = distribuirAporte(valores, alvo, aporteCentavos);

    //4. uma linha por classe que aparece na carteira, no alvo ou no aporte, na ordem padrao
    const classes: ResultadoClasse[] = ORDEM_CLASSES.filter(
        (classe) =>
            (valores[classe] ?? 0) > 0 ||
            (alvo[classe] ?? 0) > 0 ||
            (aportePorClasse[classe] ?? 0) > 0,
    ).map((classe) => {
        const valorCentavos = valores[classe] ?? 0;
        const aporte = aportePorClasse[classe] ?? 0;
        const atualPct = pct(valorCentavos, totalCentavos);
        const alvoPct = arredondar2(limitar(alvo[classe] ?? 0, 0, 100));
        return {
            classe,
            valorCentavos,
            atualPct,
            alvoPct,
            desvioPct: arredondar2(atualPct - alvoPct),
            aporteCentavos: aporte,
            posAportePct: pct(valorCentavos + aporte, totalPosAporteCentavos),
        };
    });

    //5. aderencia antes e depois do aporte (com os percentuais ja arredondados que o usuario ve)
    const atual: Alocacao = {};
    const posAporte: Alocacao = {};
    const alvoArredondado: Alocacao = {};
    for (const linha of classes) {
        atual[linha.classe] = linha.atualPct;
        posAporte[linha.classe] = linha.posAportePct;
        alvoArredondado[linha.classe] = linha.alvoPct;
    }

    //6. rendimento nominal, real (Fisher contra IPCA 12m) e juro real da Selic
    const rendimentoAnualPct = rendimentoCarteiraPct(
        entrada.carteira,
        entrada.indicadores,
        aportePorClasse,
        alvo,
    );

    return {
        totalCentavos,
        aporteCentavos,
        totalPosAporteCentavos,
        classes,
        aderencia: calcularAderencia(atual, alvoArredondado),
        aderenciaPosAporte: calcularAderencia(posAporte, alvoArredondado),
        rendimentoAnualPct,
        rendimentoRealPct: juroRealFisherPct(rendimentoAnualPct, entrada.indicadores.ipca12mPct),
        juroRealPct: juroRealFisherPct(entrada.indicadores.selicPct, entrada.indicadores.ipca12mPct),
        versao: VERSAO_MOTOR,
    };
}
