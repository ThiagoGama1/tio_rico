import { redirect } from "next/navigation";

import { OnboardingFirstStep } from "@/components/pages/onboardingFirstStep";
import { getSessionUser } from "@/lib/auth/session";

// Esta rota depende do cookie de sessão e, por isso, deve renderizar na requisição.
export const instant = false;

export default async function OnboardingPage() {
  const user = await getSessionUser();

  if (!user) {
    redirect("/login");
  }

  return <OnboardingFirstStep email={user.email ?? ""} />;
}
