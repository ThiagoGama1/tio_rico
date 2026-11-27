import type { NextRequest } from "next/server";
import {
  databaseNotConfigured,
  jsonError,
  jsonOk,
  parseJsonBody,
} from "@/lib/api/responses";
import { sendEmailLoginCode } from "@/lib/auth/email-code";
import { isDatabaseConfigured } from "@/lib/db/prisma";
import { EmailLoginRequestSchema } from "@/lib/types/account";

const CODE_SENT_MESSAGE =
  "Se o e-mail for válido, enviamos um código de acesso. Ele expira em 10 minutos.";

/**
 * POST /api/session/email — envia o código de login sem senha via Resend.
 * Corpo: `{ email }`. A autenticação é concluída em `/api/session/email/verify`.
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
      "Envio de e-mail não configurado. Defina AUTH_RESEND_KEY para habilitar o login por código.",
    );
  }

  const { email } = parsed.data;

  try {
    await sendEmailLoginCode(email);
    return jsonOk({ ok: true, message: CODE_SENT_MESSAGE });
  } catch {
    return jsonError(502, "Não foi possível enviar o código de acesso.");
  }
}
