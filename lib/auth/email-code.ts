import { getPrisma, isDatabaseConfigured } from "@/lib/db/prisma";
import { EmailLoginCodeSchema } from "@/lib/types/account";

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

/** Consumes a valid code and returns the persistent user for Auth.js. */
export async function verifyEmailLoginCode(email: unknown, code: unknown) {
  const parsed = EmailLoginCodeSchema.safeParse({ email, code });
  if (!parsed.success || !isDatabaseConfigured()) {
    return null;
  }

  const { email: normalizedEmail, code: normalizedCode } = parsed.data;
  const deleted = await getPrisma().verificationToken.deleteMany({
    where: {
      identifier: identifierFor(normalizedEmail),
      token: await hashCode(normalizedCode),
      expires: { gt: new Date() },
    },
  });

  if (deleted.count !== 1) {
    return null;
  }

  return getPrisma().user.upsert({
    where: { email: normalizedEmail },
    update: { emailVerified: new Date() },
    create: { email: normalizedEmail, emailVerified: new Date() },
  });
}
