import { redirect } from "next/navigation";
import { connection } from "next/server";

import { Evolution } from "@/components/pages/evolution";
import { getSessionUser } from "@/lib/auth/session";

// A evolução é individual para cada sessão e depende do histórico do investidor.
export const instant = false;

export default async function EvolutionPage() {
  // Auth.js usa aleatoriedade criptográfica ao validar a sessão; adia isso para a

  // requisição em vez de rodar no prerender (#63).

  await connection();

  const user = await getSessionUser();

  if (!user) {
    redirect("/login");
  }

  return <Evolution />;
}
