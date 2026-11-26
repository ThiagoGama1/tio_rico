import { redirect } from "next/navigation";

import { OnboardingThirdStep } from "@/components/pages/onboardingThirdStep";
import { getSessionUser } from "@/lib/auth/session";

// Esta rota depende do cookie de sessão e, por isso, deve renderizar na requisição.
export const instant = false;

export default async function OnboardingAllocationPage() {
  const user = await getSessionUser();

  if (!user) {
    redirect("/login");
  }

  return <OnboardingThirdStep />;
}
