import { PrismaAdapter } from "@auth/prisma-adapter";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { ensureDemoUser } from "@/lib/auth/demo";
import { verifyEmailLoginCode } from "@/lib/auth/email-code";
import { getPrisma, isDatabaseConfigured } from "@/lib/db/prisma";

export const DEMO_PROVIDER_ID = "demo";
export const EMAIL_CODE_PROVIDER_ID = "email-code";

/**
 * Auth.js v5.
 *
 * - `email-code`: login sem senha por código enviado por e-mail.
 * - `demo`: entra na conta ligada à carteira fictícia do seed, sem e-mail.
 *
 * A sessão é JWT (o provedor Credentials do `demo` não funciona com sessão em
 * banco). O `User` continua no Postgres via adapter, e `token.sub` é o `User.id`.
 *
 * A config é uma função para que `getPrisma()` só rode na requisição, e não
 * no build. Sem `DATABASE_URL`, o adapter e o provedor de e-mail ficam de fora
 * (o Auth.js recusa e-mail sem adapter); `auth()` continua lendo o JWT.
 *
 * Variáveis: AUTH_SECRET, AUTH_RESEND_KEY, AUTH_EMAIL_FROM.
 */
export const { handlers, auth, signIn, signOut } = NextAuth(() => ({
  trustHost: true,
  ...(isDatabaseConfigured() ? { adapter: PrismaAdapter(getPrisma()) } : {}),
  session: { strategy: "jwt" },
  providers: [
    Credentials({
      id: EMAIL_CODE_PROVIDER_ID,
      name: "Código por e-mail",
      credentials: {
        email: { label: "E-mail", type: "email" },
        code: { label: "Código", type: "text" },
      },
      async authorize(credentials) {
        return verifyEmailLoginCode(credentials.email, credentials.code);
      },
    }),
    Credentials({
      id: DEMO_PROVIDER_ID,
      name: "Demonstração",
      credentials: {},
      async authorize() {
        return ensureDemoUser();
      },
    }),
  ],
  callbacks: {
    session({ session, token }) {
      if (token.sub && session.user) {
        session.user.id = token.sub;
      }
      return session;
    },
  },
}));
