import { redirect } from "next/navigation";
import { connection } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { isDatabaseConfigured } from "@/lib/db/prisma";
import { getProfileIdForUser } from "@/lib/profile/repository";

export const instant = false;

/**
 * Redireciona usuários recém-autenticados (ex.: OAuth Google) para a visão
 * geral caso já tenham perfil ou para o onboarding no primeiro acesso.
 */
export default async function PostLoginPage() {
  await connection();
  const user = await getSessionUser();
  if (!user) {
    redirect("/login");
  }

  if (!isDatabaseConfigured()) {
    redirect("/overview");
  }

  const profileId = await getProfileIdForUser(user.id);
  redirect(profileId ? "/overview" : "/onboarding");
}
