import { redirect } from "next/navigation";
import { connection } from "next/server";

import { TargetAllocation } from "@/components/pages/targetAllocation";
import { getSessionUser } from "@/lib/auth/session";

// A alocação é específica da sessão autenticada e não deve ser pré-renderizada.
export const instant = false;

export default async function TargetAllocationPage() {
  await connection();

  const user = await getSessionUser();
  if (!user) {
    redirect("/login");
  }

  return <TargetAllocation />;
}
