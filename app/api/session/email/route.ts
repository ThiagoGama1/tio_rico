import type { NextRequest } from "next/server";
import { signIn } from "@/lib/auth";
import {
  databaseNotConfigured,
  jsonError,
  jsonOk,
  parseJsonBody,
} from "@/lib/api/responses";
import { isDatabaseConfigured } from "@/lib/db/prisma";
import { EmailLoginRequestSchema } from "@/lib/types/account";

const LINK_SENT_MESSAGE =
  "Se o e-mail for válido, enviamos um link de acesso. Ele expira em 24 horas.";

/**
 * POST /api/session/email — envia o link de login sem senha via Resend.
 * Corpo: `{ email, callbackUrl? }`. O link leva a `callbackUrl` (padrão "/").
 */
export async function POST(request: NextRequest) {
  const parsed = await parseJsonBody(
    request,
    EmailLoginRequestSchema,
    "Dados inválidos para login por e-mail.",
  );
  if (!parsed.ok) return parsed.response;

  if (!isDatabaseConfigured()) {
    return databaseNotConfigured("fazer login por e-mail");
  }

  if (!process.env.AUTH_RESEND_KEY?.trim()) {
    return jsonError(
      503,
      "Envio de e-mail não configurado. Defina AUTH_RESEND_KEY para habilitar o login por link.",
    );
  }

  const { email, callbackUrl } = parsed.data;

  try {
    const redirectUrl = await signIn("resend", {
      email,
      redirectTo: callbackUrl ?? "/",
      redirect: false,
    });

    if (typeof redirectUrl === "string" && redirectUrl.includes("error=")) {
      return jsonError(502, "Não foi possível enviar o link de acesso.");
    }

    return jsonOk({ ok: true, message: LINK_SENT_MESSAGE });
  } catch {
    return jsonError(502, "Não foi possível enviar o link de acesso.");
  }
}
