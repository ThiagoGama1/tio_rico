import { PrismaAdapter } from "@auth/prisma-adapter";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import {
  aplicarValidadeDemo,
  chaveDemosPorIp,
  criarContaDemo,
  JANELA_DEMOS_MS,
  MAX_DEMOS_POR_IP,
} from "@/lib/auth/demo";
import {
  GOOGLE_PROVIDER_ID,
  isGoogleAuthConfigured,
} from "@/lib/auth/google";
import { verifyEmailLoginCode } from "@/lib/auth/email-code";
import { getPrisma, isDatabaseConfigured } from "@/lib/db/prisma";
import { consumirLimite, ipDaRequisicao } from "@/lib/security/rate-limit";

export const DEMO_PROVIDER_ID = "demo";
export const EMAIL_CODE_PROVIDER_ID = "email-code";
export { GOOGLE_PROVIDER_ID, isGoogleAuthConfigured };
export const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

/**
 * Auth.js v5.
 *
 * - `google`: login OAuth 2.0 com conta Google (quando `AUTH_GOOGLE_ID` e
 *   `AUTH_GOOGLE_SECRET` estiverem definidos).
 * - `email-code`: login sem senha por código enviado por e-mail.
 * - `demo`: cria uma conta temporária com uma cópia da carteira fictícia do
 *   seed (uma por navegador), sem e-mail.
 *
 * A sessão é JWT (o provedor Credentials do `demo` não funciona com sessão em
 * banco). O `User` continua no Postgres via adapter, e `token.sub` é o `User.id`.
 *
 * A config é uma função para que `getPrisma()` só rode na requisição, e não
 * no build. Sem `DATABASE_URL`, o adapter e o provedor de e-mail ficam de fora
 * (o Auth.js recusa e-mail sem adapter); `auth()` continua lendo o JWT.
 *
 * Variáveis: AUTH_SECRET, AUTH_RESEND_KEY, AUTH_EMAIL_FROM, AUTH_GOOGLE_ID,
 * AUTH_GOOGLE_SECRET.
 */
export const { handlers, auth, signIn, signOut } = NextAuth(() => ({
  trustHost: true,
  pages: {
    signIn: "/login",
    error: "/login",
  },
  ...(isDatabaseConfigured() ? { adapter: PrismaAdapter(getPrisma()) } : {}),
  // JWT sessions cannot be revoked on logout (the cookie is only removed from
  // the browser), so a copied token stays valid until it expires. 7 days
  // instead of the default 30 limits how long a stolen token is useful.
  session: { strategy: "jwt", maxAge: SESSION_MAX_AGE_SECONDS },
  providers: [
    ...(isDatabaseConfigured() && isGoogleAuthConfigured()
      ? [
          Google({
            clientId: process.env.AUTH_GOOGLE_ID!.trim(),
            clientSecret: process.env.AUTH_GOOGLE_SECRET!.trim(),
            allowDangerousEmailAccountLinking: true,
          }),
        ]
      : []),
    Credentials({
      id: EMAIL_CODE_PROVIDER_ID,
      name: "Código por e-mail",
      credentials: {
        email: { label: "E-mail", type: "email" },
        code: { label: "Código", type: "text" },
      },
      async authorize(credentials, request) {
        return verifyEmailLoginCode(
          credentials.email,
          credentials.code,
          ipDaRequisicao(request?.headers),
        );
      },
    }),
    Credentials({
      id: DEMO_PROVIDER_ID,
      name: "Demonstração",
      credentials: {},
      // Each demo login gets a private copy of the demo portfolio. The IP limit
      // also covers the native Auth.js callback, not only /api/session/demo.
      async authorize(_credentials, request) {
        const porIp = await consumirLimite(
          chaveDemosPorIp(ipDaRequisicao(request?.headers)),
          MAX_DEMOS_POR_IP,
          JANELA_DEMOS_MS,
        );
        if (!porIp.permitido) return null;
        return criarContaDemo();
      },
    }),
  ],
  callbacks: {
    // Demo sessions end with their copy (24 h), even though sessions roll.
    jwt({ token, account }) {
      return aplicarValidadeDemo(token, account?.provider);
    },
    session({ session, token }) {
      if (token.sub && session.user) {
        session.user.id = token.sub;
      }
      return session;
    },
  },
}));
