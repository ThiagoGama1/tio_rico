import { redirect } from "next/navigation";
import { connection } from "next/server";

import { Overview } from "@/components/pages/overview";
import { getSessionUser } from "@/lib/auth/session";

// A visão geral depende da sessão e dos dados pessoais do investidor.
// Com Cache Components, esta rota precisa aguardar a requisição autenticada.
export const instant = false;

export default async function OverviewPage() {
  // Auth.js usa aleatoriedade criptográfica ao validar a sessão; adia isso para a
  // requisição em vez de rodar no prerender (#63).
  await connection();
  const user = await getSessionUser();
  if (!user) {
    redirect("/login");
  }

  return <Overview />;
}
