import type { NextRequest } from "next/server";

import { EMAIL_CODE_PROVIDER_ID, signIn } from "@/lib/auth";
import { jsonError, jsonOk, parseJsonBody } from "@/lib/api/responses";
import { EmailLoginCodeSchema } from "@/lib/types/account";
import { chaveFalhasCodigo, MAX_FALHAS_CODIGO } from "@/lib/auth/email-code";
import { isDatabaseConfigured } from "@/lib/db/prisma";
import { limiteEsgotado } from "@/lib/security/rate-limit";

/** POST /api/session/email/verify — valida o código e cria a sessão Auth.js. */
export async function POST(request: NextRequest) {
  const parsed = await parseJsonBody(
    request,
    EmailLoginCodeSchema,
    "Dados inválidos para verificar o código.",
  );
  if (!parsed.ok) return parsed.response;

  try {
    if (
      isDatabaseConfigured() &&
      (await limiteEsgotado(
        chaveFalhasCodigo(parsed.data.email),
        MAX_FALHAS_CODIGO,
      ))
    ) {
      return jsonError(
        429,
        "Muitas tentativas com código errado. Aguarde 10 minutos e solicite um novo código.",
      );
    }


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
