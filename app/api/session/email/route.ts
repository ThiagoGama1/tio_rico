import type { NextRequest } from "next/server";
import {
  databaseNotConfigured,
  jsonError,
  jsonOk,
  parseJsonBody,
} from "@/lib/api/responses";
import { sendEmailLoginCode } from "@/lib/auth/email-code";
import { isDatabaseConfigured } from "@/lib/db/prisma";
import { consumirLimite, ipDaRequisicao } from "@/lib/security/rate-limit";
import { EmailLoginRequestSchema } from "@/lib/types/account";

const MAX_ENVIOS_POR_IP = 10;
const JANELA_ENVIOS_IP_MS = 60 * 60 * 1000;
const INTERVALO_ENVIO_EMAIL_MS = 60 * 1000;

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
    // Per IP first (protects the Resend quota), then per e-mail (stops anyone
    // from invalidating someone else's pending code over and over).
    const porIp = await consumirLimite(
      `envio-ip:${ipDaRequisicao(request.headers)}`,
      MAX_ENVIOS_POR_IP,
      JANELA_ENVIOS_IP_MS,
    );
    if (!porIp.permitido) {
      return jsonError(
        429,
        "Muitos códigos solicitados a partir desta rede. Tente novamente mais tarde.",
      );
    }

    const porEmail = await consumirLimite(
      `envio-email:${email}`,
      1,
      INTERVALO_ENVIO_EMAIL_MS,
    );
    if (!porEmail.permitido) {
      return jsonError(
        429,
        "Aguarde 1 minuto antes de pedir outro código para este e-mail.",
      );
    }

    await sendEmailLoginCode(email);
    return jsonOk({ ok: true, message: CODE_SENT_MESSAGE });
  } catch {
    return jsonError(502, "Não foi possível enviar o código de acesso.");
  }
}
