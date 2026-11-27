"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { parseReaisParaCentavos } from "@/lib/format/moeda";
import {
  apagarRascunho,
  lerRascunho,
  salvarRascunho,
} from "@/lib/onboarding/rascunho";
import { cn } from "@/lib/utils";
import type {
  AssetClass,
  RiskProfile,
  TargetAllocation,
} from "@/lib/types/domain";

// Mesmas classes de erro do componente Input (aria-invalid).
const INVALID_FIELD_CLASSES =
  "aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20";

const percentFormatter = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });

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
    assetClass: "fiis",
    label: "Fundos imobiliários",
    description: "Renda imobiliária",
  },
  {
    assetClass: "internacional",
    label: "Investimentos internacionais",
    description: "Exposição global",
  },
  {
    assetClass: "cripto",
    label: "Criptoativos",
    description: "Maior oscilação",
  },
  {
    assetClass: "caixa",
    label: "Caixa / reserva",
    description: "Liquidez",
  },
  {
    assetClass: "renda_fixa_pre",
    label: "Renda fixa prefixada",
    description: "Taxa definida",
  },
  {
    assetClass: "outros",
    label: "Outros ativos",
    description: "Classes não listadas acima",
  },
];

function StepIndicator({
  number,
  title,
  detail,
  state,
}: {
  number: number;
  title: string;
  detail: string;
  state: "complete" | "active";
}) {
  const isCurrent = state === "active";

  return (
    <li
      className={cn(
        "flex items-center gap-3 rounded-md border px-4 py-3",
        isCurrent
          ? "border-primary/40 bg-card text-foreground"
          : "border-white/15 bg-white/5 text-white",
      )}
    >
      <span
        className={cn(
          "grid size-7 shrink-0 place-items-center rounded-full font-intel text-sm",
          "bg-primary/15 text-(--green-1)",
        )}
      >
        {number}
      </span>
      <span className="min-w-0">
        <span className="block font-k2d text-base font-semibold leading-tight">
          {title}
        </span>
        <span
          className={cn(
            "mt-1 block font-k2d text-sm leading-tight",
            isCurrent ? "text-muted" : "text-white/60",
          )}
        >
          {detail}
        </span>
      </span>
    </li>
  );
}

function FieldLabel({ children, htmlFor }: { children: string; htmlFor: string }) {
  return (
    <label
      className="font-intel text-xs tracking-[0.08em] text-muted uppercase"
      htmlFor={htmlFor}
    >
      {children}
    </label>
  );
}

function parsePercentage(value: string) {
  const normalized = value.trim().replace(",", ".");
  if (!normalized) return 0;

  const percentage = Number(normalized);
  return Number.isFinite(percentage) ? percentage : Number.NaN;
}

/** Mensagem de erro do campo de percentual, ou "" se válido (#53). */
function percentageError(value: string) {
  const percentage = parsePercentage(value);
  if (!Number.isFinite(percentage)) return "Valor inválido";
  if (percentage < 0) return "Não pode ser negativo";
  if (percentage > 100) return "Máximo de 100%";
  return "";
}

function getInitialAllocation() {
  return Object.fromEntries(
    ALLOCATION_FIELDS.map(({ assetClass }) => [assetClass, ""]),
  ) as Record<AssetClass, string>;
}

export function OnboardingThirdStep() {
  const router = useRouter();
  const [allocation, setAllocation] = useState(getInitialAllocation);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Voltar para esta etapa (ou retomar depois) restaura os percentuais digitados (#64 / #65).
  useEffect(() => {
    const saved = lerRascunho().allocationForm;
    if (!saved || typeof saved !== "object") return;
    const restored = getInitialAllocation();
    for (const { assetClass } of ALLOCATION_FIELDS) {
      const value = (saved as Record<string, unknown>)[assetClass];
      if (typeof value === "string") restored[assetClass] = value;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sessionStorage só existe no cliente
    setAllocation(restored);
  }, []);

  // Soma só os campos válidos; os inválidos ficam marcados no próprio campo (#53).
  const total = useMemo(() => {
    const sum = Object.values(allocation).reduce(
      (acc, value) => (percentageError(value) ? acc : acc + parsePercentage(value)),
      0,
    );
    return Math.round(sum * 100) / 100;
  }, [allocation]);
  const isOverLimit = total > 100;

  function createTargetAllocation() {
    const targetAllocation: TargetAllocation = {};

    for (const { assetClass } of ALLOCATION_FIELDS) {
      const percentage = parsePercentage(allocation[assetClass]);

      if (!Number.isFinite(percentage) || percentage < 0 || percentage > 100) {
        setError("Informe percentuais entre 0% e 100%.");
        return null;
      }

      if (percentage > 0) targetAllocation[assetClass] = percentage;
    }

    const sum = Object.values(targetAllocation).reduce((acc, value) => acc + value, 0);
    if (sum > 100) {
      setError("A soma da alocação-alvo não pode exceder 100%.");
      return null;
    }

    return targetAllocation;
  }

  async function saveProfile() {
    const targetAllocation = createTargetAllocation();
    if (!targetAllocation) return;

    const draft = lerRascunho();
    const horizonMonths = Number(draft.horizonMonths);
    const isValidRiskProfile = ["conservador", "moderado", "arrojado"].includes(
      String(draft.riskProfile),
    );

    if (
      typeof draft.name !== "string" ||
      !draft.name.trim() ||
      !isValidRiskProfile ||
      !Number.isInteger(horizonMonths) ||
      horizonMonths < 1 ||
      horizonMonths > 1200
    ) {
      setError("Volte à etapa de perfil para preencher os dados obrigatórios.");
      return;
    }

    setError("");
    setIsSubmitting(true);

    const profile = {
      name: draft.name.trim(),
      email:
        typeof draft.email === "string" && draft.email.trim()
          ? draft.email.trim()
          : null,
      riskProfile: draft.riskProfile as RiskProfile,
      horizonMonths,
      monthlyIncomeCents:
        typeof draft.monthlyIncome === "string"
          ? parseReaisParaCentavos(draft.monthlyIncome)
          : null,
      goals: Array.isArray(draft.goals) ? draft.goals : [],
      targetAllocation,
    };

    try {
      let response = await fetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(profile),
      });

      if (response.status === 409) {
        response = await fetch("/api/profile", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ targetAllocation }),
        });
      }

      if (!response.ok) {
        // a API responde { error: "mensagem" } (string), não { error: { message } } (#65)
        const payload = (await response.json().catch(() => null)) as {
          error?: unknown;
        } | null;
        throw new Error(
          typeof payload?.error === "string" && payload.error
            ? payload.error
            : "Não foi possível salvar seu perfil.",
        );
      }

      apagarRascunho();
      router.replace("/overview");
      router.refresh();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Não foi possível salvar seu perfil.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  function completeSetup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void saveProfile();
  }

  // "Terminar depois" guarda o rascunho e sai sem gravar no banco, igual à etapa 2 (#65).
  function finishLater() {
    salvarRascunho({ allocationForm: allocation });
    router.push("/overview");
  }

  function goBack() {
    salvarRascunho({ allocationForm: allocation });
    router.push("/onboarding/metas");
  }

  return (
    <div className="min-h-dvh bg-background lg:grid lg:grid-cols-[minmax(20rem,28rem)_1fr]">
      <aside className="hidden min-h-dvh flex-col bg-(--green-2) px-10 py-12 text-white lg:flex">
        <div>
          <p className="font-k2d text-[1.7rem] leading-none font-bold tracking-tight">
            TIO RICO
          </p>
          <p className="mt-3 font-intel text-xs tracking-[0.08em] text-white/75">
            INVESTIMENTOS
          </p>
        </div>

        <div className="mt-16 max-w-72">
          <p className="font-intel text-xs tracking-[0.08em] text-white/50 uppercase">
            Configuração inicial
          </p>
          <h1 className="mt-5 font-k2d text-4xl leading-tight font-semibold tracking-tight">
            Defina sua distribuição de referência.
          </h1>
          <p className="mt-4 font-k2d text-lg leading-relaxed text-white/75">
            A alocação ajuda a ler a aderência nos check-ins.
          </p>
        </div>

        <div className="mt-10">
          <ol className="grid gap-3">
            <StepIndicator
              number={1}
              title="Perfil do investidor"
              detail="Concluída"
              state="complete"
            />
            <StepIndicator number={2} title="Metas" detail="Concluída" state="complete" />
            <StepIndicator
              number={3}
              title="Alocação alvo"
              detail="Em andamento"
              state="active"
            />
          </ol>
        </div>

        <p className="mt-auto border-t border-white/50 pt-4 font-k2d text-sm leading-relaxed text-white/75">
          Conclua o perfil depois, se preferir.
        </p>
      </aside>

      <section className="px-5 py-10 sm:px-10 lg:px-16 lg:py-18">
        <div className="mx-auto w-full max-w-5xl">
          <header className="max-w-3xl">
            <p className="font-intel text-xs tracking-[0.08em] text-muted uppercase">
              Etapa 3 de 3
            </p>
            <h1 className="mt-3 font-k2d text-3xl leading-tight font-semibold tracking-tight text-foreground sm:text-4xl">
              Como você prefere distribuir sua carteira?
            </h1>
            <p className="mt-3 font-k2d text-base leading-relaxed text-muted sm:text-lg">
              Os percentuais definem a referência usada para calcular aderência a cada check-in.
            </p>
          </header>

          <Card className="mt-6 flex items-center justify-between gap-4 rounded-xl px-6 py-5 sm:px-8">
            <div>
              <h2 className="font-k2d text-xl font-semibold tracking-tight text-foreground">
                Distribuição de referência
              </h2>
              <p className="mt-2 font-k2d text-base text-muted">
                A soma das classes não pode exceder 100%.
              </p>
            </div>
            <div className="shrink-0 text-right">
              <p className="font-intel text-xs tracking-[0.08em] text-muted uppercase">
                Definido
              </p>
              <output
                aria-live="polite"
                className={cn(
                  "mt-1 block font-k2d text-2xl font-semibold",
                  isOverLimit ? "text-destructive" : "text-(--green-1)",
                )}
              >
                {`${percentFormatter.format(total)}%`}
              </output>
              {isOverLimit ? (
                <p className="mt-1 font-k2d text-sm text-destructive">Acima de 100%</p>
              ) : null}
            </div>
          </Card>

          <form className="mt-6" onSubmit={completeSetup}>
            <Card className="rounded-xl p-6 sm:p-8">
              <h2 className="font-k2d text-2xl font-semibold tracking-tight text-foreground">
                Alocação-alvo
              </h2>
              <p className="mt-3 font-k2d text-base text-muted">
                Você pode preencher somente as classes que fizerem sentido agora.
              </p>

              <div className="mt-5 grid gap-x-12 gap-y-6 border-t pt-5 sm:grid-cols-2">
                {ALLOCATION_FIELDS.map(({ assetClass, label, description }) => {
                  const inputId = `allocation-${assetClass}`;
                  const fieldError = percentageError(allocation[assetClass]);

                  return (
                    <div key={assetClass} className="grid justify-items-start gap-2">
                      <FieldLabel htmlFor={inputId}>{label}</FieldLabel>
                      <div className="relative">
                        <input
                          aria-describedby={`${inputId}-description`}
                          aria-invalid={fieldError ? true : undefined}
                          className={cn(
                            "h-12 w-20 rounded-md border border-input bg-transparent px-3 pr-7 font-k2d text-base text-foreground outline-none transition focus:border-(--green-1) focus:ring-2 focus:ring-(--green-1)/20",
                            INVALID_FIELD_CLASSES,
                          )}
                          id={inputId}
                          inputMode="decimal"
                          min="0"
                          name={assetClass}
                          placeholder="0"
                          value={allocation[assetClass]}
                          onChange={(event) => {
                            setAllocation((current) => ({
                              ...current,
                              [assetClass]: event.target.value,
                            }));
                            setError("");
                          }}
                        />
                        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center font-k2d text-sm text-muted">
                          %
                        </span>
                      </div>
                      <p
                        aria-live="polite"
                        className={cn("font-k2d text-sm", fieldError ? "text-destructive" : "text-muted")}
                        id={`${inputId}-description`}
                      >
                        {fieldError || description}
                      </p>
                    </div>
                  );
                })}
              </div>
            </Card>

            <div className="mt-6 flex flex-col gap-4 pb-6 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-k2d text-base text-muted">
                  Você poderá concluir esta etapa pelo perfil depois.
                </p>
                <p aria-live="polite" className="mt-2 font-k2d text-sm text-destructive">
                  {error}
                </p>
              </div>
              <div className="flex flex-col gap-4 sm:flex-row">
                <Button
                  className="w-full sm:w-32"
                  disabled={isSubmitting}
                  size="lg"
                  type="button"
                  variant="secondary"
                  onClick={goBack}
                >
                  Voltar
                </Button>
                <Button
                  className="w-full sm:w-62"
                  disabled={isSubmitting}
                  size="lg"
                  type="button"
                  variant="secondary"
                  onClick={finishLater}
                >
                  Terminar configuração depois
                </Button>
                <Button className="w-full sm:w-52" disabled={isSubmitting} size="lg" type="submit">
                  {isSubmitting ? "Salvando..." : "Concluir configuração"}
                </Button>
              </div>
            </div>
          </form>
        </div>
      </section>
    </div>
  );
}
