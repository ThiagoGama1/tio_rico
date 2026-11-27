import { redirect } from "next/navigation";

import { Evolution } from "@/components/pages/evolution";
import { getSessionUser } from "@/lib/auth/session";

// A evolução é individual para cada sessão e depende do histórico do investidor.
export const instant = false;

export default async function EvolutionPage() {
  const user = await getSessionUser();

  if (!user) {
    redirect("/login");
  }

  return <Evolution />;
}
