import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";

import { NewCheckInForm } from "@/components/pages/newCheckInForm";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { NavigationMenu } from "@/components/ui/navigationMenu";
import { getSessionUser } from "@/lib/auth/session";
import { isDatabaseConfigured } from "@/lib/db/prisma";
import { getProfileForUser } from "@/lib/profile/repository";

export const instant = false;

function CheckInShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh bg-[#faf9f7]">
      <NavigationMenu />
      <main className="min-w-0 flex-1 px-6 py-8 lg:px-10 lg:py-12 xl:px-14">
        {children}
      </main>
    </div>
  );
}

function UnavailableCheckIn({ message }: { message: string }) {
  return (
    <CheckInShell>
      <header className="flex flex-col justify-between gap-6 sm:flex-row sm:items-start">
        <div>
          <p className="font-intel text-sm tracking-[0.08em] text-muted">
            TIO RICO / INVESTIMENTOS
          </p>
          <h1 className="mt-3 font-k2d text-4xl font-bold tracking-tight text-foreground">
            Registrar check-in
          </h1>
        </div>
        <Button render={<Link href="/overview" />} nativeButton={false} size="lg">
          Voltar
        </Button>
      </header>
      <Card className="mt-8 p-6">
        <p className="font-k2d text-base text-muted">{message}</p>
      </Card>
    </CheckInShell>
  );
}

export default async function NewCheckInPage() {
  // Auth.js usa aleatoriedade criptográfica ao validar a sessão; adia isso para a
  // requisição em vez de rodar no prerender (#63).
  await connection();
  const user = await getSessionUser();
  if (!user) {
    redirect("/");
  }

  if (!isDatabaseConfigured()) {
    return (
      <UnavailableCheckIn message="Ainda não foi possível carregar os dados necessários para registrar um check-in." />
    );
  }

  const profile = await getProfileForUser(user.id);
  if (!profile) {
    return (
      <UnavailableCheckIn message="Conclua seu perfil de investidor antes de registrar um check-in." />
    );
  }

  return (
    <CheckInShell>
      <header className="flex flex-col justify-between gap-6 sm:flex-row sm:items-start">
        <div>
          <p className="font-intel text-sm tracking-[0.08em] text-muted">
            TIO RICO / INVESTIMENTOS
          </p>
          <h1 className="mt-3 font-k2d text-4xl font-bold tracking-tight text-foreground">
            Registrar check-in
          </h1>
          <p className="mt-2 font-k2d text-lg text-muted">
            Informe o período, o aporte e a fotografia da carteira usada no cálculo.
          </p>
        </div>
        <Button render={<Link href="/overview" />} nativeButton={false} size="lg">
          Voltar
        </Button>
      </header>

      <NewCheckInForm
        initialPositions={profile.assets.map((asset) => ({
          id: asset.id,
          name: asset.name,
          assetClass: asset.assetClass,
          amountCents: asset.amountCents,
          indexer: asset.indexer,
          indexerRate: asset.indexerRate,
          liquidity: asset.liquidity,
        }))}
      />
    </CheckInShell>
  );
}
