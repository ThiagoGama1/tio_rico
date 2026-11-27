"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  mascararReais,
  normalizarCampoReais,
  parseReaisParaCentavos,
} from "@/lib/format/moeda";
import {
  lerRascunho,
  mesAtual,
  prazoNoPassado,
  salvarRascunho,
} from "@/lib/onboarding/rascunho";
import { cn } from "@/lib/utils";
import type { InvestorGoal } from "@/lib/types/domain";

// Mesmas classes de erro do componente Input (aria-invalid).
const INVALID_FIELD_CLASSES =
  "aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20";

type GoalErrors = { title?: string; targetAmount?: string; targetDate?: string };

type GoalForm = {
  id: string;
  title: string;
  targetAmount: string;
  targetDate: string;
  priority: NonNullable<InvestorGoal["priority"]>;
};

const EMPTY_GOAL = (id: string): GoalForm => ({
  id,
  title: "",
  targetAmount: "",
  targetDate: "",
  priority: "media",
});

function StepIndicator({
  number,
  title,
  detail,
  state,
}: {
  number: number;
  title: string;
  detail: string;
  state: "complete" | "active" | "upcoming";
}) {
  const isCurrent = state === "active";
  const isComplete = state === "complete";

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
          isCurrent || isComplete
            ? "bg-primary/15 text-(--green-1)"
            : "bg-white/10 text-white/80",
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

function isGoalForm(value: unknown): value is GoalForm {
  if (!value || typeof value !== "object") return false;
  const goal = value as Record<string, unknown>;
  return (
    typeof goal.id === "string" &&
    typeof goal.title === "string" &&
    typeof goal.targetAmount === "string" &&
    typeof goal.targetDate === "string" &&
    ["alta", "media", "baixa"].includes(String(goal.priority))
  );
}

function isFilled(goal: GoalForm) {
  return Boolean(
    goal.title.trim() || goal.targetAmount.trim() || goal.targetDate || goal.priority !== "media",
  );
}

function validateGoal(goal: GoalForm): GoalErrors {
  const errors: GoalErrors = {};
  if (!isFilled(goal)) return errors;

  if (!goal.title.trim()) errors.title = "Informe um título para esta meta.";
  if (goal.targetAmount.trim() && parseReaisParaCentavos(goal.targetAmount) === null) {
    errors.targetAmount = "Valor inválido.";
  }
  if (prazoNoPassado(goal.targetDate)) {
    errors.targetDate = "O prazo não pode ser anterior ao mês atual.";
  }
  return errors;
}

const FIELD_ORDER: Array<{ field: keyof GoalErrors; idPrefix: string }> = [
  { field: "title", idPrefix: "goal-title" },
  { field: "targetAmount", idPrefix: "goal-value" },
  { field: "targetDate", idPrefix: "goal-date" },
];

function formatMonth(value: string) {
  if (!value) return undefined;

  const [year, month] = value.split("-");
  if (!year || !month) return value;

  return `${month}/${year}`;
}

export function OnboardingSecondStep() {
  const router = useRouter();
  const [goals, setGoals] = useState<GoalForm[]>([EMPTY_GOAL("goal-1")]);
  const [nextGoalNumber, setNextGoalNumber] = useState(2);
  const [errors, setErrors] = useState<Record<string, GoalErrors>>({});
  const minMonth = mesAtual();

  // Voltar para esta etapa (ou retomar depois) restaura as metas digitadas (#64 / #65).
  useEffect(() => {
    const saved = lerRascunho().goalsForm;
    if (!Array.isArray(saved)) return;
    const restored = saved.filter(isGoalForm);
    if (restored.length === 0) return;

    const highestNumber = Math.max(
      ...restored.map((goal) => Number(goal.id.replace("goal-", "")) || 0),
    );
    /* eslint-disable react-hooks/set-state-in-effect -- sessionStorage só existe no cliente */
    setGoals(restored);
    setNextGoalNumber(highestNumber + 1);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  function updateGoal(id: string, field: keyof Omit<GoalForm, "id">, value: string) {
    setGoals((currentGoals) =>
      currentGoals.map((goal) =>
        goal.id === id ? { ...goal, [field]: value } : goal,
      ),
    );
    // o erro do campo some assim que a pessoa edita (#50)
    setErrors((current) =>
      current[id]?.[field as keyof GoalErrors]
        ? { ...current, [id]: { ...current[id], [field]: undefined } }
        : current,
    );
  }

  function addGoal() {
    setGoals((currentGoals) => [
      ...currentGoals,
      EMPTY_GOAL(`goal-${nextGoalNumber}`),
    ]);
    setNextGoalNumber((currentNumber) => currentNumber + 1);
  }

  function removeGoal(id: string) {
    setGoals((currentGoals) =>
      currentGoals.length === 1
        ? [EMPTY_GOAL("goal-1")]
        : currentGoals.filter((goal) => goal.id !== id),
    );
  }

  /** Valida, marca os campos com erro e foca o primeiro. Devolve true se está tudo certo. */
  function validateGoals() {
    const nextErrors: Record<string, GoalErrors> = {};
    for (const goal of goals) {
      const goalErrors = validateGoal(goal);
      if (Object.keys(goalErrors).length > 0) nextErrors[goal.id] = goalErrors;
    }
    setErrors(nextErrors);

    for (const goal of goals) {
      const firstInvalid = FIELD_ORDER.find(({ field }) => nextErrors[goal.id]?.[field]);
      if (firstInvalid) {
        document.getElementById(`${firstInvalid.idPrefix}-${goal.id}`)?.focus();
        return false;
      }
    }
    return true;
  }

  /** Grava o que foi digitado (sempre) e as metas prontas para a API (só se válidas). */
  function saveDraft(withGoals: boolean) {
    const fields: Record<string, unknown> = { goalsForm: goals };
    if (withGoals) {
      const serializedGoals: InvestorGoal[] = goals.filter(isFilled).map((goal) => ({
        title: goal.title.trim(),
        targetAmountCents: parseReaisParaCentavos(goal.targetAmount) ?? undefined,
        targetDate: formatMonth(goal.targetDate),
        priority: goal.priority,
      }));
      fields.goals = serializedGoals;
    }
    salvarRascunho(fields);
  }

  function continueToAllocation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!validateGoals()) return;
    saveDraft(true);
    router.push("/onboarding/alocacao");
  }

  // "Terminar depois" guarda o rascunho e sai; o perfil só é salvo ao concluir a etapa 3 (#65).
  function finishLater() {
    if (!validateGoals()) return;
    saveDraft(true);
    router.push("/overview");
  }

  // Voltar não valida: guarda o que foi digitado, mesmo incompleto (#64).
  function goBack() {
    saveDraft(false);
    router.push("/onboarding");
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
            Defina o que importa para você.
          </h1>
          <p className="mt-4 font-k2d text-lg leading-relaxed text-white/75">
            Metas são opcionais e podem ser ajustadas depois.
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
            <StepIndicator number={2} title="Metas" detail="Em andamento" state="active" />
            <StepIndicator
              number={3}
              title="Alocação alvo"
              detail="Próxima etapa"
              state="upcoming"
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
              Etapa 2 de 3
            </p>
            <h1 className="mt-3 font-k2d text-3xl leading-tight font-semibold tracking-tight text-foreground sm:text-4xl">
              Quais objetivos importam hoje?
            </h1>
            <p className="mt-3 font-k2d text-base leading-relaxed text-muted sm:text-lg">
              Metas ajudam a acompanhar seu progresso com base no patrimônio
              registrado nos check-ins.
            </p>
          </header>

          <Card className="mt-6 flex items-center justify-between gap-4 rounded-xl px-6 py-5 sm:px-8">
            <div>
              <h2 className="font-k2d text-xl font-semibold tracking-tight text-foreground">
                Metas são opcionais
              </h2>
              <p className="mt-2 font-k2d text-base text-muted">
                Você pode cadastrar agora ou voltar a esta etapa depois.
              </p>
            </div>
            <span className="shrink-0 rounded-md bg-amber-500/10 px-3 py-2 font-intel text-xs tracking-[0.08em] text-amber-700 uppercase">
              Opcional
            </span>
          </Card>

          {/* noValidate: a validação própria mostra os erros embaixo de cada campo (#50) */}
          <form className="mt-6" noValidate onSubmit={continueToAllocation}>
            <Card className="rounded-xl p-6 sm:p-8">
              <div>
                <h2 className="font-k2d text-2xl font-semibold tracking-tight text-foreground">
                  Adicionar uma meta
                </h2>
                <p className="mt-3 font-k2d text-base text-muted">
                  Defina um objetivo simples. Valor, prazo e prioridade podem ser
                  ajustados depois.
                </p>
              </div>

              <div className="mt-5 grid gap-6 border-t pt-5">
                {goals.map((goal, index) => {
                  const goalErrors = errors[goal.id] ?? {};

                  return (
                  <fieldset
                    key={goal.id}
                    className={cn("grid gap-5 sm:grid-cols-2", index > 0 && "border-t pt-6")}
                  >
                    <legend className="sr-only">Meta {index + 1}</legend>
                    <div className="grid gap-2">
                      <FieldLabel htmlFor={`goal-title-${goal.id}`}>Título</FieldLabel>
                      <input
                        className={cn(
                          "h-12 w-full rounded-md border border-input bg-transparent px-4 font-k2d text-base text-foreground outline-none transition placeholder:text-muted focus:border-(--green-1) focus:ring-2 focus:ring-(--green-1)/20",
                          INVALID_FIELD_CLASSES,
                        )}
                        id={`goal-title-${goal.id}`}
                        maxLength={160}
                        placeholder="Ex.: Reserva de emergência"
                        value={goal.title}
                        aria-invalid={goalErrors.title ? true : undefined}
                        aria-describedby={`goal-title-${goal.id}-help`}
                        onChange={(event) => updateGoal(goal.id, "title", event.target.value)}
                      />
                      <p
                        aria-live="polite"
                        className={cn("font-k2d text-sm", goalErrors.title ? "text-destructive" : "text-muted")}
                        id={`goal-title-${goal.id}-help`}
                      >
                        {goalErrors.title ?? "Obrigatório quando a meta for preenchida"}
                      </p>
                    </div>
                    <div className="grid gap-2">
                      <FieldLabel htmlFor={`goal-value-${goal.id}`}>Valor-alvo</FieldLabel>
                      <input
                        className={cn(
                          "h-12 w-full rounded-md border border-input bg-transparent px-4 font-k2d text-base text-foreground outline-none transition placeholder:text-muted focus:border-(--green-1) focus:ring-2 focus:ring-(--green-1)/20",
                          INVALID_FIELD_CLASSES,
                        )}
                        id={`goal-value-${goal.id}`}
                        inputMode="decimal"
                        placeholder="Opcional"
                        value={goal.targetAmount}
                        aria-invalid={goalErrors.targetAmount ? true : undefined}
                        aria-describedby={`goal-value-${goal.id}-help`}
                        onChange={(event) =>
                          updateGoal(goal.id, "targetAmount", mascararReais(event.target.value))
                        }
                        onBlur={() =>
                          updateGoal(goal.id, "targetAmount", normalizarCampoReais(goal.targetAmount))
                        }
                      />
                      <p
                        aria-live="polite"
                        className={cn("font-k2d text-sm", goalErrors.targetAmount ? "text-destructive" : "text-muted")}
                        id={`goal-value-${goal.id}-help`}
                      >
                        {goalErrors.targetAmount ?? "Ex.: R$ 30.000,00"}
                      </p>
                    </div>
                    <div className="grid gap-2">
                      <FieldLabel htmlFor={`goal-date-${goal.id}`}>Prazo</FieldLabel>
                      <input
                        className={cn(
                          "h-12 w-full rounded-md border border-input bg-transparent px-4 font-k2d text-base text-foreground outline-none transition focus:border-(--green-1) focus:ring-2 focus:ring-(--green-1)/20",
                          INVALID_FIELD_CLASSES,
                        )}
                        id={`goal-date-${goal.id}`}
                        type="month"
                        min={minMonth}
                        value={goal.targetDate}
                        aria-invalid={goalErrors.targetDate ? true : undefined}
                        aria-describedby={`goal-date-${goal.id}-help`}
                        onChange={(event) => updateGoal(goal.id, "targetDate", event.target.value)}
                      />
                      <p
                        aria-live="polite"
                        className={cn("font-k2d text-sm", goalErrors.targetDate ? "text-destructive" : "text-muted")}
                        id={`goal-date-${goal.id}-help`}
                      >
                        {goalErrors.targetDate ?? "Opcional"}
                      </p>
                    </div>
                    <div className="grid gap-2">
                      <FieldLabel htmlFor={`goal-priority-${goal.id}`}>Prioridade</FieldLabel>
                      <select
                        className="h-12 w-full rounded-md border border-input bg-transparent px-4 font-k2d text-base text-foreground outline-none transition focus:border-(--green-1) focus:ring-2 focus:ring-(--green-1)/20"
                        id={`goal-priority-${goal.id}`}
                        value={goal.priority}
                        onChange={(event) => updateGoal(goal.id, "priority", event.target.value)}
                      >
                        <option value="alta">Alta</option>
                        <option value="media">Média</option>
                        <option value="baixa">Baixa</option>
                      </select>
                      <p className="font-k2d text-sm text-muted">Alta · Média · Baixa</p>
                    </div>
                    {goals.length > 1 && (
                      <Button
                        className="w-full justify-center font-k2d sm:w-44"
                        size="lg"
                        type="button"
                        variant="destructive"
                        onClick={() => removeGoal(goal.id)}
                      >
                        Remover meta
                      </Button>
                    )}
                  </fieldset>
                  );
                })}
              </div>

              <Button
                className="mt-6 w-full sm:w-56"
                size="lg"
                type="button"
                variant="secondary"
                onClick={addGoal}
              >
                Adicionar outra meta
              </Button>
            </Card>

            <Card className="mt-6 rounded-xl px-6 py-5 sm:px-8">
              <h2 className="font-k2d text-xl font-semibold tracking-tight text-foreground">
                Progresso sem adivinhação
              </h2>
              <p className="mt-3 font-k2d text-base leading-relaxed text-muted">
                A leitura mostra metas alcançadas, parciais ou sem prazo, sempre
                a partir do patrimônio consolidado nos seus check-ins.
              </p>
            </Card>

            <div className="mt-6 flex flex-col gap-4 pb-6 sm:flex-row sm:items-center sm:justify-between">
              <p className="font-k2d text-base text-muted">
                Na próxima etapa, você define a alocação-alvo.
              </p>
              <div className="flex flex-col gap-4 sm:flex-row">
                <Button
                  className="w-full sm:w-32"
                  size="lg"
                  type="button"
                  variant="secondary"
                  onClick={goBack}
                >
                  Voltar
                </Button>
                <Button
                  className="w-full sm:w-56"
                  size="lg"
                  type="button"
                  variant="secondary"
                  onClick={finishLater}
                >
                  Terminar configuração depois
                </Button>
                <Button className="w-full sm:w-56" size="lg" type="submit">
                  Continuar para alocação
                </Button>
              </div>
            </div>
          </form>
        </div>
      </section>
    </div>
  );
}
