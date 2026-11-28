"use server";

import { GOOGLE_PROVIDER_ID, signIn } from "@/lib/auth";

/** Inicia o fluxo OAuth 2.0 do Google e redireciona para decisão pós-login. */
export async function signInWithGoogle() {
  await signIn(GOOGLE_PROVIDER_ID, { redirectTo: "/auth/pos-login" });
}
