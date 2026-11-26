"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { RiskProfile } from "@/lib/types/domain";

type OnboardingFirstStepProps = {
  email: string;
};

type RiskOption = {
  value: RiskProfile;
  title: string;
  description: string;
};

const RISK_OPTIONS: RiskOption[] = [
  {
    value: "conservador",
    title: "Conservador",
    description: "Prioriza estabilidade e menor oscilação.",
  },
  {
    value: "moderado",
    title: "Moderado",
    description: "Equilibra estabilidade e crescimento.",
  },
  {
    value: "arrojado",
    title: "Arrojado",
    description: "Aceita mais oscilação no longo prazo.",
  },
];

const ONBOARDING_DRAFT_KEY = "tio-rico:onboarding-draft";

function StepIndicator({
  number,
  title,
  detail,
  active = false,
}: {
  number: number;
  title: string;
  detail: string;
  active?: boolean;
}) {
  return (
    <li
      className={cn(
        "flex items-center gap-3 rounded-md border px-4 py-3",
        active
          ? "border-primary/40 bg-card text-foreground"
          : "border-white/15 bg-white/5 text-white",
      )}
    >
      <span
        className={cn(
          "grid size-7 shrink-0 place-items-center rounded-full font-intel text-sm",
          active ? "bg-primary/15 text-(--green-1)" : "bg-white/10 text-white/80",
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
            active ? "text-muted" : "text-white/60",
          )}
        >
          {detail}
        </span>
      </span>
    </li>
  );
}

function FieldLabel({ children }: { children: string }) {
  return (
    <label className="font-intel text-xs tracking-[0.08em] text-muted uppercase">
      {children}
    </label>
  );
}

export function OnboardingFirstStep({ email }: OnboardingFirstStepProps) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [riskProfile, setRiskProfile] = useState<RiskProfile>("moderado");
  const [horizonMonths, setHorizonMonths] = useState("60");
  const [monthlyIncome, setMonthlyIncome] = useState("");

  function continueToGoals(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    sessionStorage.setItem(
      ONBOARDING_DRAFT_KEY,
      JSON.stringify({
        name: name.trim(),
        email,
        riskProfile,
        horizonMonths: Number(horizonMonths),
        monthlyIncome,
      }),
    );

    router.push("/onboarding/metas");
  }

  return (
    <main className="min-h-dvh bg-background lg:grid lg:grid-cols-[minmax(20rem,28rem)_1fr]">
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
            E-mail verificado
          </p>
          <h1 className="mt-5 font-k2d text-4xl leading-tight font-semibold tracking-tight">
            Seu acesso está confirmado.
          </h1>
          <p className="mt-4 font-k2d text-lg leading-relaxed text-white/75">
            Vamos preparar a base para acompanhar sua carteira.
          </p>
        </div>

        <div className="mt-10">
          <p className="font-intel text-xs tracking-[0.08em] text-white/50 uppercase">
            Configuração inicial
          </p>
          <ol className="mt-3 grid gap-3">
            <StepIndicator
              number={1}
              title="Perfil do investidor"
              detail="Em andamento"
              active
            />
            <StepIndicator number={2} title="Metas" detail="Próxima etapa" />
            <StepIndicator
              number={3}
              title="Alocação alvo"
              detail="Próxima etapa"
            />
          </ol>
        </div>

        <p className="mt-auto border-t border-white/50 pt-4 font-k2d text-sm leading-relaxed text-white/75">
          Você poderá revisar estas informações no seu perfil depois.
        </p>
      </aside>

      <section className="px-5 py-10 sm:px-10 lg:px-16 lg:py-18">
        <div className="mx-auto w-full max-w-5xl">
          <header className="max-w-3xl">
            <p className="font-intel text-xs tracking-[0.08em] text-muted uppercase">
              Etapa 1 de 3
            </p>
            <h1 className="mt-3 font-k2d text-3xl leading-tight font-semibold tracking-tight text-foreground sm:text-4xl">
              Vamos conhecer seu ponto de partida
            </h1>
            <p className="mt-3 font-k2d text-base leading-relaxed text-muted sm:text-lg">
              Usamos estas informações para calcular aderência e contextualizar
              cada check-in. Não geramos recomendação individual de investimento.
            </p>
          </header>

          <Card className="mt-6 flex items-center justify-between gap-4 rounded-xl px-6 py-5 sm:px-8">
            <div className="min-w-0">
              <p className="font-intel text-xs tracking-[0.08em] text-muted uppercase">
                E-mail confirmado
              </p>
              <p className="mt-2 truncate font-k2d text-base font-medium text-foreground">
                {email || "E-mail da sua conta"}
              </p>
            </div>
            <span className="shrink-0 rounded-md bg-primary/10 px-3 py-2 font-intel text-xs tracking-[0.08em] text-(--green-1) uppercase">
              Verificado
            </span>
          </Card>

          <form className="mt-6 grid gap-6" onSubmit={continueToGoals}>
            <Card className="rounded-xl p-6 sm:p-8">
              <h2 className="font-k2d text-2xl font-semibold tracking-tight text-foreground">
                Sobre você
              </h2>
              <p className="mt-3 font-k2d text-base text-muted">
                Informe seu nome e escolha como você se sente em relação a
                oscilações e risco.
              </p>
              <div className="mt-5 grid gap-5 border-t pt-5 sm:grid-cols-2">
                <div className="grid gap-2">
                  <FieldLabel>Nome</FieldLabel>
                  <input
                    className="h-12 w-full rounded-md border border-input bg-transparent px-4 font-k2d text-base text-foreground outline-none transition focus:border-(--green-1) focus:ring-2 focus:ring-(--green-1)/20"
                    name="name"
                    placeholder="Como gostaria de ser chamado?"
                    autoComplete="name"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    required
                  />
                  <p className="font-k2d text-sm text-muted">Obrigatório</p>
                </div>
                <div className="grid gap-2">
                  <FieldLabel>E-mail</FieldLabel>
                  <output className="flex h-12 items-center rounded-md border border-input bg-muted/5 px-4 font-k2d text-base text-foreground">
                    {email || "E-mail da sua conta"}
                  </output>
                  <p className="font-k2d text-sm text-muted">
                    Verificado e associado ao acesso
                  </p>
                </div>
              </div>
            </Card>

            <Card className="rounded-xl p-6 sm:p-8">
              <fieldset>
                <legend className="font-k2d text-2xl font-semibold tracking-tight text-foreground">
                  Como você se descreve hoje?
                </legend>
                <p className="mt-3 font-k2d text-base text-muted">
                  Escolha a alternativa que melhor representa sua relação com
                  oscilações. Ela pode ser atualizada mais tarde.
                </p>
                <div className="mt-5 grid gap-3 lg:grid-cols-3">
                  {RISK_OPTIONS.map((option) => {
                    const isSelected = riskProfile === option.value;

                    return (
                      <label
                        key={option.value}
                        className={cn(
                          "cursor-pointer rounded-lg border p-5 transition",
                          isSelected
                            ? "border-(--green-1) bg-primary/5 ring-1 ring-(--green-1)"
                            : "border-border hover:border-(--green-1)/50",
                        )}
                      >
                        <input
                          className="sr-only"
                          type="radio"
                          name="riskProfile"
                          value={option.value}
                          checked={isSelected}
                          onChange={() => setRiskProfile(option.value)}
                        />
                        <span className="flex items-center justify-between gap-3">
                          <span className="font-k2d text-lg font-semibold text-foreground">
                            {option.title}
                          </span>
                          <span className="font-intel text-xs text-(--green-1)">
                            {isSelected ? "Escolhido" : "Selecionar"}
                          </span>
                        </span>
                        <span className="mt-3 block font-k2d text-sm leading-relaxed text-muted">
                          {option.description}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            </Card>

            <Card className="rounded-xl p-6 sm:p-8">
              <h2 className="font-k2d text-2xl font-semibold tracking-tight text-foreground">
                Horizonte e contexto financeiro
              </h2>
              <div className="mt-5 grid gap-5 border-t pt-5 sm:grid-cols-2">
                <div className="grid gap-2">
                  <FieldLabel>Horizonte de investimento</FieldLabel>
                  <div className="relative max-w-48">
                    <input
                      className="h-12 w-full rounded-md border border-input bg-transparent py-2 pr-16 pl-4 font-k2d text-base text-foreground outline-none transition focus:border-(--green-1) focus:ring-2 focus:ring-(--green-1)/20"
                      name="horizonMonths"
                      type="number"
                      min="1"
                      max="1200"
                      value={horizonMonths}
                      onChange={(event) => setHorizonMonths(event.target.value)}
                      required
                    />
                    <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center font-k2d text-sm text-muted">
                      meses
                    </span>
                  </div>
                  <p className="font-k2d text-sm text-muted">
                    Obrigatório · entre 1 e 1.200 meses
                  </p>
                </div>
                <div className="grid gap-2">
                  <FieldLabel>Renda mensal</FieldLabel>
                  <input
                    className="h-12 w-full max-w-56 rounded-md border border-input bg-transparent px-4 font-k2d text-base text-foreground outline-none transition placeholder:text-muted focus:border-(--green-1) focus:ring-2 focus:ring-(--green-1)/20"
                    name="monthlyIncome"
                    type="text"
                    inputMode="decimal"
                    placeholder="Opcional"
                    value={monthlyIncome}
                    onChange={(event) => setMonthlyIncome(event.target.value)}
                  />
                  <p className="font-k2d text-sm text-muted">
                    Usada apenas como contexto
                  </p>
                </div>
              </div>
            </Card>

            <div className="flex flex-col gap-4 pb-6 sm:flex-row sm:items-center sm:justify-between">
              <p className="font-k2d text-base text-muted">
                Na próxima etapa, você poderá definir metas.
              </p>
              <Button className="w-full sm:w-52" size="lg" type="submit">
                Continuar para Metas
              </Button>
            </div>
          </form>
        </div>
      </section>
    </main>
  );
}
