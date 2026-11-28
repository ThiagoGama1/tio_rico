import { redirect } from "next/navigation";
import { connection } from "next/server";

import { OnboardingThirdStep } from "@/components/pages/onboardingThirdStep";
import { getSessionUser } from "@/lib/auth/session";

// Esta rota depende do cookie de sessão e, por isso, deve renderizar na requisição.
export const instant = false;

export default async function OnboardingAllocationPage() {
  // Auth.js usa aleatoriedade criptográfica ao validar a sessão; adia isso para a
  // requisição em vez de rodar no prerender (#63).
  await connection();
  const user = await getSessionUser();

  if (!user) {
    redirect("/login");
  }

  return <OnboardingThirdStep />;
}
