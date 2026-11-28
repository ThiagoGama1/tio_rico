import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { getPrisma } from "@/lib/db/prisma";
import { DEMO_PROFILE_ID } from "@/lib/history/repository";

/**
 * Demo accounts: one private copy per browser.
 *
 * The seed profile `DEMO_PROFILE_ID` is only a template and never belongs to
 * a user. Each "enter the demo" creates a temporary user with a copy of the
 * template (profile, assets and check-ins), so a visitor can change anything
 * without affecting the next one. Copies older than DEMO_TTL_MS are removed by
 * the daily cleanup (`/api/cron/limpar-demo`).
 */

export const DEMO_EMAIL_DOMAIN = "demo.tiorico.app";
export const DEMO_USER_NAME = "Marina Costa (demonstração)";
/** New demo accounts allowed per IP per window. */
export const MAX_DEMOS_POR_IP = 10;
export const JANELA_DEMOS_MS = 60 * 60 * 1000;
/** How long a demo copy lives before the cleanup removes it. */
export const DEMO_TTL_MS = 24 * 60 * 60 * 1000;

export function chaveDemosPorIp(ip: string) {
  return `demo-ip:${ip}`;
}

export function isDemoEmail(email: string | null | undefined): boolean {
  return Boolean(email?.toLowerCase().endsWith(`@${DEMO_EMAIL_DOMAIN}`));
}

export interface DemoUser {
  id: string;
  email: string;
  name: string;
}

function json(value: Prisma.JsonValue): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function jsonOuNulo(
  value: Prisma.JsonValue | null,
): Prisma.InputJsonValue | typeof Prisma.DbNull {
  return value === null ? Prisma.DbNull : (value as Prisma.InputJsonValue);
}

/** True when the seed template exists (`npm run db:seed` already ran). */
export async function demoDisponivel(): Promise<boolean> {
  const template = await getPrisma().investorProfile.findUnique({
    where: { id: DEMO_PROFILE_ID },
    select: { id: true },
  });
  return template !== null;
}

/**
 * Creates a temporary user with a private copy of the demo template.
 * Returns `null` when the seed has not run yet.
 */
export async function criarContaDemo(): Promise<DemoUser | null> {
  const prisma = getPrisma();

  const template = await prisma.investorProfile.findUnique({
    where: { id: DEMO_PROFILE_ID },
    include: {
      assets: true,
      checkIns: { include: { positions: true } },
    },
  });
  if (!template) return null;

  return prisma.$transaction(async (tx) => {
    // The template is shared by every copy: it must never be writable through
    // a session again (older versions linked it to one shared demo user).
    if (template.userId) {
      await tx.investorProfile.update({
        where: { id: template.id },
        data: { userId: null },
      });
    }

    const user = await tx.user.create({
      data: {
        email: `demo-${randomUUID()}@${DEMO_EMAIL_DOMAIN}`,
        name: DEMO_USER_NAME,
        emailVerified: new Date(),
      },
      select: { id: true, email: true, name: true },
    });

    const profile = await tx.investorProfile.create({
      data: {
        userId: user.id,
        name: template.name,
        email: null,
        riskProfile: template.riskProfile,
        horizonMonths: template.horizonMonths,
        monthlyIncomeCents: template.monthlyIncomeCents,
        goals: json(template.goals),
        targetAllocation: json(template.targetAllocation),
        preferences: jsonOuNulo(template.preferences),
        assets: {
          create: template.assets.map((asset) => ({
            name: asset.name,
            assetClass: asset.assetClass,
            amountCents: asset.amountCents,
            indexer: asset.indexer,
            indexerRate: asset.indexerRate,
            liquidity: asset.liquidity,
          })),
        },
      },
      select: { id: true },
    });

    for (const checkIn of template.checkIns) {
      await tx.checkIn.create({
        data: {
          profileId: profile.id,
          referenceMonth: checkIn.referenceMonth,
          userNotes: checkIn.userNotes,
          contributionCents: checkIn.contributionCents,
          totalValueCents: checkIn.totalValueCents,
          adherenceScore: checkIn.adherenceScore,
          macroSnapshot: json(checkIn.macroSnapshot),
          motorResult: json(checkIn.motorResult),
          aiAnalysis: jsonOuNulo(checkIn.aiAnalysis),
          newsSources: jsonOuNulo(checkIn.newsSources),
          createdAt: checkIn.createdAt,
          positions: {
            create: checkIn.positions.map((position) => ({
              assetClass: position.assetClass,
              assetLabel: position.assetLabel,
              amountCents: position.amountCents,
              allocationPct: position.allocationPct,
              targetPct: position.targetPct,
            })),
          },
        },
      });
    }

    return {
      id: user.id,
      email: user.email ?? "",
      name: user.name ?? DEMO_USER_NAME,
    };
  });
}

/**
 * Removes demo copies older than DEMO_TTL_MS (their profiles, assets and
 * check-ins go with them). The template itself is never deleted.
 */
export async function apagarDemosAntigas(
  agora = new Date(),
): Promise<{ usuarios: number; perfis: number }> {
  const prisma = getPrisma();
  const limite = new Date(agora.getTime() - DEMO_TTL_MS);

  const antigos = await prisma.user.findMany({
    where: {
      email: { endsWith: `@${DEMO_EMAIL_DOMAIN}` },
      createdAt: { lt: limite },
    },
    select: { id: true },
    take: 500,
  });
  const ids = antigos.map((user) => user.id);
  if (ids.length === 0) return { usuarios: 0, perfis: 0 };

  return prisma.$transaction(async (tx) => {
    // Profiles use onDelete: SetNull, so they are removed explicitly first.
    const perfis = await tx.investorProfile.deleteMany({
      where: { userId: { in: ids }, id: { not: DEMO_PROFILE_ID } },
    });
    const usuarios = await tx.user.deleteMany({ where: { id: { in: ids } } });
    return { usuarios: usuarios.count, perfis: perfis.count };
  });
}
