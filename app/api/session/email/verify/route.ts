import type { NextRequest } from "next/server";

import { EMAIL_CODE_PROVIDER_ID, signIn } from "@/lib/auth";
import { jsonError, jsonOk, parseJsonBody } from "@/lib/api/responses";
import { EmailLoginCodeSchema } from "@/lib/types/account";

/** POST /api/session/email/verify — valida o código e cria a sessão Auth.js. */
export async function POST(request: NextRequest) {
  const parsed = await parseJsonBody(
    request,
    EmailLoginCodeSchema,
    "Dados inválidos para verificar o código.",
  );
  if (!parsed.ok) return parsed.response;

  try {
    const redirectUrl = await signIn(EMAIL_CODE_PROVIDER_ID, {
      ...parsed.data,
      redirect: false,
      redirectTo: "/",
    });

    if (typeof redirectUrl === "string" && redirectUrl.includes("error=")) {
      return jsonError(400, "Código inválido ou expirado. Solicite um novo código.");
    }

    return jsonOk({ ok: true });
  } catch {
    return jsonError(400, "Código inválido ou expirado. Solicite um novo código.");
  }
}
