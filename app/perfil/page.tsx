import { redirect } from "next/navigation";
import { connection } from "next/server";

import { Profile } from "@/components/pages/profile";
import { getSessionUser } from "@/lib/auth/session";

// O perfil é individual para a sessão autenticada e deve ser renderizado na requisição.
export const instant = false;

export default async function ProfilePage() {
  await connection();

  const user = await getSessionUser();
  if (!user) {
    redirect("/login");
  }

  return <Profile />;
}
