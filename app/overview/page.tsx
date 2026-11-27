import { redirect } from "next/navigation";

import { Overview } from "@/components/pages/overview";
import { getSessionUser } from "@/lib/auth/session";

// A visão geral depende da sessão e dos dados pessoais do investidor.
// Com Cache Components, esta rota precisa aguardar a requisição autenticada.
export const instant = false;

export default async function OverviewPage() {
  const user = await getSessionUser();
  if (!user) {
    redirect("/login");
  }

  return <Overview />;
}
