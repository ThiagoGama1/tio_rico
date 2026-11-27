import Link from "next/link";
import { redirect } from "next/navigation";

import { NewCheckInButton } from "@/components/pages/newCheckInButton";
import { NavigationMenu } from "@/components/ui/navigationMenu";
import { Card } from "@/components/ui/card";
import { DataLine } from "@/components/ui/dataLine";
import { getSessionUser } from "@/lib/auth/session";
import { isDatabaseConfigured } from "@/lib/db/prisma";
import {
  computePortfolioEvolution,
  formatCentsBRL,
  formatSignedPpBR,
} from "@/lib/history/evolution";
import {
  listCheckIns,
  type InvestorProfileWithAssets,
} from "@/lib/history/repository";
import { getMacroIndicators } from "@/lib/integrations/bcb";
import { getProfileForUser } from "@/lib/profile/repository";
import {
  ASSET_CLASS_LABELS,
  type CheckInDetail,
  type MacroIndicators,
} from "@/lib/types/domain";

// A visão geral depende da sessão e dos dados pessoais do investidor.
// Com Cache Components, esta rota precisa aguardar a requisição autenticada.
export const instant = false;

function monthLabel(referenceMonth: string) {
  const [year, month] = referenceMonth.split("-");
  const monthIndex = Number(month) - 1;
  const date = new Date(Number(year), monthIndex, 1);

  return new Intl.DateTimeFormat("pt-BR", {
    month: "short",
    year: "numeric",
  })
    .format(date)
    .replace(" de ", "/")
    .replace(".", "")
    .toUpperCase();
}

function percentage(value: number) {
  return `${value.toFixed(2).replace(".", ",")}%`;
}

function referenceMonthNow() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

type LoadedOverview = {
  profile: InvestorProfileWithAssets;
  checkIns: CheckInDetail[];
  indicators: MacroIndicators;
};

type OverviewLoadResult =
  | { data: LoadedOverview }
  | { message: string };

async function loadOverview(userId: string): Promise<OverviewLoadResult> {
  try {
    const profile = await getProfileForUser(userId);
    if (!profile) {
      return {
        message:
          "Conclua seu perfil de investidor para começar a acompanhar sua carteira.",
      };
    }

    const [checkIns, indicators] = await Promise.all([
      listCheckIns(profile.id, { order: "asc" }),
      getMacroIndicators(),
    ]);

    return { data: { profile, checkIns, indicators } };
  } catch {
    return {
      message:
        "Não foi possível carregar a visão geral agora. Tente novamente em alguns instantes.",
    };
  }
}

function OverviewMessage({ children }: { children: React.ReactNode }) {
  return (
    <Card className="p-6">
      <p className="p text-muted">{children}</p>
    </Card>
  );
}

function OverviewShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh bg-[#faf9f7]">
      <NavigationMenu />
      <section className="min-w-0 flex-1 px-6 py-8 lg:px-10 lg:py-12 xl:px-14">
        {children}
      </section>
    </div>
  );
}

function OverviewUnavailable({ message }: { message: string }) {
  return (
    <OverviewShell>
      <header className="mb-8 flex items-start justify-between gap-6">
        <div>
          <p className="font-intel text-sm tracking-[0.08em] text-muted">
            TIO RICO / INVESTIMENTOS
          </p>
          <h1 className="mt-3 font-k2d text-4xl font-bold tracking-tight">
            Visão geral
          </h1>
        </div>
        <NewCheckInButton />
      </header>
      <OverviewMessage>{message}</OverviewMessage>
    </OverviewShell>
  );
}

export default async function OverviewPage() {
  const user = await getSessionUser();
  if (!user) {
    redirect("/");
  }

  if (!isDatabaseConfigured()) {
    return (
      <OverviewUnavailable message="Ainda não foi possível carregar seus dados de investimento." />
    );
  }

  const result = await loadOverview(user.id);
  if ("message" in result) {
    return <OverviewUnavailable message={result.message} />;
  }

  const { checkIns, indicators, profile } = result.data;
  const evolution = computePortfolioEvolution(checkIns, profile);
  const latestCheckIn = checkIns.at(-1) ?? null;
  const currentMonth = referenceMonthNow();
  const checkInIsPending = latestCheckIn?.referenceMonth !== currentMonth;

  return (
    <OverviewShell>
        <header className="flex flex-col justify-between gap-6 sm:flex-row sm:items-start">
          <div>
            <p className="font-intel text-sm tracking-[0.08em] text-muted">
              TIO RICO / INVESTIMENTOS
            </p>
            <h1 className="mt-3 font-k2d text-4xl font-bold tracking-tight text-foreground">
              Visão geral
            </h1>
            <p className="mt-2 font-k2d text-lg text-muted">
              Seu acompanhamento é construído a partir da carteira e dos check-ins mensais.
            </p>
          </div>
          <NewCheckInButton className="shrink-0" />
        </header>

        <section
          aria-label="Resumo da carteira"
          className="mt-8 grid gap-4 md:grid-cols-3"
        >
          <Card className="p-6">
            <p className="font-intel text-sm tracking-[0.06em] text-muted">
              PATRIMÔNIO ATUAL
            </p>
            <p className="mt-2 font-k2d text-3xl font-bold text-foreground">
              {formatCentsBRL(evolution.latestTotalCents)}
            </p>
            <p className="mt-2 font-k2d text-base text-muted">
              {latestCheckIn
                ? `Base: check-in de ${monthLabel(latestCheckIn.referenceMonth)}`
                : "Registre o primeiro check-in"}
            </p>
          </Card>
          <Card className="p-6">
            <p className="font-intel text-sm tracking-[0.06em] text-muted">
              APORTE DO MÊS
            </p>
            <p className="mt-2 font-k2d text-3xl font-bold text-foreground">
              {formatCentsBRL(evolution.latestContributionCents)}
            </p>
            <p className="mt-2 font-k2d text-base text-muted">
              {latestCheckIn
                ? `Registrado em ${monthLabel(latestCheckIn.referenceMonth)}`
                : "Nenhum aporte registrado"}
            </p>
          </Card>
          <Card className="p-6">
            <p className="font-intel text-sm tracking-[0.06em] text-muted">
              ADERÊNCIA À META
            </p>
            <p className="mt-2 font-k2d text-3xl font-bold text-foreground">
              {evolution.latestAdherenceScore === null
                ? "—"
                : `${Math.round(evolution.latestAdherenceScore)} / 100`}
            </p>
            <p className="mt-2 font-k2d text-base text-muted">
              {evolution.adherenceDeltaFromPrevious === null
                ? "Sem comparação anterior"
                : `${formatSignedPpBR(evolution.adherenceDeltaFromPrevious)} desde o último check-in`}
            </p>
          </Card>
        </section>

        <div className="mt-5 grid gap-5 xl:grid-cols-2">
          <div className="space-y-5">
            {checkInIsPending ? (
              <Card className="p-6">
                <h2 className="font-k2d text-2xl font-semibold text-foreground">
                  Registre o check-in de {monthLabel(currentMonth).toLowerCase()}
                </h2>
                <p className="mt-3 max-w-xs font-k2d text-lg text-muted">
                  Atualize a carteira para recalcular aderência e evolução.
                </p>
                <span className="mt-4 inline-flex rounded bg-[#fff4dc] px-3 py-1 font-intel text-xs tracking-[0.06em] text-[#a26410]">
                  PENDENTE NESTE MÊS
                </span>
              </Card>
            ) : null}

            <Card className="p-6">
              <div className="flex items-center justify-between gap-4">
                <h2 className="font-k2d text-2xl font-semibold text-foreground">
                  Check-ins
                </h2>
                <Link
                  href="/check-ins"
                  className="font-k2d text-sm font-medium text-primary underline-offset-4 hover:underline"
                >
                  Ver todos
                </Link>
              </div>
              {checkIns.length === 0 ? (
                <p className="mt-5 font-k2d text-base text-muted">
                  Seu histórico aparecerá aqui depois do primeiro check-in.
                </p>
              ) : (
                <ul className="mt-5 divide-y divide-border">
                  {[...checkIns].reverse().map((checkIn) => (
                    <li key={checkIn.id}>
                      <Link
                        href={`/check-ins/${checkIn.id}`}
                        className="flex items-center justify-between gap-4 py-4 font-k2d transition-colors hover:text-primary"
                      >
                        <span className="font-intel text-sm tracking-[0.06em] text-(--green-1)">
                          {monthLabel(checkIn.referenceMonth)}
                        </span>
                        <span className="text-lg font-semibold">
                          {formatCentsBRL(checkIn.totalValueCents)}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-4 font-k2d text-sm text-muted">
                Aportes e variação estimada são exibidos separadamente.
              </p>
            </Card>
          </div>

          <div className="space-y-5">
            <ClassReading
              items={evolution.classDeltas.map((item) => ({
                label: ASSET_CLASS_LABELS[item.assetClass],
                current: item.currentPct,
                target: profile.targetAllocation[item.assetClass] ?? 0,
                delta: item.deltaPct,
              }))}
            />
            <ReferenceIndicators indicators={indicators} />
          </div>
        </div>
    </OverviewShell>
  );
}

function ClassReading({
  items,
}: {
  items: Array<{ label: string; current: number; target: number; delta: number }>;
}) {
  return (
    <Card className="p-6">
      <h2 className="font-k2d text-2xl font-semibold text-foreground">
        Leitura rápida por classe
      </h2>
      {items.length === 0 ? (
        <p className="mt-5 font-k2d text-base text-muted">
          Faça um check-in para comparar sua alocação com a meta.
        </p>
      ) : (
        <div className="mt-4 space-y-3">
          {items.map((item) => (
            <DataLine
              key={item.label}
              variant="compact"
              title={item.label}
              detail={`Atual ${percentage(item.current)} · Alvo ${percentage(item.target)}`}
              value={formatSignedPpBR(item.delta)}
            />
          ))}
        </div>
      )}
    </Card>
  );
}

function ReferenceIndicators({ indicators }: { indicators: MacroIndicators }) {
  return (
    <Card className="p-6">
      <h2 className="font-k2d text-2xl font-semibold text-foreground">
        Indicadores de referência
      </h2>
      <div className="mt-4 space-y-3">
        <DataLine
          variant="compact"
          title="Selic meta"
          detail="Atualização BCB"
          value={`${percentage(indicators.selicMetaAnnual)} a.a.`}
        />
        <DataLine
          variant="compact"
          title="CDI anual"
          detail="Atualização BCB"
          value={`${percentage(indicators.cdiAnnual)} a.a.`}
        />
        <DataLine
          variant="compact"
          title="IPCA em 12 meses"
          detail="Atualização BCB"
          value={percentage(indicators.ipca12m)}
        />
      </div>
    </Card>
  );
}
