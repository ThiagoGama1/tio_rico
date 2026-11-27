import { redirect } from "next/navigation";
import { connection } from "next/server";

import { Goals } from "@/components/pages/goals";
import { getSessionUser } from "@/lib/auth/session";

// Metas é uma visão individual do investidor e não pode ser pré-renderizada.
export const instant = false;

export default async function GoalsPage() {
  await connection();

  const user = await getSessionUser();
  if (!user) {
    redirect("/login");
  }

  return <Goals />;
}
