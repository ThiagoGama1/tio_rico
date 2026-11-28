/**
 * Mês atual no formato AAAA-MM, no fuso de Brasília.
 *
 * O servidor (Vercel) roda em UTC; sem fixar o fuso, das 21h às 23h59 do
 * último dia do mês o servidor já estaria no mês seguinte. Formulário e rota
 * usam a mesma função para concordar sobre qual é o "mês atual".
 */
export function mesAtualReferencia(agora: Date = new Date()): string {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(agora);
  const ano = partes.find((p) => p.type === "year")?.value;
  const mes = partes.find((p) => p.type === "month")?.value;
  return `${ano}-${mes}`;
}

export const FUTURE_MONTH_MESSAGE =
  "O mês de referência não pode ser depois do mês atual.";

/** `true` quando `mes` (AAAA-MM) é posterior ao mês atual. */
export function mesNoFuturo(mes: string, agora: Date = new Date()): boolean {
  // AAAA-MM com zero à esquerda compara corretamente como texto
  return mes > mesAtualReferencia(agora);
}
