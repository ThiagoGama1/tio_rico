import { mesesParaMeta } from "@/motor";

/** Até 100 anos; além disso a meta é tratada como "não alcançada". */
const LIMITE_MESES = 1200;

/** Aceita "12/2027" e "2027-12"; devolve "2027-12" ou `null`. */
export function normalizarMes(valor: string | null | undefined): string | null {
  if (!valor) return null;
  const iso = valor.match(/^(\d{4})-(0[1-9]|1[0-2])$/);
  if (iso) return `${iso[1]}-${iso[2]}`;
  const barra = valor.match(/^(0[1-9]|1[0-2])\/(\d{4})$/);
  return barra ? `${barra[2]}-${barra[1]}` : null;
}

/** Soma `meses` a um mês "AAAA-MM". */
export function somarMeses(mes: string, meses: number): string {
  const [ano, m] = mes.split("-").map(Number);
  const total = ano * 12 + (m - 1) + meses;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
}

/** "2028-03" → "mar/2028". */
export function rotuloMes(mes: string): string {
  const [ano, m] = mes.split("-").map(Number);
  const nome = new Intl.DateTimeFormat("pt-BR", { month: "short" })
    .format(new Date(ano, m - 1, 1))
    .replace(".", "");
  return `${nome}/${ano}`;
}

export type ProjecaoMeta =
  | { tipo: "alcancada" }
  | { tipo: "no_prazo"; mes: string }
  | { tipo: "depois_do_prazo"; mes: string; prazo: string }
  | { tipo: "nunca" };

/**
 * Quando a meta é alcançada no ritmo informado.
 *
 * - `valorInicialCentavos`: patrimônio no `mesBase` (último check-in).
 * - `taxaAnualPct`: em %, ex.: 12.5 para 12,5% ao ano.
 * - `prazo`: data-alvo da meta, em qualquer dos dois formatos aceitos.
 */
export function projetarMeta(params: {
  valorInicialCentavos: number;
  aporteMensalCentavos: number;
  taxaAnualPct: number;
  metaCentavos: number;
  mesBase: string;
  prazo?: string | null;
}): ProjecaoMeta {
  const meses = mesesParaMeta(
    Math.round(params.valorInicialCentavos),
    Math.round(params.aporteMensalCentavos),
    params.taxaAnualPct / 100,
    Math.round(params.metaCentavos),
    LIMITE_MESES,
  );
  if (meses === null) return { tipo: "nunca" };
  if (meses === 0) return { tipo: "alcancada" };

  const mes = somarMeses(params.mesBase, meses);
  const prazo = normalizarMes(params.prazo);
  // "AAAA-MM" compara corretamente como texto
  if (prazo && mes > prazo) return { tipo: "depois_do_prazo", mes, prazo };
  return { tipo: "no_prazo", mes };
}
