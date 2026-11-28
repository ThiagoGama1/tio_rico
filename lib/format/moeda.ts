/**
 * Valores em reais digitados pela pessoa (padrão pt-BR) <-> centavos inteiros.
 *
 * Ponto é separador de milhar e vírgula é decimal: "1.500" = R$ 1.500,00
 * (e não R$ 1,50, que era o bug da #65).
 */

const MILHAR = /^\d{1,3}(\.\d{3})+$/;

/**
 * Converte o texto digitado em centavos. Devolve `null` se vazio ou inválido
 * (letras, sinal negativo, vírgula repetida, ponto fora do padrão de milhar).
 * Aceita "R$" e espaços em volta.
 */
export function parseReaisParaCentavos(texto: string): number | null {
  const limpo = texto.trim().replace(/^R\$\s*/i, "").replace(/\s/g, "");
  if (!limpo) return null;
  if (!/^[\d.,]+$/.test(limpo)) return null;

  const partes = limpo.split(",");
  if (partes.length > 2) return null;

  const [inteiroTexto, decimalTexto = ""] = partes;
  if (decimalTexto.length > 2 || /\D/.test(decimalTexto)) return null;

  let inteiro: string;
  if (!inteiroTexto.includes(".")) {
    inteiro = inteiroTexto;
  } else if (MILHAR.test(inteiroTexto)) {
    inteiro = inteiroTexto.replace(/\./g, "");
  } else if (partes.length === 1 && /^\d+\.\d{1,2}$/.test(inteiroTexto)) {
    // "10.5" sem vírgula: ponto não forma milhar, então é decimal.
    const [i, d] = inteiroTexto.split(".");
    return Number(i) * 100 + Number(d.padEnd(2, "0"));
  } else {
    return null;
  }

  if (!inteiro && !decimalTexto) return null;
  return Number(inteiro || "0") * 100 + Number(decimalTexto.padEnd(2, "0") || "0");
}

/** Centavos -> "1.500,00" (sem o "R$"), para preencher o campo ao sair do foco. */
export function formatarCentavosParaCampo(centavos: number): string {
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(centavos / 100);
}

/**
 * Máscara enquanto a pessoa digita: mantém só dígitos e uma vírgula, agrupa o
 * milhar com ponto e limita a 2 casas decimais. "1500" -> "1.500",
 * "1500,5" -> "1.500,5". Letras e sinais somem.
 */
export function mascararReais(texto: string): string {
  const semLixo = texto.replace(/[^\d,]/g, "");
  const virgula = semLixo.indexOf(",");
  const inteiroBruto = virgula === -1 ? semLixo : semLixo.slice(0, virgula);
  const decimal =
    virgula === -1 ? null : semLixo.slice(virgula + 1).replace(/,/g, "").slice(0, 2);

  const inteiroSemZeros = inteiroBruto.replace(/^0+(?=\d)/, "");
  const inteiro = inteiroSemZeros.replace(/\B(?=(\d{3})+(?!\d))/g, ".");

  if (decimal === null) return inteiro;
  return `${inteiro || "0"},${decimal}`;
}

/** Ao sair do campo: normaliza para "1.500,00" se o valor for válido. */
export function normalizarCampoReais(texto: string): string {
  const centavos = parseReaisParaCentavos(texto);
  return centavos === null ? texto : formatarCentavosParaCampo(centavos);
}
