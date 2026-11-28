"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DataLine } from "@/components/ui/dataLine";
import { NavigationMenu } from "@/components/ui/navigationMenu";
import {
  formatCentsBRL,
  formatSignedPpBR,
  type PortfolioEvolutionResult,
} from "@/lib/history/evolution";
import {
  ASSET_CLASS_LABELS,
  type CheckInDetail,
  type InvestorProfile,
  type MacroIndicators,
} from "@/lib/types/domain";

type OverviewData = {
  profile: InvestorProfile;
  evolution: PortfolioEvolutionResult;
  checkIns: CheckInDetail[];
  indicators: MacroIndicators;
};

type EvolutionResponse = Omit<OverviewData, "indicators"> & {
  checkInsCount: number;
};

type OverviewState =
  | { status: "loading" }
  | { status: "ready"; data: OverviewData }
  | { status: "unavailable"; message: string }
  | { status: "needsProfile" };

class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

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

function responseErrorMessage(payload: unknown) {
  if (
    typeof payload === "object" &&
    payload !== null &&
    "error" in payload &&
    typeof payload.error === "string"
  ) {
    return payload.error;
  }

  return "Não foi possível carregar a visão geral agora. Tente novamente em alguns instantes.";
}

async function getJson<T>(url: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal });
  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    throw new ApiRequestError(response.status, responseErrorMessage(payload));
  }

  return payload as T;
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
    <div className="flex min-h-dvh bg-[#faf9f7] max-lg:flex-col">
      <NavigationMenu />
      <section className="min-w-0 flex-1 px-6 py-8 lg:px-10 lg:py-12 xl:px-14">
        {children}
      </section>
    </div>
  );
}

function OverviewUnavailable({
  message,
  needsProfile = false,
}: {
  message: string;
  needsProfile?: boolean;
}) {
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
        {needsProfile ? (
          <Button render={<Link href="/onboarding" />} nativeButton={false} size="lg">
            Concluir cadastro
          </Button>
        ) : (
          <Button render={<Link href="/check-ins/new" />} nativeButton={false} size="lg">
            Novo check-in
          </Button>
        )}
      </header>
      <OverviewMessage>{message}</OverviewMessage>
    </OverviewShell>
  );
}

export function Overview() {
  const router = useRouter();
  const [state, setState] = useState<OverviewState>({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();

    async function loadOverview() {
      try {
        const [evolution, indicators] = await Promise.all([
          getJson<EvolutionResponse>(
            "/api/portfolio/evolution",
            controller.signal,
          ),
          getJson<MacroIndicators>("/api/indicators", controller.signal),
        ]);

        if (!controller.signal.aborted) {
          setState({
            status: "ready",
            data: { ...evolution, indicators },
          });
        }
      } catch (error) {
        if (controller.signal.aborted) return;

        if (error instanceof ApiRequestError && error.status === 401) {
          router.replace("/login");
          return;
        }

        // 404 = usuário ainda sem perfil: orienta a concluir o cadastro em vez
        // de mostrar a mensagem técnica da API (#62).
        if (error instanceof ApiRequestError && error.status === 404) {
          setState({ status: "needsProfile" });
          return;
        }

        setState({
          status: "unavailable",
          message:
            error instanceof ApiRequestError
              ? error.message
              : "Não foi possível carregar a visão geral agora. Tente novamente em alguns instantes.",
        });
      }
    }

    void loadOverview();

    return () => controller.abort();
  }, [router]);

  if (state.status === "loading") {
    return <OverviewUnavailable message="Carregando sua visão geral..." />;
  }

  if (state.status === "unavailable") {
    return <OverviewUnavailable message={state.message} />;
  }

  if (state.status === "needsProfile") {
    return (
      <OverviewUnavailable
        needsProfile
        message="Conclua seu perfil de investidor para ver sua visão geral."
      />
    );
  }

  const { checkIns, evolution, indicators, profile } = state.data;
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
        <Button
          render={<Link href="/check-ins/new" />}
          nativeButton={false}
          size="lg"
          className="shrink-0"
        >
          Novo check-in
        </Button>
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
  items: Array<{ label: string; current: number; target: number }>;
}) {
  // O número ao lado de "Atual · Alvo" é o desvio frente ao alvo (atual − alvo),
  // e não a variação desde o mês anterior (#67).
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
              detail={`Atual ${percentage(item.current)} · Alvo ${percentage(item.target)} · desvio do alvo`}
              value={formatSignedPpBR(item.current - item.target)}
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
