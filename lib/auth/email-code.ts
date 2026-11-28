import { getPrisma, isDatabaseConfigured } from "@/lib/db/prisma";
import { EmailLoginCodeSchema } from "@/lib/types/account";
import {
  consumirLimite,
  limiteEsgotado,
  zerarLimite,
} from "@/lib/security/rate-limit";

const CODE_LENGTH = 6;
const CODE_TTL_MS = 10 * 60 * 1000;
const CODE_IDENTIFIER_PREFIX = "email-code:";

export const EMAIL_LOGIN_CODE_LENGTH = CODE_LENGTH;

function identifierFor(email: string) {
  return `${CODE_IDENTIFIER_PREFIX}${email}`;
}

async function hashCode(code: string) {
  const secret = process.env.AUTH_SECRET ?? "";
  const data = new TextEncoder().encode(`${code}${secret}`);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

function createCode() {
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return (values[0] % 10 ** CODE_LENGTH).toString().padStart(CODE_LENGTH, "0");
}

/**
 * Generates a short-lived single-use code and sends it through Resend. Existing
 * and first-time visitors use the same path so the e-mail is never exposed in
 * the client response as an account-enumeration signal.
 */
export async function sendEmailLoginCode(email: string) {
  if (!isDatabaseConfigured()) {
    throw new Error("DATABASE_NOT_CONFIGURED");
  }

  const resendKey = process.env.AUTH_RESEND_KEY?.trim();
  if (!resendKey) {
    throw new Error("RESEND_NOT_CONFIGURED");
  }

  const prisma = getPrisma();
  const code = createCode();
  const identifier = identifierFor(email);
  const expires = new Date(Date.now() + CODE_TTL_MS);

  // The lookup is intentional: account creation remains deferred until the
  // code is verified, while returning the same public response for both cases.
  await prisma.user.findUnique({ where: { email }, select: { id: true } });
  await prisma.verificationToken.deleteMany({ where: { identifier } });
  await prisma.verificationToken.create({
    data: { identifier, token: await hashCode(code), expires },
  });

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from:
          process.env.AUTH_EMAIL_FROM ?? "Tio Rico <onboarding@resend.dev>",
        to: email,
        subject: "Seu código de acesso ao Tio Rico",
        html: `<p>Use o código abaixo para acessar o Tio Rico:</p><p style="font-size:24px;font-weight:700;letter-spacing:0.2em">${code}</p><p>Ele expira em 10 minutos.</p>`,
        text: `Seu código de acesso ao Tio Rico é ${code}. Ele expira em 10 minutos.`,
      }),
    });

    if (!response.ok) {
      throw new Error("RESEND_REQUEST_FAILED");
    }
  } catch (error) {
    await prisma.verificationToken.deleteMany({
      where: { identifier, token: await hashCode(code) },
    });
    throw error;
  }
}

/** Wrong codes allowed per e-mail before the pending code is discarded. */
export const MAX_FALHAS_CODIGO = 5;
/** Verification attempts allowed per IP in the same window. */
export const MAX_TENTATIVAS_POR_IP = 30;
export const JANELA_TENTATIVAS_MS = CODE_TTL_MS;

export function chaveFalhasCodigo(email: string) {
  return `login-falha:${email}`;
}

export function chaveTentativasIp(ip: string) {
  return `login-ip:${ip}`;
}

/**
 * Consumes a valid code and returns the persistent user for Auth.js.
 *
 * Brute-force protection (applies to `/api/session/email/verify` and to the
 * native Auth.js callback, since both end up here):
 * - after MAX_FALHAS_CODIGO wrong codes for an e-mail, the pending code is
 *   deleted and that e-mail is locked until the window ends. Requesting a new
 *   code does not reset the counter;
 * - each IP gets MAX_TENTATIVAS_POR_IP attempts per window.
 */
export async function verifyEmailLoginCode(
  email: unknown,
  code: unknown,
  ip = "desconhecido",
) {
  const parsed = EmailLoginCodeSchema.safeParse({ email, code });
  if (!parsed.success || !isDatabaseConfigured()) {
    return null;
  }

  const { email: normalizedEmail, code: normalizedCode } = parsed.data;
  const chaveFalhas = chaveFalhasCodigo(normalizedEmail);

  if (await limiteEsgotado(chaveFalhas, MAX_FALHAS_CODIGO)) {
    return null;
  }

  const porIp = await consumirLimite(
    chaveTentativasIp(ip),
    MAX_TENTATIVAS_POR_IP,
    JANELA_TENTATIVAS_MS,
  );
  if (!porIp.permitido) {
    return null;
  }

  const identifier = identifierFor(normalizedEmail);
  const deleted = await getPrisma().verificationToken.deleteMany({
    where: {
      identifier,
      token: await hashCode(normalizedCode),
      expires: { gt: new Date() },
    },
  });

  if (deleted.count !== 1) {
    const falhas = await consumirLimite(
      chaveFalhas,
      MAX_FALHAS_CODIGO,
      JANELA_TENTATIVAS_MS,
    );
    if (falhas.restante === 0) {
      // Too many wrong guesses: throw the pending code away.
      await getPrisma().verificationToken.deleteMany({ where: { identifier } });
    }
    return null;
  }

  await zerarLimite(chaveFalhas);

  return getPrisma().user.upsert({
    where: { email: normalizedEmail },
    update: { emailVerified: new Date() },
    create: { email: normalizedEmail, emailVerified: new Date() },
  });
}
