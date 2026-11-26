import { DEMO_PROVIDER_ID, signIn } from "@/lib/auth";
import { ensureDemoUser } from "@/lib/auth/demo";
import {
  databaseNotConfigured,
  jsonError,
  jsonOk,
} from "@/lib/api/responses";
import { isDatabaseConfigured } from "@/lib/db/prisma";
import { DEMO_PROFILE_ID } from "@/lib/history/repository";

/**
 * POST /api/session/demo — entra na conta de demonstração (carteira fictícia
 * do seed). Sem corpo. Define o cookie de sessão na resposta.
 */
export async function POST() {
  if (!isDatabaseConfigured()) {
    return databaseNotConfigured("entrar na demonstração");
  }

  try {
    const demoUser = await ensureDemoUser();
    if (!demoUser) {
      return jsonError(
        503,
        "Conta de demonstração indisponível. Rode `npm run db:seed` para criar a carteira fictícia.",
      );
    }

    const redirectUrl = await signIn(DEMO_PROVIDER_ID, {
      redirect: false,
      redirectTo: "/",
    });
    if (typeof redirectUrl === "string" && redirectUrl.includes("error=")) {
      return jsonError(500, "Falha ao entrar na conta de demonstração.");
    }

    return jsonOk({
      authenticated: true,
      user: { id: demoUser.id, email: demoUser.email, name: demoUser.name },
      profileId: DEMO_PROFILE_ID,
    });
  } catch {
    return jsonError(500, "Falha ao entrar na conta de demonstração.");
  }
}
