import { redirect } from "next/navigation";

import { Wallet } from "@/components/pages/wallet";
import { getSessionUser } from "@/lib/auth/session";

// A carteira é individual para cada sessão autenticada e não pode ser pré-renderizada.
export const instant = false;

export default async function WalletPage() {
  const user = await getSessionUser();

  if (!user) {
    redirect("/login");
  }

  return <Wallet />;
}
