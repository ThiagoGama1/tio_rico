import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { NavigationMenu } from "@/components/ui/navigationMenu";
import { getSessionUser } from "@/lib/auth/session";
import { isDatabaseConfigured } from "@/lib/db/prisma";
import {
  formatCentsBRL,
  formatPctBR,
  formatSignedPpBR,
} from "@/lib/history/evolution";
import {
  RepositoryHydrationError,
  getCheckInByIdForProfile,
} from "@/lib/history/repository";
import { getProfileForUser } from "@/lib/profile/repository";
import {
  ASSET_CLASS_LABELS,
  type CheckInDetail,
  type ClassAllocationComparison,
} from "@/lib/types/domain";

// O detalhe é individual por sessão e depende de um parâmetro dinâmico da rota.
export const instant = false;

function monthTitle(referenceMonth: string) {
  const [year, month] = referenceMonth.split("-");
  return new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" })
    .format(new Date(Number(year), Number(month) - 1, 1));
}

function monthLabel(referenceMonth: string) {
  const [year, month] = referenceMonth.split("-");
  return new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" })
    .format(new Date(Number(year), Number(month) - 1, 1))
    .toUpperCase();
}

function DetailShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh bg-[#faf9f7]">
      <NavigationMenu />
      <main className="min-w-0 flex-1 px-6 py-8 lg:px-10 lg:py-12 xl:px-14">{children}</main>
    </div>
  );
}

function DetailHeader({ referenceMonth }: { referenceMonth: string }) {
  return (
    <header className="flex flex-col justify-between gap-6 sm:flex-row sm:items-start">
      <div>
        <p className="font-intel text-sm tracking-[0.08em] text-muted">
          TIO RICO / INVESTIMENTOS
        </p>
        <h1 className="mt-3 font-k2d text-4xl font-bold tracking-tight text-foreground">
          {referenceMonth ? `Check-in de ${monthTitle(referenceMonth)}` : "Detalhes do check-in"}
        </h1>
        <p className="mt-2 max-w-3xl font-k2d text-lg text-muted">
          Posições, contexto macro e análise educacional registrados neste período.
        </p>
      </div>
      <Button
        render={<Link href="/check-ins" />}
        nativeButton={false}
        size="lg"
        className="w-auto shrink-0 px-5"
      >
        Voltar aos check-ins
      </Button>
    </header>
  );
}

function SummaryCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <Card className="p-6">
      <p className="font-intel text-sm tracking-[0.06em] text-muted">{label}</p>
      <p className="mt-2 font-k2d text-3xl font-bold text-foreground">{value}</p>
      <p className="mt-2 font-k2d text-base text-muted">{detail}</p>
    </Card>
  );
}

function UnavailableDetail({ message }: { message: string }) {
  return (
    <DetailShell>
      <DetailHeader referenceMonth="" />
      <Card className="mt-8 p-6">
        <p className="font-k2d text-base text-muted">{message}</p>
      </Card>
    </DetailShell>
  );
}

function allocationDetail(allocation: ClassAllocationComparison) {
  const difference = allocation.targetPct - allocation.currentPct;
  const direction = difference > 0 ? "abaixo" : difference < 0 ? "acima" : "alinhada";

  return difference === 0
    ? "Alocação alinhada ao alvo"
    : `${formatSignedPpBR(difference)} ${direction} da alocação-alvo`;
}

function AdjustmentOptions({ checkIn }: { checkIn: CheckInDetail }) {
  const analysis = checkIn.aiAnalysis;
  const fallbackOptions = checkIn.motorResult.allocations
    .filter((allocation) => allocation.currentPct !== allocation.targetPct)
    .sort(
      (left, right) =>
        Math.abs(right.targetPct - right.currentPct) - Math.abs(left.targetPct - left.currentPct),
    )
    .slice(0, 3);

  return (
    <Card className="p-6">
      <h2 className="font-k2d text-2xl font-semibold text-foreground">Síntese da carteira</h2>
      <p className="mt-3 font-k2d text-base leading-relaxed text-muted">
        {analysis?.resumoExecutivo ??
          "Este check-in mantém o retrato da sua carteira e a comparação com a alocação-alvo definida para o período."}
      </p>

      {analysis?.diagnosticoAlocacao ? (
        <p className="mt-4 border-t border-border pt-4 font-k2d text-sm leading-relaxed text-muted">
          {analysis.diagnosticoAlocacao}
        </p>
      ) : null}

      <div className="mt-5 border-t border-border pt-5">
        <h3 className="font-k2d text-lg font-semibold text-foreground">
          Opções de ajuste por classe
        </h3>
        <div className="mt-4 space-y-3">
          {analysis?.opcoesDeAjuste.length ? (
            analysis.opcoesDeAjuste.map((option, index) => (
              <article
                key={`${option.classeAtivo}-${index}`}
                className="flex flex-col justify-between gap-3 rounded-xl border border-border bg-background p-4 sm:flex-row sm:items-center"
              >
                <div>
                  <p className="font-k2d font-semibold text-foreground">
                    {ASSET_CLASS_LABELS[option.classeAtivo]}
                  </p>
                  <p className="mt-1 font-k2d text-sm leading-relaxed text-muted">
                    {option.justificativa}
                  </p>
                </div>
                <p className="shrink-0 font-k2d text-lg font-semibold text-foreground">
                  {option.acaoSugerida}
                </p>
              </article>
            ))
          ) : fallbackOptions.length > 0 ? (
            fallbackOptions.map((allocation) => (
              <article
                key={allocation.assetClass}
                className="flex flex-col justify-between gap-3 rounded-xl border border-border bg-background p-4 sm:flex-row sm:items-center"
              >
                <div>
                  <p className="font-k2d font-semibold text-foreground">
                    {ASSET_CLASS_LABELS[allocation.assetClass]}
                  </p>
                  <p className="mt-1 font-k2d text-sm text-muted">
                    {allocationDetail(allocation)}
                  </p>
                </div>
                <p className="font-k2d text-lg font-semibold text-foreground">
                  Acompanhar alocação
                </p>
              </article>
            ))
          ) : (
            <p className="font-k2d text-sm text-muted">
              Não há diferenças relevantes entre as classes deste registro e a meta definida.
            </p>
          )}
        </div>
      </div>

      <p className="mt-5 font-intel text-xs tracking-[0.06em] text-[#a26410] uppercase">
        {analysis?.disclaimer ??
          "Conteúdo educacional e informativo; não constitui recomendação de investimento."}
      </p>
    </Card>
  );
}

function ContextCard({ checkIn }: { checkIn: CheckInDetail }) {
  const macro = checkIn.macroSnapshot;
  const newsCount = checkIn.newsSources?.items.length ?? 0;

  const contextItems = [
    {
      label: "Indicadores",
      detail: `Selic ${formatPctBR(macro.selicMetaAnnual)} · CDI ${formatPctBR(macro.cdiAnnual)} · IPCA 12m ${formatPctBR(macro.ipca12m)}`,
      value: "Snapshot",
    },
    {
      label: "Notícias",
      detail: checkIn.newsSources?.newsAvailable
        ? "Fontes recentes por classe de ativo"
        : "Nenhuma fonte externa foi salva neste check-in",
      value: newsCount > 0 ? `${newsCount} fonte${newsCount === 1 ? "" : "s"}` : "Não incluídas",
    },
    {
      label: "Observações",
      detail: checkIn.userNotes || "Nenhuma nota pessoal foi registrada",
      value: checkIn.userNotes ? "Incluídas" : "Sem notas",
    },
    {
      label: "Posições",
      detail: "Alocação registrada e comparação com o alvo",
      value: `${checkIn.positions.length} ${checkIn.positions.length === 1 ? "item" : "itens"}`,
    },
  ];

  return (
    <Card className="p-6">
      <h2 className="font-k2d text-2xl font-semibold text-foreground">Contexto usado</h2>
      <div className="mt-5 space-y-3">
        {contextItems.map((item) => (
          <div
            key={item.label}
            className="flex flex-col justify-between gap-3 rounded-xl border border-border bg-background p-4 sm:flex-row sm:items-center"
          >
            <div className="min-w-0">
              <p className="font-k2d font-semibold text-foreground">{item.label}</p>
              <p className="mt-1 font-k2d text-sm leading-relaxed text-muted">{item.detail}</p>
            </div>
            <p className="shrink-0 font-k2d text-xl font-semibold text-foreground">{item.value}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}

function PositionsCard({ checkIn }: { checkIn: CheckInDetail }) {
  return (
    <Card className="mt-5 p-6">
      <div>
        <h2 className="font-k2d text-2xl font-semibold text-foreground">Posições registradas</h2>
        <p className="mt-2 font-k2d text-base text-muted">
          A fotografia da carteira usada nos cálculos deste check-in.
        </p>
      </div>

      {checkIn.positions.length === 0 ? (
        <p className="mt-5 font-k2d text-base text-muted">
          Não há posições salvas para este check-in.
        </p>
      ) : (
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[42rem] border-separate border-spacing-0 text-left">
            <thead>
              <tr className="font-intel text-xs tracking-[0.06em] text-muted uppercase">
                <th className="border-b border-border px-3 py-3 font-normal">Ativo</th>
                <th className="border-b border-border px-3 py-3 font-normal">Classe</th>
                <th className="border-b border-border px-3 py-3 text-right font-normal">Valor</th>
                <th className="border-b border-border px-3 py-3 text-right font-normal">Atual</th>
                <th className="border-b border-border px-3 py-3 text-right font-normal">Alvo</th>
              </tr>
            </thead>
            <tbody>
              {checkIn.positions.map((position) => (
                <tr key={position.id} className="font-k2d text-sm text-foreground">
                  <td className="border-b border-border px-3 py-4 font-semibold">
                    {position.assetLabel}
                  </td>
                  <td className="border-b border-border px-3 py-4 text-muted">
                    {ASSET_CLASS_LABELS[position.assetClass]}
                  </td>
                  <td className="border-b border-border px-3 py-4 text-right font-semibold">
                    {formatCentsBRL(position.amountCents)}
                  </td>
                  <td className="border-b border-border px-3 py-4 text-right">
                    {formatPctBR(position.allocationPct)}
                  </td>
                  <td className="border-b border-border px-3 py-4 text-right">
                    {formatPctBR(position.targetPct)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

type CheckInLoadResult =
  | { checkIn: CheckInDetail }
  | { notFound: true }
  | { message: string };

async function loadCheckInForUser(
  userId: string,
  checkInId: string,
): Promise<CheckInLoadResult> {
  try {
    const profile = await getProfileForUser(userId);
    if (!profile) {
      return { message: "Conclua seu perfil de investidor para consultar check-ins." };
    }

    const checkIn = await getCheckInByIdForProfile(checkInId, profile.id);
    return checkIn ? { checkIn } : { notFound: true };
  } catch (error) {
    if (error instanceof RepositoryHydrationError) {
      return {
        message: "Os dados deste check-in estão inconsistentes e não puderam ser exibidos.",
      };
    }

    return {
      message: "Não foi possível carregar este check-in agora. Tente novamente em alguns instantes.",
    };
  }
}

function CheckInDetailPageContent({ checkIn }: { checkIn: CheckInDetail }) {
  return (
    <DetailShell>
      <DetailHeader referenceMonth={checkIn.referenceMonth} />

      <section aria-label="Resumo do check-in" className="mt-8 grid gap-4 md:grid-cols-3">
        <SummaryCard
          label={monthLabel(checkIn.referenceMonth)}
          value={formatCentsBRL(checkIn.totalValueCents)}
          detail="Patrimônio registrado"
        />
        <SummaryCard
          label="APORTE"
          value={formatCentsBRL(checkIn.contributionCents)}
          detail="Informado neste período"
        />
        <SummaryCard
          label="ADERÊNCIA"
          value={
            checkIn.adherenceScore === null
              ? "—"
              : `${Math.round(checkIn.adherenceScore)} / 100`
          }
          detail="Comparação com a alocação-alvo"
        />
      </section>

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(22rem,0.95fr)]">
        <AdjustmentOptions checkIn={checkIn} />
        <ContextCard checkIn={checkIn} />
      </div>

      <PositionsCard checkIn={checkIn} />
    </DetailShell>
  );
}

export default async function CheckInDetailPage(props: PageProps<"/check-ins/[id]">) {
  const { id } = await props.params;
  const checkInId = id.trim();

  // Auth.js is request-bound; defer it, together with the database read, until navigation.
  await connection();
  const user = await getSessionUser();
  if (!user) {
    redirect("/");
  }

  if (!checkInId) {
    notFound();
  }

  if (!isDatabaseConfigured()) {
    return (
      <UnavailableDetail message="Ainda não foi possível carregar os dados deste check-in." />
    );
  }

  const result = await loadCheckInForUser(user.id, checkInId);
  if ("message" in result) {
    return <UnavailableDetail message={result.message} />;
  }

  if ("notFound" in result) notFound();

  return <CheckInDetailPageContent checkIn={result.checkIn} />;
}
