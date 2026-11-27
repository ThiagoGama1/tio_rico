import { redirect } from "next/navigation";
import { connection } from "next/server";

import { Wallet } from "@/components/pages/wallet";
import { getSessionUser } from "@/lib/auth/session";

// A carteira é individual para cada sessão autenticada e não pode ser pré-renderizada.
export const instant = false;

export default async function WalletPage() {
  // Auth.js validates the session with cryptographic randomness. Defer that
  // work until a request is connected instead of evaluating it while Next.js
  // builds the prerendered shell.
  await connection();
  const user = await getSessionUser();

  if (!user) {
    redirect("/login");
  }

  return <Wallet />;
}
