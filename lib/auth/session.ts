import { auth } from "@/lib/auth";

export interface SessionUser {
  id: string;
  email: string | null;
  name: string | null;
}

/**
 * Lê a sessão do Auth.js e devolve só o necessário para as rotas.
 * Retorna `null` quando não há usuário logado.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) return null;
  return {
    id,
    email: session.user?.email ?? null,
    name: session.user?.name ?? null,
  };
}
