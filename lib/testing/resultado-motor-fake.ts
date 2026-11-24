import type { PortfolioPositionInput, TargetAllocation } from "@/lib/types/domain";
import type { Classe, ResultadoClasse, ResultadoMotor } from "@/motor/tipos";

/**
 * Test-only stand-in for the motor's output. It is NOT the motor: it builds a
 * coherent `ResultadoMotor` from positions so AI, history and route tests can
 * run without depending on `motor/` being implemented. The whole contribution
 * goes to the most underweight class; yields are fixed placeholders.
 */

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function resultadoMotorFake(params: {
  positions: ReadonlyArray<Pick<PortfolioPositionInput, "assetClass" | "amountCents">>;
  targetAllocation: TargetAllocation;
  contributionCents: number;
}): ResultadoMotor {
  const porClasse = new Map<Classe, number>();
  for (const position of params.positions) {
    porClasse.set(
      position.assetClass,
      (porClasse.get(position.assetClass) ?? 0) + position.amountCents,
    );
  }
  for (const classe of Object.keys(params.targetAllocation) as Classe[]) {
    if (!porClasse.has(classe)) porClasse.set(classe, 0);
  }

  const totalCentavos = Array.from(porClasse.values()).reduce((a, b) => a + b, 0);
  const totalPosAporteCentavos = totalCentavos + params.contributionCents;

  const base = Array.from(porClasse.entries()).map(([classe, valorCentavos]) => {
    const atualPct = totalCentavos > 0 ? round2((valorCentavos / totalCentavos) * 100) : 0;
    const alvoPct = params.targetAllocation[classe] ?? 0;
    return { classe, valorCentavos, atualPct, alvoPct, desvioPct: round2(atualPct - alvoPct) };
  });

  const maisAbaixo = [...base].sort((a, b) => a.desvioPct - b.desvioPct)[0]?.classe;

  const classes: ResultadoClasse[] = base.map((item) => {
    const aporteCentavos = item.classe === maisAbaixo ? params.contributionCents : 0;
    const posAportePct =
      totalPosAporteCentavos > 0
        ? round2(((item.valorCentavos + aporteCentavos) / totalPosAporteCentavos) * 100)
        : 0;
    return { ...item, aporteCentavos, posAportePct };
  });

  const aderencia = (pcts: Array<{ pct: number; alvo: number }>) =>
    round2(Math.max(0, 100 - pcts.reduce((s, p) => s + Math.abs(p.pct - p.alvo), 0) / 2));

  return {
    totalCentavos,
    aporteCentavos: params.contributionCents,
    totalPosAporteCentavos,
    classes,
    aderencia: aderencia(classes.map((c) => ({ pct: c.atualPct, alvo: c.alvoPct }))),
    aderenciaPosAporte: aderencia(classes.map((c) => ({ pct: c.posAportePct, alvo: c.alvoPct }))),
    rendimentoAnualPct: 14,
    rendimentoRealPct: 8.75,
    juroRealPct: 9.44,
    versao: "fake-para-testes",
  };
}
