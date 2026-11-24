import { getPrisma } from "@/lib/db/prisma";
import { DEMO_PROFILE_ID } from "@/lib/history/repository";

/** E-mail do usuário Auth.js ligado ao perfil fictício do seed. */
export const DEMO_USER_EMAIL = "marina.costa@demo.tiorico.app";
export const DEMO_USER_NAME = "Marina Costa (demonstração)";

export interface DemoUser {
  id: string;
  email: string;
  name: string;
}

/**
 * Garante que exista um `User` de demonstração ligado ao perfil do seed
 * (`DEMO_PROFILE_ID`) e o devolve.
 *
 * Devolve `null` quando o seed ainda não rodou (perfil demo inexistente).
 * Idempotente: pode ser chamado a cada login de demonstração.
 */
export async function ensureDemoUser(): Promise<DemoUser | null> {
  const prisma = getPrisma();

  const profile = await prisma.investorProfile.findUnique({
    where: { id: DEMO_PROFILE_ID },
    select: { id: true, userId: true },
  });
  if (!profile) return null;

  const user = await prisma.user.upsert({
    where: { email: DEMO_USER_EMAIL },
    update: {},
    create: {
      email: DEMO_USER_EMAIL,
      name: DEMO_USER_NAME,
      emailVerified: new Date(),
    },
    select: { id: true, email: true, name: true },
  });

  if (profile.userId !== user.id) {
    await prisma.investorProfile.update({
      where: { id: profile.id },
      data: { userId: user.id },
    });
  }

  return {
    id: user.id,
    email: user.email ?? DEMO_USER_EMAIL,
    name: user.name ?? DEMO_USER_NAME,
  };
}
