"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { NavigationMenu } from "@/components/ui/navigationMenu";
import { cn } from "@/lib/utils";
import {
  RISK_PROFILE_LABELS,
  type AssetClass,
  type InvestorProfile,
  type TargetAllocation,
} from "@/lib/types/domain";

type ProfileResponse = { profile: InvestorProfile };
type ApiError = { error?: string };

type AllocationState =
  | { status: "loading" }
  | { status: "missing" }
  | { status: "ready"; profile: InvestorProfile }
  | { status: "unavailable"; message: string };

type AllocationField = {
  assetClass: AssetClass;
  label: string;
  description: string;
};

const ALLOCATION_FIELDS: AllocationField[] = [
  {
    assetClass: "renda_fixa_pos",
    label: "Renda fixa pós-fixada",
    description: "CDI / Selic",
  },
  {
    assetClass: "renda_fixa_ipca",
    label: "Renda fixa IPCA+",
    description: "Proteção inflacionária",
  },
  {
    assetClass: "acoes",
    label: "Ações (Brasil)",
    description: "Exposição local",
  },
  {
    assetClass: "internacional",
    label: "Investimentos internacionais",
    description: "Exposição global",
  },
  {
    assetClass: "fiis",
    label: "Fundos imobiliários",
    description: "Renda imobiliária",
  },
  {
    assetClass: "cripto",
    label: "Criptoativos",
    description: "Maior oscilação",
  },
  {
    assetClass: "renda_fixa_pre",
    label: "Renda fixa prefixada",
    description: "Taxa definida",
  },
  {
    assetClass: "caixa",
    label: "Caixa / reserva",
    description: "Liquidez e emergência",
  },
  {
    assetClass: "outros",
    label: "Outros ativos",
    description: "Classes não listadas acima",
  },
];

function emptyAllocationDraft() {
  return Object.fromEntries(
    ALLOCATION_FIELDS.map(({ assetClass }) => [assetClass, ""]),
  ) as Record<AssetClass, string>;
}

function draftFromAllocation(allocation: TargetAllocation) {
  const draft = emptyAllocationDraft();

  for (const { assetClass } of ALLOCATION_FIELDS) {
    const value = allocation[assetClass];
    if (typeof value === "number" && value > 0) {
      draft[assetClass] = String(value).replace(".", ",");
    }
  }

  return draft;
}

function parsePercentage(value: string) {
  const normalized = value.trim().replace(",", ".");
  if (!normalized) return 0;

  const percentage = Number(normalized);
  return Number.isFinite(percentage) ? percentage : Number.NaN;
}

function formatPercentage(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    maximumFractionDigits: 2,
  }).format(value);
}

function AllocationShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh bg-[#faf9f7]">
      <NavigationMenu />
      <section className="min-w-0 flex-1 px-6 py-8 lg:px-10 lg:py-12 xl:px-14">
        {children}
      </section>
    </div>
  );
}

function PageHeader({
  isSaving = false,
  showSaveAction = false,
}: {
  isSaving?: boolean;
  showSaveAction?: boolean;
}) {
  return (
    <header className="flex flex-col justify-between gap-6 sm:flex-row sm:items-start">
      <div>
        <p className="font-intel text-sm tracking-[0.08em] text-muted">
          TIO RICO / INVESTIMENTOS
        </p>
        <h1 className="mt-3 font-k2d text-4xl font-bold tracking-tight text-foreground">
          Alocação alvo
        </h1>
        <p className="mt-2 max-w-3xl font-k2d text-lg text-muted">
          Defina a distribuição que serve de referência para a aderência da sua carteira.
        </p>
      </div>
      {showSaveAction ? (
        <Button
          className="w-auto shrink-0 px-5"
          disabled={isSaving}
          size="lg"
          type="submit"
          form="target-allocation-form"
        >
          {isSaving ? "Salvando..." : "Salvar alocação"}
        </Button>
      ) : null}
    </header>
  );
}

function StatusCard({ children }: { children: React.ReactNode }) {
  return (
    <Card className="mt-8 p-6">
      <p className="font-k2d text-base text-muted">{children}</p>
    </Card>
  );
}

function AllocationSummary({ total, classes }: { total: number; classes: number }) {
  return (
    <section aria-label="Resumo da alocação" className="grid gap-4 sm:grid-cols-2">
      <Card className="p-6">
        <p className="font-intel text-sm tracking-[0.06em] text-muted">
          PERCENTUAL DEFINIDO
        </p>
        <p className="mt-2 font-k2d text-3xl font-bold text-foreground">
          {formatPercentage(total)}%
        </p>
        <p className="mt-2 font-k2d text-base text-muted">
          {total === 100
            ? "Distribuição completa"
            : `${formatPercentage(Math.max(0, 100 - total))}% ainda disponível`}
        </p>
      </Card>
      <Card className="p-6">
        <p className="font-intel text-sm tracking-[0.06em] text-muted">CLASSES COM META</p>
        <p className="mt-2 font-k2d text-3xl font-bold text-foreground">{classes}</p>
        <p className="mt-2 font-k2d text-base text-muted">
          {classes === 1 ? "Classe configurada" : "Classes configuradas"}
        </p>
      </Card>
    </section>
  );
}

export function TargetAllocation() {
  const router = useRouter();
  const [state, setState] = useState<AllocationState>({ status: "loading" });
  const [allocation, setAllocation] = useState(emptyAllocationDraft);
  const [message, setMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const controller = new AbortController();

    async function loadProfile() {
      try {
        const response = await fetch("/api/profile", {
          signal: controller.signal,
          cache: "no-store",
        });
        const payload = (await response.json().catch(() => null)) as
          | ProfileResponse
          | ApiError
          | null;

        if (response.status === 401) {
          router.replace("/login");
          return;
        }

        if (response.status === 404) {
          if (!controller.signal.aborted) setState({ status: "missing" });
          return;
        }

        if (!response.ok || !payload || !("profile" in payload)) {
          throw new Error(
            payload && "error" in payload && typeof payload.error === "string"
              ? payload.error
              : "Não foi possível carregar sua alocação agora.",
          );
        }

        if (!controller.signal.aborted) {
          setAllocation(draftFromAllocation(payload.profile.targetAllocation));
          setState({ status: "ready", profile: payload.profile });
        }
      } catch (error) {
        if (controller.signal.aborted) return;
        setState({
          status: "unavailable",
          message:
            error instanceof Error
              ? error.message
              : "Não foi possível carregar sua alocação agora.",
        });
      }
    }

    void loadProfile();
    return () => controller.abort();
  }, [router]);

  const summary = useMemo(() => {
    const values = ALLOCATION_FIELDS.map(({ assetClass }) => parsePercentage(allocation[assetClass]));
    const hasInvalidValue = values.some((value) => !Number.isFinite(value) || value < 0 || value > 100);
    const total = values.reduce(
      (sum, value) => sum + (Number.isFinite(value) ? value : 0),
      0,
    );
    const classes = values.filter((value) => Number.isFinite(value) && value > 0).length;

    return { classes, hasInvalidValue, total };
  }, [allocation]);

  async function saveAllocation(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (state.status !== "ready") return;

    if (summary.hasInvalidValue) {
      setMessage("Informe percentuais válidos entre 0% e 100%.");
      return;
    }
    if (summary.total > 100.01) {
      setMessage("A soma da alocação-alvo não pode exceder 100%.");
      return;
    }

    const targetAllocation: TargetAllocation = {};
    for (const { assetClass } of ALLOCATION_FIELDS) {
      const value = parsePercentage(allocation[assetClass]);
      if (value > 0) targetAllocation[assetClass] = value;
    }

    setMessage("");
    setIsSaving(true);
    try {
      const response = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetAllocation }),
      });
      const payload = (await response.json().catch(() => null)) as
        | ProfileResponse
        | ApiError
        | null;

      if (response.status === 401) {
        router.replace("/login");
        return;
      }
      if (!response.ok || !payload || !("profile" in payload)) {
        throw new Error(
          payload && "error" in payload && typeof payload.error === "string"
            ? payload.error
            : "Não foi possível salvar a alocação.",
        );
      }

      setAllocation(draftFromAllocation(payload.profile.targetAllocation));
      setState({ status: "ready", profile: payload.profile });
      setMessage("Alocação-alvo salva com sucesso.");
      router.refresh();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Não foi possível salvar a alocação.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  if (state.status === "loading") {
    return (
      <AllocationShell>
        <PageHeader />
        <StatusCard>Carregando sua alocação-alvo...</StatusCard>
      </AllocationShell>
    );
  }

  if (state.status === "missing") {
    return (
      <AllocationShell>
        <PageHeader />
        <Card className="mt-8 p-6 sm:p-8">
          <h2 className="font-k2d text-2xl font-semibold text-foreground">
            Crie seu perfil para definir a alocação
          </h2>
          <p className="mt-3 max-w-2xl font-k2d text-base text-muted">
            A alocação-alvo usa seu perfil de investidor como base e depois ajuda a medir a aderência dos check-ins.
          </p>
          <Button
            render={<Link href="/onboarding" />}
            nativeButton={false}
            className="mt-6 w-auto px-5"
            size="lg"
          >
            Criar perfil do investidor
          </Button>
        </Card>
      </AllocationShell>
    );
  }

  if (state.status === "unavailable") {
    return (
      <AllocationShell>
        <PageHeader />
        <StatusCard>{state.message}</StatusCard>
      </AllocationShell>
    );
  }

  return (
    <AllocationShell>
      <PageHeader isSaving={isSaving} showSaveAction />

      <div className="mt-8 grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(23rem,0.65fr)]">
        <Card className="p-6 sm:p-8">
          <p className="font-intel text-xs tracking-[0.08em] text-(--green-1) uppercase">
            Perfil {RISK_PROFILE_LABELS[state.profile.riskProfile]}
          </p>
          <h2 className="mt-3 font-k2d text-2xl font-semibold tracking-tight text-foreground">
            Distribuição de referência
          </h2>
          <p className="mt-3 max-w-2xl font-k2d text-base text-muted">
            Defina os percentuais por classe. A soma pode chegar a até 100%.
          </p>
        </Card>
        <AllocationSummary classes={summary.classes} total={summary.total} />
      </div>

      <form id="target-allocation-form" className="mt-5" onSubmit={saveAllocation}>
        <Card className="p-6 sm:p-8">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div>
              <h2 className="font-k2d text-2xl font-semibold text-foreground">
                Alocação alvo do investidor
              </h2>
              <p className="mt-2 font-k2d text-base text-muted">
                Preencha as classes que fazem sentido para sua estratégia hoje.
              </p>
            </div>
            <output
              aria-live="polite"
              className={cn(
                "font-intel text-sm tracking-[0.06em]",
                summary.total > 100.01 || summary.hasInvalidValue
                  ? "text-destructive"
                  : "text-(--green-1)",
              )}
            >
              TOTAL: {summary.hasInvalidValue ? "—" : `${formatPercentage(summary.total)}%`}
            </output>
          </div>

          <div className="mt-6 grid gap-4 border-t border-border pt-6 md:grid-cols-2 2xl:grid-cols-3">
            {ALLOCATION_FIELDS.map(({ assetClass, label, description }) => {
              const inputId = `target-allocation-${assetClass}`;
              return (
                <label
                  key={assetClass}
                  className="rounded-xl border border-border bg-background p-5 transition-colors focus-within:border-primary/60"
                  htmlFor={inputId}
                >
                  <span className="block font-k2d text-base font-semibold text-foreground">
                    {label}
                  </span>
                  <span className="mt-1 block font-k2d text-sm text-muted">{description}</span>
                  <span className="relative mt-5 block max-w-32">
                    <input
                      id={inputId}
                      aria-describedby={`${inputId}-help`}
                      aria-label={`Percentual para ${label}`}
                      className="h-11 w-full rounded-md border border-input bg-card px-3 pr-8 font-k2d text-lg font-semibold text-foreground outline-none transition focus:border-(--green-1) focus:ring-2 focus:ring-(--green-1)/20"
                      inputMode="decimal"
                      min="0"
                      placeholder="0"
                      value={allocation[assetClass]}
                      onChange={(event) => {
                        setAllocation((current) => ({
                          ...current,
                          [assetClass]: event.target.value,
                        }));
                        setMessage("");
                      }}
                    />
                    <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center font-k2d text-sm text-muted">
                      %
                    </span>
                    <span className="sr-only" id={`${inputId}-help`}>
                      Informe um percentual entre 0 e 100.
                    </span>
                  </span>
                </label>
              );
            })}
          </div>

          <div className="mt-6 flex flex-col gap-4 border-t border-border pt-6 sm:flex-row sm:items-center sm:justify-between">
            <p aria-live="polite" className="font-k2d text-sm text-muted">
              {message || "A alocação é uma referência e pode ser ajustada quando sua estratégia mudar."}
            </p>
            <Button
              className="w-full sm:w-auto sm:px-5"
              disabled={isSaving}
              size="lg"
              type="submit"
            >
              {isSaving ? "Salvando..." : "Salvar alocação alvo"}
            </Button>
          </div>
        </Card>
      </form>
    </AllocationShell>
  );
}
