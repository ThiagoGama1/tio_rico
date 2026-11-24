import { PrismaAdapter } from "@auth/prisma-adapter";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Resend from "next-auth/providers/resend";
import { ensureDemoUser } from "@/lib/auth/demo";
import { getPrisma, isDatabaseConfigured } from "@/lib/db/prisma";

export const DEMO_PROVIDER_ID = "demo";

/**
 * Auth.js v5.
 *
 * - `resend`: login sem senha por link no e-mail (tokens em `VerificationToken`).
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
  ...(isDatabaseConfigured() ? { adapter: PrismaAdapter(getPrisma()) } : {}),
  session: { strategy: "jwt" },
  providers: [
    ...(isDatabaseConfigured()
      ? [
          Resend({
            from:
              process.env.AUTH_EMAIL_FROM ?? "Tio Rico <onboarding@resend.dev>",
          }),
        ]
      : []),
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
