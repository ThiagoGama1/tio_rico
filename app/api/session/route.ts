import { signOut } from "@/lib/auth";
import { getSessionUser } from "@/lib/auth/session";
import {
  databaseNotConfigured,
  jsonError,
  jsonOk,
} from "@/lib/api/responses";
import { isDatabaseConfigured } from "@/lib/db/prisma";
import { getProfileIdForUser } from "@/lib/profile/repository";

/**
 * GET /api/session — quem está logado.
 * Sempre 200: `{ authenticated: false, user: null, profileId: null }` sem login.
 */
export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return jsonOk({ authenticated: false, user: null, profileId: null });
  }

  if (!isDatabaseConfigured()) {
    return databaseNotConfigured("consultar a sessão");
  }

  try {
    const profileId = await getProfileIdForUser(user.id);
    return jsonOk({ authenticated: true, user, profileId });
  } catch {
    return jsonError(500, "Falha ao consultar a sessão no banco de dados.");
  }
}

/** DELETE /api/session — logout (apaga o cookie de sessão). */
export async function DELETE() {
  try {
    await signOut({ redirect: false });
    return jsonOk({ ok: true });
  } catch {
    return jsonError(500, "Falha ao encerrar a sessão.");
  }
}
