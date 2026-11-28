"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DataLine } from "@/components/ui/dataLine";
import { NavigationMenu } from "@/components/ui/navigationMenu";
import {
  formatCentsBRL,
  formatSignedCentsBRL,
  formatSignedPctBR,
  type PortfolioEvolutionResult,
} from "@/lib/history/evolution";
import { ASSET_CLASS_LABELS, type InvestorProfile } from "@/lib/types/domain";

type EvolutionResponse = {
  profile: InvestorProfile;
  evolution: PortfolioEvolutionResult;
  checkInsCount: number;
};

type EvolutionState =
  | { status: "loading" }
  | { status: "ready"; data: EvolutionResponse }
  | { status: "unavailable"; message: string };

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
  const date = new Date(Number(year), Number(month) - 1, 1);

  return new Intl.DateTimeFormat("pt-BR", { month: "short", year: "numeric" })
    .format(date)
    .replace(" de ", "/")
    .replace(".", "")
    .toUpperCase();
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

  return "Não foi possível carregar sua evolução agora. Tente novamente em alguns instantes.";
}

async function getEvolution(signal: AbortSignal): Promise<EvolutionResponse> {
  const response = await fetch("/api/portfolio/evolution", { signal });
  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    throw new ApiRequestError(response.status, responseErrorMessage(payload));
  }

  return payload as EvolutionResponse;
}

function EvolutionShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh bg-[#faf9f7] max-lg:flex-col">
      <NavigationMenu />
      <section className="min-w-0 flex-1 px-6 py-8 lg:px-10 lg:py-12 xl:px-14">
        {children}
      </section>
    </div>
  );
}

function EvolutionHeader() {
  return (
    <header className="flex flex-col justify-between gap-6 sm:flex-row sm:items-start">
      <div>
        <p className="font-intel text-sm tracking-[0.08em] text-muted">
          TIO RICO / INVESTIMENTOS
        </p>
        <h1 className="mt-3 font-k2d text-4xl font-bold tracking-tight text-foreground">
          Evolução
        </h1>
        <p className="mt-2 max-w-2xl font-k2d text-lg text-muted">
          Acompanhe o patrimônio, os aportes e as mudanças na composição da sua carteira.
        </p>
      </div>
      <Button
        render={<Link href="/check-ins" />}
        nativeButton={false}
        size="lg"
        className="shrink-0"
      >
        Ver check-ins
      </Button>
    </header>
  );
}

function MessageCard({ children }: { children: React.ReactNode }) {
  return (
    <Card className="mt-8 p-6">
      <p className="font-k2d text-base text-muted">{children}</p>
    </Card>
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

function PortfolioChart({ evolution }: { evolution: PortfolioEvolutionResult }) {
  const points = evolution.points;
  const chart = useMemo(() => {
    if (points.length < 2) return null;

    const values = points.map((point) => point.totalValueCents);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const horizontalPadding = 7;
    const verticalPadding = 10;
    const range = max - min || 1;

    return points
      .map((point, index) => {
        const x = horizontalPadding + (index / (points.length - 1)) * (100 - horizontalPadding * 2);
        const y = 100 - verticalPadding - ((point.totalValueCents - min) / range) * (100 - verticalPadding * 2);
        return { id: point.checkInId, x, y };
      });
  }, [points]);

  if (points.length === 0) {
    return (
      <p className="mt-5 font-k2d text-base text-muted">
        Seu histórico aparecerá aqui depois do primeiro check-in.
      </p>
    );
  }

  if (points.length === 1) {
    return (
      <div className="mt-5 rounded-xl border border-dashed border-border bg-background px-5 py-8">
        <p className="font-k2d text-lg font-medium text-foreground">
          Primeiro check-in registrado
        </p>
        <p className="mt-2 font-k2d text-base text-muted">
          Registre o próximo check-in para visualizar a linha de evolução da carteira.
        </p>
        <p className="mt-5 font-k2d text-2xl font-semibold text-foreground">
          {formatCentsBRL(points[0].totalValueCents)}
        </p>
      </div>
    );
  }

  const coordinates = chart?.map((point) => `${point.x},${point.y}`).join(" ") ?? "";

  return (
    <div className="mt-5">
      <div className="relative h-52 overflow-hidden rounded-xl border border-border bg-background px-3 py-4 sm:h-60">
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="h-full w-full overflow-visible"
          role="img"
          aria-label="Linha de evolução do patrimônio por check-in"
        >
          <line x1="7" x2="93" y1="90" y2="90" className="stroke-border" vectorEffect="non-scaling-stroke" />
          <line x1="7" x2="93" y1="50" y2="50" className="stroke-border/70" strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />
          <polyline
            points={coordinates}
            fill="none"
            className="stroke-primary"
            strokeWidth="2.5"
            vectorEffect="non-scaling-stroke"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {chart?.map((point) => (
            <circle
              key={point.id}
              cx={point.x}
              cy={point.y}
              r="1.8"
              className="fill-card stroke-primary"
              strokeWidth="1.5"
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </svg>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3 xl:grid-cols-4">
        {points.map((point) => (
          <div key={point.checkInId} className="min-w-0">
            <p className="font-intel text-xs tracking-[0.06em] text-(--green-1)">
              {monthLabel(point.referenceMonth)}
            </p>
            <p className="mt-1 truncate font-k2d text-sm font-medium text-foreground">
              {formatCentsBRL(point.totalValueCents)}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function LatestPeriod({ evolution }: { evolution: PortfolioEvolutionResult }) {
  const changes = evolution.classDeltas
    .filter((item) => item.deltaCents !== 0 || item.deltaPct !== 0)
    .sort((left, right) => Math.abs(right.deltaCents) - Math.abs(left.deltaCents));

  return (
    <Card className="p-6">
      <h2 className="font-k2d text-2xl font-semibold text-foreground">Último período</h2>
      {evolution.totalCheckIns < 2 ? (
        <p className="mt-5 font-k2d text-base text-muted">
          Registre mais um check-in para comparar as mudanças por classe de ativo.
        </p>
      ) : changes.length === 0 ? (
        <p className="mt-5 font-k2d text-base text-muted">
          Não houve mudanças de composição entre os dois últimos check-ins.
        </p>
      ) : (
        <div className="mt-5 space-y-3">
          {changes.map((item) => (
            <DataLine
              key={item.assetClass}
              variant="compact"
              title={ASSET_CLASS_LABELS[item.assetClass]}
              detail={`${formatCentsBRL(item.previousCents)} → ${formatCentsBRL(item.currentCents)}`}
              value={formatSignedCentsBRL(item.deltaCents)}
            />
          ))}
        </div>
      )}
    </Card>
  );
}

function PeriodDetail({ evolution }: { evolution: PortfolioEvolutionResult }) {
  const latest = evolution.periodMetrics.at(-1);
  const previous = evolution.points.at(-2);

  return (
    <Card className="p-6">
      <h2 className="font-k2d text-2xl font-semibold text-foreground">
        Detalhamento do período
      </h2>
      {!latest ? (
        <p className="mt-5 font-k2d text-base text-muted">
          Ainda não há períodos registrados para detalhar.
        </p>
      ) : previous && latest.periodDeltaCents !== null ? (
        <div className="mt-5 flex flex-col gap-5 rounded-xl border border-border px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="font-k2d text-lg font-medium text-foreground">
              {monthLabel(previous.referenceMonth)} → {monthLabel(latest.referenceMonth)}
            </p>
            <p className="mt-1 font-k2d text-sm text-muted">
              Variação total {formatSignedCentsBRL(latest.periodDeltaCents)}
              {latest.periodDeltaPct === null ? "" : ` (${formatSignedPctBR(latest.periodDeltaPct)})`}
              {" · "}aporte {formatCentsBRL(latest.contributionCents)}
            </p>
          </div>
          <div className="lg:text-right">
            <p className="font-intel text-xs tracking-[0.06em] text-muted">RESULTADO ESTIMADO</p>
            <p className="mt-1 font-k2d text-2xl font-semibold text-foreground">
              {latest.estimatedPeriodGainCents === null
                ? "—"
                : formatSignedCentsBRL(latest.estimatedPeriodGainCents)}
            </p>
          </div>
        </div>
      ) : (
        <div className="mt-5 rounded-xl border border-border px-5 py-4">
          <p className="font-k2d text-lg font-medium text-foreground">
            {monthLabel(latest.referenceMonth)}
          </p>
          <p className="mt-1 font-k2d text-sm text-muted">
            Primeiro registro com patrimônio de {formatCentsBRL(latest.totalValueCents)} e aporte de {formatCentsBRL(latest.contributionCents)}.
          </p>
        </div>
      )}
    </Card>
  );
}

function EvolutionContent({ data }: { data: EvolutionResponse }) {
  const { evolution } = data;
  const latestPoint = evolution.points.at(-1);
  const firstPoint = evolution.points[0];

  return (
    <>
      <section aria-label="Resumo da evolução" className="mt-8 grid gap-4 md:grid-cols-3">
        <SummaryCard
          label="ÚLTIMO PERÍODO"
          value={
            evolution.deltaFromPreviousCents === null
              ? "—"
              : formatSignedCentsBRL(evolution.deltaFromPreviousCents)
          }
          detail={
            evolution.deltaFromPreviousPct === null
              ? "Registre dois check-ins para comparar"
              : `${formatSignedPctBR(evolution.deltaFromPreviousPct)} desde o último check-in`
          }
        />
        <SummaryCard
          label="DESDE O PRIMEIRO"
          value={
            evolution.deltaFromFirstCents === null
              ? "—"
              : formatSignedCentsBRL(evolution.deltaFromFirstCents)
          }
          detail={
            firstPoint && latestPoint && evolution.totalCheckIns > 1
              ? `${monthLabel(firstPoint.referenceMonth)} até ${monthLabel(latestPoint.referenceMonth)}`
              : "Registre novos check-ins para acompanhar"
          }
        />
        <SummaryCard
          label="APORTES ACUMULADOS"
          value={formatCentsBRL(evolution.totalContributedCents)}
          detail={
            evolution.totalCheckIns > 0
              ? `${evolution.totalCheckIns} check-in${evolution.totalCheckIns === 1 ? "" : "s"} registrado${evolution.totalCheckIns === 1 ? "" : "s"}`
              : "Nenhum aporte registrado ainda"
          }
        />
      </section>

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(22rem,0.85fr)]">
        <Card className="p-6">
          <div>
            <h2 className="font-k2d text-2xl font-semibold text-foreground">
              Linha temporal por check-in
            </h2>
            <p className="mt-2 font-k2d text-base text-muted">
              Patrimônio consolidado informado em cada registro.
            </p>
          </div>
          <PortfolioChart evolution={evolution} />
        </Card>
        <LatestPeriod evolution={evolution} />
      </div>

      <div className="mt-5">
        <PeriodDetail evolution={evolution} />
      </div>
    </>
  );
}

export function Evolution() {
  const router = useRouter();
  const [state, setState] = useState<EvolutionState>({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();

    async function loadEvolution() {
      try {
        const data = await getEvolution(controller.signal);
        if (!controller.signal.aborted) {
          setState({ status: "ready", data });
        }
      } catch (error) {
        if (controller.signal.aborted) return;

        if (error instanceof ApiRequestError && error.status === 401) {
          router.replace("/login");
          return;
        }

        setState({
          status: "unavailable",
          message:
            error instanceof ApiRequestError
              ? error.message
              : "Não foi possível carregar sua evolução agora. Tente novamente em alguns instantes.",
        });
      }
    }

    void loadEvolution();
    return () => controller.abort();
  }, [router]);

  return (
    <EvolutionShell>
      <EvolutionHeader />
      {state.status === "loading" ? <MessageCard>Carregando sua evolução...</MessageCard> : null}
      {state.status === "unavailable" ? <MessageCard>{state.message}</MessageCard> : null}
      {state.status === "ready" ? <EvolutionContent data={state.data} /> : null}
    </EvolutionShell>
  );
}
