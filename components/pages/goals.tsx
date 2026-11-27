"use client";

import { Dialog } from "@base-ui/react/dialog";
import { Pencil, Plus, Trash2, X } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { NavigationMenu } from "@/components/ui/navigationMenu";
import {
  computeGoalProgress,
  formatCentsBRL,
  type PortfolioEvolutionResult,
} from "@/lib/history/evolution";
import type { InvestorGoal, InvestorProfile } from "@/lib/types/domain";

type GoalsResponse = {
  profile: InvestorProfile;
  evolution: PortfolioEvolutionResult;
};

type ProfileResponse = { profile: InvestorProfile };
type ApiError = { error?: string };

type GoalsState =
  | { status: "loading" }
  | { status: "missing" }
  | { status: "ready"; data: GoalsResponse }
  | { status: "unavailable"; message: string };

type GoalDraft = {
  title: string;
  targetAmount: string;
  targetDate: string;
  priority: NonNullable<InvestorGoal["priority"]>;
};

const EMPTY_DRAFT: GoalDraft = {
  title: "",
  targetAmount: "",
  targetDate: "",
  priority: "media",
};

function centsFromCurrency(value: string) {
  const normalized = value.trim().replace(/[^\d,.-]/g, "");
  if (!normalized) return undefined;

  const decimalValue = normalized.includes(",")
    ? normalized.replace(/\./g, "").replace(",", ".")
    : normalized;
  const amount = Number(decimalValue);

  return Number.isFinite(amount) && amount >= 0
    ? Math.round(amount * 100)
    : Number.NaN;
}

function amountInputValue(cents: number | undefined) {
  if (typeof cents !== "number") return "";

  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

function monthInputValue(value: string | undefined) {
  if (!value) return "";
  if (/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) return value;

  const match = value.match(/^(0[1-9]|1[0-2])\/(\d{4})$/);
  return match ? `${match[2]}-${match[1]}` : "";
}

function monthLabel(value: string | null) {
  if (!value) return "Sem prazo";

  const isoMatch = value.match(/^(\d{4})-(0[1-9]|1[0-2])$/);
  const slashMatch = value.match(/^(0[1-9]|1[0-2])\/(\d{4})$/);
  const year = isoMatch?.[1] ?? slashMatch?.[2];
  const month = isoMatch?.[2] ?? slashMatch?.[1];

  if (!year || !month) return value;

  return new Intl.DateTimeFormat("pt-BR", { month: "short", year: "numeric" })
    .format(new Date(Number(year), Number(month) - 1, 1))
    .replace(" de ", "/")
    .replace(".", "")
    .toUpperCase();
}

function dateSortValue(value: string | undefined) {
  const normalized = monthInputValue(value);
  return normalized ? Number(normalized.replace("-", "")) : Number.POSITIVE_INFINITY;
}

function priorityLabel(priority: InvestorGoal["priority"]) {
  if (priority === "alta") return "Alta";
  if (priority === "baixa") return "Baixa";
  return "Média";
}

function goalDraftFrom(goal: InvestorGoal): GoalDraft {
  return {
    title: goal.title,
    targetAmount: amountInputValue(goal.targetAmountCents),
    targetDate: monthInputValue(goal.targetDate),
    priority: goal.priority ?? "media",
  };
}

function GoalsShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh bg-[#faf9f7]">
      <NavigationMenu />
      <section className="min-w-0 flex-1 px-6 py-8 lg:px-10 lg:py-12 xl:px-14">
        {children}
      </section>
    </div>
  );
}

function GoalsHeader({
  onAdd,
  disabled = false,
}: {
  onAdd?: () => void;
  disabled?: boolean;
}) {
  return (
    <header className="flex flex-col justify-between gap-6 sm:flex-row sm:items-start">
      <div>
        <p className="font-intel text-sm tracking-[0.08em] text-muted">
          TIO RICO / INVESTIMENTOS
        </p>
        <h1 className="mt-3 font-k2d text-4xl font-bold tracking-tight text-foreground">
          Metas
        </h1>
        <p className="mt-2 max-w-3xl font-k2d text-lg text-muted">
          Objetivos acompanhados a partir da evolução consolidada da sua carteira.
        </p>
      </div>
      {onAdd ? (
        <Button
          size="lg"
          className="w-auto shrink-0 px-5"
          disabled={disabled}
          onClick={onAdd}
        >
          <Plus aria-hidden="true" />
          Adicionar meta
        </Button>
      ) : null}
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

function StatusMessage({ children }: { children: React.ReactNode }) {
  return (
    <Card className="mt-8 p-6">
      <p className="font-k2d text-base text-muted">{children}</p>
    </Card>
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

export function Goals() {
  const router = useRouter();
  const [state, setState] = useState<GoalsState>({ status: "loading" });
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [draft, setDraft] = useState<GoalDraft>(EMPTY_DRAFT);
  const [formError, setFormError] = useState("");
  const [message, setMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [deletingIndex, setDeletingIndex] = useState<number | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    async function loadGoals() {
      try {
        const response = await fetch("/api/portfolio/evolution", {
          signal: controller.signal,
          cache: "no-store",
        });
        const payload = (await response.json().catch(() => null)) as
          | GoalsResponse
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

        if (!response.ok || !payload || !("profile" in payload) || !("evolution" in payload)) {
          throw new Error(
            payload && "error" in payload && typeof payload.error === "string"
              ? payload.error
              : "Não foi possível carregar suas metas agora.",
          );
        }

        if (!controller.signal.aborted) {
          setState({ status: "ready", data: payload });
        }
      } catch (error) {
        if (controller.signal.aborted) return;
        setState({
          status: "unavailable",
          message:
            error instanceof Error
              ? error.message
              : "Não foi possível carregar suas metas agora.",
        });
      }
    }

    void loadGoals();
    return () => controller.abort();
  }, [router]);

  const summary = useMemo(() => {
    if (state.status !== "ready") {
      return { count: "—", nextDeadline: "—", deadlineDetail: "", targetValue: "—" };
    }

    const { goals } = state.data.profile;
    const datedGoals = goals
      .filter((goal) => monthInputValue(goal.targetDate))
      .sort((left, right) => dateSortValue(left.targetDate) - dateSortValue(right.targetDate));
    const totalTargetCents = goals.reduce(
      (total, goal) => total + (goal.targetAmountCents ?? 0),
      0,
    );

    return {
      count: String(goals.length),
      nextDeadline: datedGoals[0] ? monthLabel(datedGoals[0].targetDate ?? null) : "SEM PRAZO",
      deadlineDetail: datedGoals[0]
        ? datedGoals[0].title
        : "Adicione uma data para acompanhar prazos",
      targetValue: formatCentsBRL(totalTargetCents),
    };
  }, [state]);

  function openCreateDialog() {
    setEditingIndex(null);
    setDraft(EMPTY_DRAFT);
    setFormError("");
    setIsDialogOpen(true);
  }

  function openEditDialog(index: number, goal: InvestorGoal) {
    setEditingIndex(index);
    setDraft(goalDraftFrom(goal));
    setFormError("");
    setIsDialogOpen(true);
  }

  function closeDialog() {
    if (isSaving) return;
    setIsDialogOpen(false);
    setEditingIndex(null);
    setDraft(EMPTY_DRAFT);
    setFormError("");
  }

  async function persistGoals(nextGoals: InvestorGoal[], successMessage: string) {
    if (state.status !== "ready") return false;

    const response = await fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ goals: nextGoals }),
    });
    const payload = (await response.json().catch(() => null)) as
      | ProfileResponse
      | ApiError
      | null;

    if (response.status === 401) {
      router.replace("/login");
      return false;
    }

    if (!response.ok || !payload || !("profile" in payload)) {
      throw new Error(
        payload && "error" in payload && typeof payload.error === "string"
          ? payload.error
          : "Não foi possível salvar suas metas.",
      );
    }

    setState((current) => {
      if (current.status !== "ready") return current;

      const evolution = current.data.evolution;
      return {
        status: "ready",
        data: {
          profile: payload.profile,
          evolution: {
            ...evolution,
            goalProgress: computeGoalProgress(
              evolution.latestTotalCents,
              payload.profile.goals,
            ),
          },
        },
      };
    });
    setMessage(successMessage);
    router.refresh();
    return true;
  }

  async function saveGoal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (state.status !== "ready") return;

    const title = draft.title.trim();
    const targetAmountCents = centsFromCurrency(draft.targetAmount);

    if (!title) {
      setFormError("Informe um título para a meta.");
      return;
    }
    if (Number.isNaN(targetAmountCents)) {
      setFormError("Informe um valor-alvo válido ou deixe o campo em branco.");
      return;
    }

    const goal: InvestorGoal = {
      title,
      targetAmountCents,
      targetDate: draft.targetDate || undefined,
      priority: draft.priority,
    };
    const nextGoals = [...state.data.profile.goals];
    if (editingIndex === null) {
      nextGoals.push(goal);
    } else {
      nextGoals[editingIndex] = goal;
    }

    setFormError("");
    setIsSaving(true);
    try {
      const saved = await persistGoals(
        nextGoals,
        editingIndex === null ? "Meta adicionada com sucesso." : "Meta atualizada com sucesso.",
      );
      if (saved) {
        setIsDialogOpen(false);
        setEditingIndex(null);
        setDraft(EMPTY_DRAFT);
        setFormError("");
      }
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : "Não foi possível salvar sua meta.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function deleteGoal(index: number) {
    if (state.status !== "ready") return;

    setDeletingIndex(index);
    setMessage("");
    try {
      const nextGoals = state.data.profile.goals.filter((_, itemIndex) => itemIndex !== index);
      await persistGoals(nextGoals, "Meta removida com sucesso.");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Não foi possível remover sua meta.",
      );
    } finally {
      setDeletingIndex(null);
    }
  }

  if (state.status === "loading") {
    return (
      <GoalsShell>
        <GoalsHeader />
        <StatusMessage>Carregando suas metas...</StatusMessage>
      </GoalsShell>
    );
  }

  if (state.status === "missing") {
    return (
      <GoalsShell>
        <GoalsHeader />
        <Card className="mt-8 p-6 sm:p-8">
          <h2 className="font-k2d text-2xl font-semibold text-foreground">
            Primeiro, configure seu perfil
          </h2>
          <p className="mt-2 max-w-2xl font-k2d text-base text-muted">
            Crie seu perfil de investidor para registrar metas e acompanhar a evolução da carteira.
          </p>
          <Button
            render={<Link href="/onboarding" />}
            nativeButton={false}
            size="lg"
            className="mt-6 w-auto px-5"
          >
            Criar perfil
          </Button>
        </Card>
      </GoalsShell>
    );
  }

  if (state.status === "unavailable") {
    return (
      <GoalsShell>
        <GoalsHeader />
        <StatusMessage>{state.message}</StatusMessage>
      </GoalsShell>
    );
  }

  const { profile, evolution } = state.data;

  return (
    <GoalsShell>
      <GoalsHeader onAdd={openCreateDialog} disabled={isSaving} />

      <section aria-label="Resumo das metas" className="mt-8 grid gap-4 md:grid-cols-3">
        <SummaryCard
          label="METAS CADASTRADAS"
          value={summary.count}
          detail={profile.goals.length === 1 ? "Objetivo em acompanhamento" : "Objetivos em acompanhamento"}
        />
        <SummaryCard
          label="PRÓXIMO PRAZO"
          value={summary.nextDeadline}
          detail={summary.deadlineDetail}
        />
        <SummaryCard
          label="VALOR-ALVO TOTAL"
          value={summary.targetValue}
          detail="Soma dos objetivos com valor definido"
        />
      </section>

      <Card className="mt-5 p-6">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
          <div>
            <h2 className="font-k2d text-2xl font-semibold text-foreground">Objetivos</h2>
            <p className="mt-2 max-w-3xl font-k2d text-base text-muted">
              Título, valor-alvo, data e prioridade. O progresso considera o patrimônio do último check-in.
            </p>
          </div>
          <Button size="default" className="w-auto px-4" onClick={openCreateDialog}>
            <Plus aria-hidden="true" />
            Adicionar meta
          </Button>
        </div>

        {message ? (
          <p aria-live="polite" className="mt-4 font-k2d text-sm text-(--green-1)">
            {message}
          </p>
        ) : null}

        <div className="mt-5 border-t border-border pt-3">
          {profile.goals.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-background px-6 py-10 text-center">
              <p className="font-k2d text-lg font-medium text-foreground">Nenhuma meta cadastrada ainda.</p>
              <p className="mx-auto mt-2 max-w-md font-k2d text-base text-muted">
                Defina um objetivo para acompanhar seu patrimônio em relação ao que você quer conquistar.
              </p>
              <Button size="default" className="mt-5 w-auto px-4" onClick={openCreateDialog}>
                <Plus aria-hidden="true" />
                Adicionar meta
              </Button>
            </div>
          ) : (
            <ul className="space-y-3" aria-label="Metas cadastradas">
              {profile.goals.map((goal, index) => {
                const progress = evolution.goalProgress[index];
                const percentage = progress?.progressPct;
                const detail = [
                  `Prioridade ${priorityLabel(goal.priority).toLowerCase()}`,
                  goal.targetAmountCents === undefined
                    ? "sem valor-alvo"
                    : `alvo ${formatCentsBRL(goal.targetAmountCents)}`,
                  goal.targetDate ? monthLabel(goal.targetDate) : "sem prazo definido",
                ].join(" · ");

                return (
                  <li key={`${goal.title}-${index}`}>
                    <article className="rounded-xl border border-border px-5 py-4 sm:px-6">
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                          <h3 className="font-k2d text-lg font-semibold text-foreground">{goal.title}</h3>
                          <p className="mt-1 font-k2d text-sm text-muted">{detail}</p>
                        </div>
                        <div className="flex shrink-0 items-center justify-between gap-3 sm:justify-end">
                          <p className="font-k2d text-2xl font-semibold text-foreground">
                            {percentage === null || percentage === undefined
                              ? "—"
                              : `${Math.round(percentage)}%`}
                          </p>
                          <div className="flex gap-1">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="w-8"
                              aria-label={`Editar ${goal.title}`}
                              onClick={() => openEditDialog(index, goal)}
                            >
                              <Pencil aria-hidden="true" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="w-8 text-destructive hover:text-destructive"
                              aria-label={`Remover ${goal.title}`}
                              disabled={deletingIndex === index}
                              onClick={() => void deleteGoal(index)}
                            >
                              <Trash2 aria-hidden="true" />
                            </Button>
                          </div>
                        </div>
                      </div>
                      {percentage === null || percentage === undefined ? (
                        <p className="mt-3 font-k2d text-sm text-muted">
                          Defina um valor-alvo para visualizar o progresso desta meta.
                        </p>
                      ) : (
                        <div className="mt-4">
                          <div
                            aria-label={`${goal.title}: ${Math.round(percentage)}% concluída`}
                            aria-valuemax={100}
                            aria-valuemin={0}
                            aria-valuenow={percentage}
                            className="h-2 overflow-hidden rounded-full bg-muted/15"
                            role="progressbar"
                          >
                            <div
                              className="h-full rounded-full bg-primary transition-[width]"
                              style={{ width: `${percentage}%` }}
                            />
                          </div>
                          <p className="mt-2 font-k2d text-sm text-muted">
                            {progress?.achieved
                              ? "Meta alcançada com o patrimônio registrado."
                              : `Faltam ${formatCentsBRL(progress?.remainingCents ?? 0)} para alcançar o objetivo.`}
                          </p>
                        </div>
                      )}
                    </article>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </Card>

      <Card className="mt-5 p-6">
        <h2 className="font-k2d text-2xl font-semibold text-foreground">Como o progresso é lido</h2>
        <p className="mt-3 max-w-4xl font-k2d text-base leading-relaxed text-muted">
          O percentual compara o patrimônio consolidado do último check-in com o valor-alvo da meta. Metas sem valor ou prazo continuam registradas e podem ser completadas quando fizer sentido para você.
        </p>
      </Card>

      <Dialog.Root
        open={isDialogOpen}
        onOpenChange={(open) => (open ? setIsDialogOpen(true) : closeDialog())}
      >
        <Dialog.Portal>
          <Dialog.Backdrop className="fixed inset-0 z-50 bg-(--green-3)/30 backdrop-blur-[1px]" />
          <Dialog.Viewport className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto p-4 sm:p-9">
            <Dialog.Popup className="relative my-auto w-full max-w-2xl rounded-2xl border border-border bg-card px-6 py-8 shadow-[4px_4px_16px_rgba(0,0,0,0.08)] outline-none sm:px-9">
              <div className="flex items-start justify-between gap-6">
                <div>
                  <p className="font-intel text-xs tracking-[0.1em] text-(--green-1) uppercase">Planejamento</p>
                  <Dialog.Title className="mt-2 font-k2d text-2xl font-semibold tracking-tight text-foreground">
                    {editingIndex === null ? "Adicionar meta" : "Editar meta"}
                  </Dialog.Title>
                  <Dialog.Description className="mt-2 font-k2d text-sm text-muted sm:text-base">
                    O acompanhamento usa o patrimônio consolidado no seu último check-in.
                  </Dialog.Description>
                </div>
                <Dialog.Close
                  type="button"
                  aria-label="Fechar formulário"
                  disabled={isSaving}
                  className="grid size-8 shrink-0 place-items-center rounded-sm text-foreground transition hover:bg-muted/15 focus-visible:ring-2 focus-visible:ring-(--green-1)/30 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <X className="size-5" aria-hidden="true" />
                </Dialog.Close>
              </div>

              <form className="mt-7 grid gap-5" onSubmit={saveGoal}>
                <label className="grid gap-2">
                  <FieldLabel htmlFor="goal-title">Título</FieldLabel>
                  <input
                    id="goal-title"
                    value={draft.title}
                    onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
                    disabled={isSaving}
                    maxLength={160}
                    placeholder="Ex.: Reserva de emergência"
                    className="h-11 rounded-md border border-border bg-transparent px-4 font-k2d text-base text-foreground outline-none transition placeholder:text-muted focus:border-(--green-1) focus:ring-2 focus:ring-(--green-1)/15 disabled:cursor-not-allowed disabled:opacity-50"
                    required
                  />
                </label>

                <div className="grid gap-5 sm:grid-cols-2">
                  <label className="grid gap-2">
                    <FieldLabel htmlFor="goal-target-amount">Valor-alvo</FieldLabel>
                    <input
                      id="goal-target-amount"
                      inputMode="decimal"
                      value={draft.targetAmount}
                      onChange={(event) => setDraft((current) => ({ ...current, targetAmount: event.target.value }))}
                      disabled={isSaving}
                      placeholder="Opcional"
                      className="h-11 rounded-md border border-border bg-transparent px-4 font-k2d text-base text-foreground outline-none transition placeholder:text-muted focus:border-(--green-1) focus:ring-2 focus:ring-(--green-1)/15 disabled:cursor-not-allowed disabled:opacity-50"
                    />
                  </label>
                  <label className="grid gap-2">
                    <FieldLabel htmlFor="goal-target-date">Data-alvo</FieldLabel>
                    <input
                      id="goal-target-date"
                      type="month"
                      value={draft.targetDate}
                      onChange={(event) => setDraft((current) => ({ ...current, targetDate: event.target.value }))}
                      disabled={isSaving}
                      className="h-11 rounded-md border border-border bg-transparent px-4 font-k2d text-base text-foreground outline-none transition focus:border-(--green-1) focus:ring-2 focus:ring-(--green-1)/15 disabled:cursor-not-allowed disabled:opacity-50"
                    />
                  </label>
                  <label className="grid gap-2 sm:col-span-2">
                    <FieldLabel htmlFor="goal-priority">Prioridade</FieldLabel>
                    <select
                      id="goal-priority"
                      value={draft.priority}
                      onChange={(event) => setDraft((current) => ({ ...current, priority: event.target.value as GoalDraft["priority"] }))}
                      disabled={isSaving}
                      className="h-11 rounded-md border border-border bg-transparent px-4 font-k2d text-base text-foreground outline-none transition focus:border-(--green-1) focus:ring-2 focus:ring-(--green-1)/15 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <option value="alta">Alta</option>
                      <option value="media">Média</option>
                      <option value="baixa">Baixa</option>
                    </select>
                  </label>
                </div>

                {formError ? (
                  <p aria-live="polite" className="font-k2d text-sm text-destructive">{formError}</p>
                ) : null}

                <div className="mt-1 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                  <Button type="button" variant="outline" size="lg" className="w-auto px-5" disabled={isSaving} onClick={closeDialog}>
                    Cancelar
                  </Button>
                  <Button type="submit" size="lg" className="w-auto px-5" disabled={isSaving}>
                    {isSaving ? "Salvando..." : editingIndex === null ? "Adicionar meta" : "Salvar alterações"}
                  </Button>
                </div>
              </form>
            </Dialog.Popup>
          </Dialog.Viewport>
        </Dialog.Portal>
      </Dialog.Root>
    </GoalsShell>
  );
}
