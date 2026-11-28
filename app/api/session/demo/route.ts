import type { NextRequest } from "next/server";
import { DEMO_PROVIDER_ID, signIn } from "@/lib/auth";
import {
  chaveDemosPorIp,
  demoDisponivel,
  MAX_DEMOS_POR_IP,
} from "@/lib/auth/demo";
import {
  databaseNotConfigured,
  jsonError,
  jsonOk,
} from "@/lib/api/responses";
import { isDatabaseConfigured } from "@/lib/db/prisma";
import { ipDaRequisicao, limiteEsgotado } from "@/lib/security/rate-limit";

/**
 * POST /api/session/demo — entra numa conta de demonstração própria: cada
 * chamada cria um usuário temporário com uma cópia da carteira fictícia do
 * seed, para um visitante não alterar a demo dos outros. Sem corpo. Define o
 * cookie de sessão na resposta; os dados da conta vêm de GET /api/session.
 */
export async function POST(request: NextRequest) {
  if (!isDatabaseConfigured()) {
    return databaseNotConfigured("entrar na demonstração");
  }

  try {
    if (!(await demoDisponivel())) {
      return jsonError(
        503,
        "Conta de demonstração indisponível. Rode `npm run db:seed` para criar a carteira fictícia.",
      );
    }

    if (
      await limiteEsgotado(
        chaveDemosPorIp(ipDaRequisicao(request.headers)),
        MAX_DEMOS_POR_IP,
      )
    ) {
      return jsonError(
        429,
        "Muitas contas de demonstração criadas a partir desta rede. Tente novamente mais tarde.",
      );
    }

    // The demo provider creates the private copy (and counts the IP limit).
    const redirectUrl = await signIn(DEMO_PROVIDER_ID, {
      redirect: false,
      redirectTo: "/",
    });
    if (typeof redirectUrl === "string" && redirectUrl.includes("error=")) {
      return jsonError(500, "Falha ao entrar na conta de demonstração.");
    }

    return jsonOk({ authenticated: true, demo: true });
  } catch {
    return jsonError(500, "Falha ao entrar na conta de demonstração.");
  }
}
