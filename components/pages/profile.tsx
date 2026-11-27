"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { NavigationMenu } from "@/components/ui/navigationMenu";
import { formatCentsBRL } from "@/lib/history/evolution";
import {
  RISK_PROFILE_LABELS,
  type InvestorProfile,
  type RiskProfile,
} from "@/lib/types/domain";

type ProfileResponse = { profile: InvestorProfile };
type ApiError = { error?: string };

type ProfileState =
  | { status: "loading" }
  | { status: "missing" }
  | { status: "ready"; profile: InvestorProfile }
  | { status: "unavailable"; message: string };

type ProfileDraft = {
  name: string;
  riskProfile: RiskProfile;
  horizonMonths: string;
  monthlyIncome: string;
};

const EMPTY_DRAFT: ProfileDraft = {
  name: "",
  riskProfile: "moderado",
  horizonMonths: "",
  monthlyIncome: "",
};

function incomeInputValue(cents: number | null) {
  if (cents === null) return "";

  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

function draftFromProfile(profile: InvestorProfile): ProfileDraft {
  return {
    name: profile.name,
    riskProfile: profile.riskProfile,
    horizonMonths: String(profile.horizonMonths),
    monthlyIncome: incomeInputValue(profile.monthlyIncomeCents ?? null),
  };
}

function centsFromCurrency(value: string) {
  const normalized = value.trim().replace(/[^\d,.-]/g, "");
  if (!normalized) return null;

  const decimalValue = normalized.includes(",")
    ? normalized.replace(/\./g, "").replace(",", ".")
    : normalized;
  const amount = Number(decimalValue);

  return Number.isFinite(amount) && amount >= 0
    ? Math.round(amount * 100)
    : Number.NaN;
}

function ProfileShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh bg-[#faf9f7]">
      <NavigationMenu />
      <section className="min-w-0 flex-1 px-6 py-8 lg:px-10 lg:py-12 xl:px-14">
        {children}
      </section>
    </div>
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

function FieldHint({ children }: { children: string }) {
  return <p className="font-k2d text-sm text-muted">{children}</p>;
}

function ProfileHeader({
  hasProfile,
  isSaving = false,
  showAction = true,
}: {
  hasProfile: boolean;
  isSaving?: boolean;
  showAction?: boolean;
}) {
  return (
    <header className="flex flex-col justify-between gap-6 sm:flex-row sm:items-start">
      <div>
        <p className="font-intel text-sm tracking-[0.08em] text-muted">
          TIO RICO / INVESTIMENTOS
        </p>
        <h1 className="mt-3 font-k2d text-4xl font-bold tracking-tight text-foreground">
          {hasProfile ? "Perfil do investidor" : "Configure seu perfil"}
        </h1>
        <p className="mt-2 max-w-3xl font-k2d text-lg text-muted">
          {hasProfile
            ? "Dados que contextualizam o motor de alocação e os seus check-ins."
            : "Complete as informações abaixo para personalizar sua experiência de investimento."}
        </p>
      </div>
      {showAction && hasProfile ? (
        <Button
          form="profile-form"
          type="submit"
          size="lg"
          className="shrink-0"
          disabled={isSaving}
        >
          {isSaving ? "Salvando..." : "Salvar perfil"}
        </Button>
      ) : showAction ? (
        <Button
          render={<Link href="/onboarding" />}
          nativeButton={false}
          size="lg"
          className="shrink-0"
        >
          Criar perfil
        </Button>
      ) : null}
    </header>
  );
}

function AccessCard({ onSignOut, isSigningOut }: { onSignOut: () => void; isSigningOut: boolean }) {
  return (
    <Card className="p-6">
      <h2 className="font-k2d text-2xl font-semibold text-foreground">Acesso</h2>
      <p className="mt-2 font-k2d text-base text-muted">
        Seu acesso é feito por código enviado para o seu e-mail. Você pode encerrar esta sessão a qualquer momento.
      </p>
      <Button
        type="button"
        size="default"
        className="mt-5 w-auto px-4"
        onClick={onSignOut}
        disabled={isSigningOut}
      >
        {isSigningOut ? "Saindo..." : "Sair da conta"}
      </Button>
    </Card>
  );
}

function SetupCard() {
  const steps = ["Perfil", "Metas", "Alocação alvo"];

  return (
    <Card className="mt-8 p-6 sm:p-8">
      <p className="font-intel text-xs tracking-[0.08em] text-(--green-1) uppercase">
        Primeiro acesso
      </p>
      <h2 className="mt-3 font-k2d text-3xl font-semibold tracking-tight text-foreground">
        Vamos montar sua base de investimento
      </h2>
      <p className="mt-3 max-w-4xl font-k2d text-base leading-relaxed text-muted">
        Antes de registrar check-ins, crie seu perfil com risco, horizonte, metas e alocação-alvo. Nenhuma recomendação individual é criada nesta etapa.
      </p>

      <ol className="mt-6 grid gap-4 lg:grid-cols-3">
        {steps.map((step, index) => (
          <li key={step} className="rounded-xl border border-border p-5">
            <p className="font-intel text-xs tracking-[0.08em] text-muted uppercase">
              {index + 1}. {step}
            </p>
            <p className="mt-4 font-k2d text-3xl font-semibold text-foreground">Pendente</p>
          </li>
        ))}
      </ol>

      <Button
        render={<Link href="/onboarding" />}
        nativeButton={false}
        size="lg"
        className="mt-6 w-auto px-5"
      >
        Criar perfil do investidor
      </Button>
    </Card>
  );
}

export function Profile() {
  const router = useRouter();
  const [state, setState] = useState<ProfileState>({ status: "loading" });
  const [draft, setDraft] = useState<ProfileDraft>(EMPTY_DRAFT);
  const [message, setMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);

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
              : "Não foi possível carregar seu perfil agora.",
          );
        }

        if (!controller.signal.aborted) {
          setDraft(draftFromProfile(payload.profile));
          setState({ status: "ready", profile: payload.profile });
        }
      } catch (error) {
        if (controller.signal.aborted) return;
        setState({
          status: "unavailable",
          message:
            error instanceof Error
              ? error.message
              : "Não foi possível carregar seu perfil agora.",
        });
      }
    }

    void loadProfile();
    return () => controller.abort();
  }, [router]);

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (state.status !== "ready") return;

    const name = draft.name.trim();
    const horizonMonths = Number(draft.horizonMonths);
    const monthlyIncomeCents = centsFromCurrency(draft.monthlyIncome);

    if (!name) {
      setMessage("Informe seu nome para salvar o perfil.");
      return;
    }
    if (!Number.isInteger(horizonMonths) || horizonMonths < 1 || horizonMonths > 1200) {
      setMessage("Informe um horizonte entre 1 e 1.200 meses.");
      return;
    }
    if (Number.isNaN(monthlyIncomeCents)) {
      setMessage("Informe uma renda mensal válida ou deixe o campo em branco.");
      return;
    }

    setMessage("");
    setIsSaving(true);
    try {
      const response = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          riskProfile: draft.riskProfile,
          horizonMonths,
          monthlyIncomeCents,
        }),
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
            : "Não foi possível salvar seu perfil.",
        );
      }

      setDraft(draftFromProfile(payload.profile));
      setState({ status: "ready", profile: payload.profile });
      setMessage("Perfil salvo com sucesso.");
      router.refresh();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Não foi possível salvar seu perfil.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function signOut() {
    setIsSigningOut(true);
    setMessage("");
    try {
      const response = await fetch("/api/session", { method: "DELETE" });
      if (!response.ok) throw new Error("Não foi possível encerrar a sessão.");
      router.replace("/login");
      router.refresh();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Não foi possível encerrar a sessão.",
      );
      setIsSigningOut(false);
    }
  }

  if (state.status === "loading") {
    return (
      <ProfileShell>
        <ProfileHeader hasProfile showAction={false} />
        <Card className="mt-8 p-6">
          <p className="font-k2d text-base text-muted">Carregando seu perfil...</p>
        </Card>
      </ProfileShell>
    );
  }

  if (state.status === "missing") {
    return (
      <ProfileShell>
        <ProfileHeader hasProfile={false} />
        <SetupCard />
        {message ? (
          <p aria-live="polite" className="mt-4 font-k2d text-sm text-destructive">
            {message}
          </p>
        ) : null}
        <div className="mt-5">
          <AccessCard onSignOut={() => void signOut()} isSigningOut={isSigningOut} />
        </div>
      </ProfileShell>
    );
  }

  if (state.status === "unavailable") {
    return (
      <ProfileShell>
        <ProfileHeader hasProfile showAction={false} />
        <Card className="mt-8 p-6">
          <p className="font-k2d text-base text-destructive">{state.message}</p>
        </Card>
      </ProfileShell>
    );
  }

  const { profile } = state;
  const goalsCount = profile.goals.length;
  const allocationCount = Object.keys(profile.targetAllocation).length;

  return (
    <ProfileShell>
      <ProfileHeader hasProfile isSaving={isSaving} />

      <form id="profile-form" className="mt-8 grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(20rem,0.9fr)]" onSubmit={saveProfile}>
        <Card className="p-6 sm:p-8">
          <div>
            <h2 className="font-k2d text-2xl font-semibold text-foreground">Perfil do investidor</h2>
            <p className="mt-2 font-k2d text-base text-muted">
              Atualize os dados que dão contexto aos seus check-ins.
            </p>
          </div>

          <div className="mt-6 grid gap-5 border-t border-border pt-5 sm:grid-cols-2">
            <div className="grid gap-2">
              <FieldLabel htmlFor="profile-name">Nome</FieldLabel>
              <input
                id="profile-name"
                className="h-12 rounded-md border border-input bg-transparent px-4 font-k2d text-base text-foreground outline-none transition focus:border-(--green-1) focus:ring-2 focus:ring-(--green-1)/20"
                value={draft.name}
                onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
                autoComplete="name"
                required
                disabled={isSaving}
              />
              <FieldHint>Identificação do perfil</FieldHint>
            </div>

            <div className="grid gap-2">
              <FieldLabel htmlFor="profile-email">E-mail</FieldLabel>
              <output id="profile-email" className="flex h-12 items-center rounded-md border border-input bg-muted/5 px-4 font-k2d text-base text-foreground">
                {profile.email || "E-mail da sua conta"}
              </output>
              <FieldHint>Usado para acesso por código</FieldHint>
            </div>

            <div className="grid gap-2">
              <FieldLabel htmlFor="risk-profile">Perfil de risco</FieldLabel>
              <select
                id="risk-profile"
                className="h-12 rounded-md border border-input bg-transparent px-4 font-k2d text-base text-foreground outline-none transition focus:border-(--green-1) focus:ring-2 focus:ring-(--green-1)/20"
                value={draft.riskProfile}
                onChange={(event) => setDraft((current) => ({ ...current, riskProfile: event.target.value as RiskProfile }))}
                disabled={isSaving}
              >
                {Object.entries(RISK_PROFILE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
              <FieldHint>Usado pelo motor de alocação</FieldHint>
            </div>

            <div className="grid gap-2">
              <FieldLabel htmlFor="horizon-months">Horizonte</FieldLabel>
              <div className="relative">
                <input
                  id="horizon-months"
                  className="h-12 w-full rounded-md border border-input bg-transparent py-2 pr-20 pl-4 font-k2d text-base text-foreground outline-none transition focus:border-(--green-1) focus:ring-2 focus:ring-(--green-1)/20"
                  type="number"
                  min="1"
                  max="1200"
                  value={draft.horizonMonths}
                  onChange={(event) => setDraft((current) => ({ ...current, horizonMonths: event.target.value }))}
                  disabled={isSaving}
                  required
                />
                <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center font-k2d text-sm text-muted">meses</span>
              </div>
              <FieldHint>Planejamento do investimento</FieldHint>
            </div>

            <div className="grid gap-2 sm:col-span-2">
              <FieldLabel htmlFor="monthly-income">Renda mensal</FieldLabel>
              <input
                id="monthly-income"
                className="h-12 w-full max-w-sm rounded-md border border-input bg-transparent px-4 font-k2d text-base text-foreground outline-none transition placeholder:text-muted focus:border-(--green-1) focus:ring-2 focus:ring-(--green-1)/20"
                inputMode="decimal"
                placeholder="Opcional"
                value={draft.monthlyIncome}
                onChange={(event) => setDraft((current) => ({ ...current, monthlyIncome: event.target.value }))}
                disabled={isSaving}
              />
              <FieldHint>
                {profile.monthlyIncomeCents == null
                  ? "Opcional; usada como contexto"
                  : `Valor atual: ${formatCentsBRL(profile.monthlyIncomeCents)}`}
              </FieldHint>
            </div>
          </div>

          {message ? (
            <p aria-live="polite" className={`mt-5 font-k2d text-sm ${message.includes("sucesso") ? "text-(--green-1)" : "text-destructive"}`}>
              {message}
            </p>
          ) : null}

          <Button type="submit" size="lg" className="mt-6 w-full sm:w-auto sm:px-6" disabled={isSaving}>
            {isSaving ? "Salvando..." : "Salvar perfil"}
          </Button>
        </Card>

        <div className="space-y-5">
          <Card className="p-6">
            <h2 className="font-k2d text-2xl font-semibold text-foreground">Configuração da carteira</h2>
            <p className="mt-3 font-k2d text-base leading-relaxed text-muted">
              Metas e alocação-alvo são gerenciadas nas respectivas áreas.
            </p>
            <dl className="mt-5 grid gap-3 border-t border-border pt-5">
              <div className="flex items-center justify-between gap-4">
                <dt className="font-k2d text-base text-muted">Metas cadastradas</dt>
                <dd className="font-k2d text-xl font-semibold text-foreground">{goalsCount}</dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="font-k2d text-base text-muted">Classes na alocação</dt>
                <dd className="font-k2d text-xl font-semibold text-foreground">{allocationCount}</dd>
              </div>
            </dl>
          </Card>
          <AccessCard onSignOut={() => void signOut()} isSigningOut={isSigningOut} />
        </div>
      </form>
    </ProfileShell>
  );
}
