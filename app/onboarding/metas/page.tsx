import { redirect } from "next/navigation";

import { OnboardingSecondStep } from "@/components/pages/onboardingSecondStep";
import { getSessionUser } from "@/lib/auth/session";

// Esta rota depende do cookie de sessão e, por isso, deve renderizar na requisição.
export const instant = false;

export default async function OnboardingGoalsPage() {
  const user = await getSessionUser();

  if (!user) {
    redirect("/login");
  }

  return <OnboardingSecondStep />;
}
