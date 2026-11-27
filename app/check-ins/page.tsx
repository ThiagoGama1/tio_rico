import Link from "next/link";
import { redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DataLine } from "@/components/ui/dataLine";
import { NavigationMenu } from "@/components/ui/navigationMenu";
import { getSessionUser } from "@/lib/auth/session";
import { isDatabaseConfigured } from "@/lib/db/prisma";
import { formatCentsBRL } from "@/lib/history/evolution";
import {
  listCheckIns,
  type InvestorProfileWithAssets,
} from "@/lib/history/repository";
import { getProfileForUser } from "@/lib/profile/repository";
import type { CheckInDetail } from "@/lib/types/domain";

// A página depende da sessão autenticada e deve ser renderizada por requisição.
export const instant = false;

type CheckInsLoadResult =
  | { data: { profile: InvestorProfileWithAssets; checkIns: CheckInDetail[] } }
  | { message: string };

function monthLabel(referenceMonth: string) {
  const [year, month] = referenceMonth.split("-");
  const date = new Date(Number(year), Number(month) - 1, 1);

  return new Intl.DateTimeFormat("pt-BR", {
    month: "short",
    year: "numeric",
  })
    .format(date)
    .replace(" de ", "/")
    .replace(".", "")
    .toUpperCase();
}

function dateLabel(createdAt: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(createdAt));
}

async function loadCheckIns(userId: string): Promise<CheckInsLoadResult> {
  try {
    const profile = await getProfileForUser(userId);
    if (!profile) {
      return {
        message:
          "Conclua seu perfil de investidor para começar a registrar seus check-ins.",
      };
    }

    const checkIns = await listCheckIns(profile.id, { order: "desc" });
    return { data: { profile, checkIns } };
  } catch {
    return {
      message:
        "Não foi possível carregar seus check-ins agora. Tente novamente em alguns instantes.",
    };
  }
}

function CheckInsShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh bg-[#faf9f7]">
      <NavigationMenu />
      <section className="min-w-0 flex-1 px-6 py-8 lg:px-10 lg:py-12 xl:px-14">
        {children}
      </section>
    </div>
  );
}

function CheckInsHeader() {
  return (
    <header className="flex flex-col justify-between gap-6 sm:flex-row sm:items-start">
      <div>
        <p className="font-intel text-sm tracking-[0.08em] text-muted">
          TIO RICO / INVESTIMENTOS
        </p>
        <h1 className="mt-3 font-k2d text-4xl font-bold tracking-tight text-foreground">
          Check-ins
        </h1>
        <p className="mt-2 max-w-2xl font-k2d text-lg text-muted">
          Registre seus aportes e acompanhe as mudanças da sua carteira a cada mês.
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
  );
}

function CheckInsMessage({ children }: { children: React.ReactNode }) {
  return (
    <Card className="mt-8 p-6">
      <p className="font-k2d text-base text-muted">{children}</p>
    </Card>
  );
}

function CheckInsUnavailable({ message }: { message: string }) {
  return (
    <CheckInsShell>
      <CheckInsHeader />
      <CheckInsMessage>{message}</CheckInsMessage>
    </CheckInsShell>
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

export default async function CheckInsPage() {
  const user = await getSessionUser();
  if (!user) {
    redirect("/");
  }

  if (!isDatabaseConfigured()) {
    return (
      <CheckInsUnavailable message="Ainda não foi possível carregar seus dados de investimento." />
    );
  }

  const result = await loadCheckIns(user.id);
  if ("message" in result) {
    return <CheckInsUnavailable message={result.message} />;
  }

  const { checkIns } = result.data;
  const latestCheckIn = checkIns[0] ?? null;
  const totalContributionsCents = checkIns.reduce(
    (total, checkIn) => total + checkIn.contributionCents,
    0,
  );

  return (
    <CheckInsShell>
      <CheckInsHeader />

      <section
        aria-label="Resumo dos check-ins"
        className="mt-8 grid gap-4 md:grid-cols-3"
      >
        <SummaryCard
          label="CHECK-INS REGISTRADOS"
          value={String(checkIns.length)}
          detail={
            latestCheckIn
              ? `Mais recente: ${monthLabel(latestCheckIn.referenceMonth)}`
              : "Comece pelo seu primeiro registro"
          }
        />
        <SummaryCard
          label="PATRIMÔNIO REGISTRADO"
          value={
            latestCheckIn ? formatCentsBRL(latestCheckIn.totalValueCents) : "—"
          }
          detail={
            latestCheckIn
              ? `Referência: ${monthLabel(latestCheckIn.referenceMonth)}`
              : "Sem patrimônio registrado"
          }
        />
        <SummaryCard
          label="APORTES ACUMULADOS"
          value={formatCentsBRL(totalContributionsCents)}
          detail={
            checkIns.length > 0
              ? "Considerando todos os registros"
              : "Nenhum aporte registrado ainda"
          }
        />
      </section>

      <Card className="mt-5 p-6">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
          <div>
            <h2 className="font-k2d text-2xl font-semibold text-foreground">
              Histórico de check-ins
            </h2>
            <p className="mt-2 font-k2d text-base text-muted">
              Cada registro mantém o retrato da sua carteira naquele mês.
            </p>
          </div>
          <Button
            render={<Link href="/check-ins/new" />}
            nativeButton={false}
            className="w-auto px-5"
          >
            Novo check-in
          </Button>
        </div>

        {checkIns.length === 0 ? (
          <div className="mt-6 rounded-xl border border-dashed border-border bg-background px-6 py-10 text-center">
            <p className="font-k2d text-lg font-medium text-foreground">
              Seu histórico aparecerá aqui.
            </p>
            <p className="mx-auto mt-2 max-w-md font-k2d text-base text-muted">
              Faça seu primeiro check-in para acompanhar aportes, patrimônio e aderência à sua alocação alvo.
            </p>
          </div>
        ) : (
          <ul className="mt-6 space-y-3" aria-label="Lista de check-ins">
            {checkIns.map((checkIn) => (
              <li key={checkIn.id}>
                <Link
                  href={`/check-ins/${checkIn.id}`}
                  className="block rounded-lg outline-none transition-transform hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label={`Ver detalhes do check-in de ${monthLabel(checkIn.referenceMonth)}`}
                >
                  <DataLine
                    variant="compact"
                    className="min-h-[4.5rem]"
                    title={monthLabel(checkIn.referenceMonth)}
                    detail={`Registrado em ${dateLabel(checkIn.createdAt)} · Aporte de ${formatCentsBRL(checkIn.contributionCents)}`}
                    value={formatCentsBRL(checkIn.totalValueCents)}
                  />
                </Link>
              </li>
            ))}
          </ul>
        )}

        <p className="mt-5 font-k2d text-sm text-muted">
          Os registros anteriores não são alterados quando sua carteira atual é atualizada.
        </p>
      </Card>
    </CheckInsShell>
  );
}
