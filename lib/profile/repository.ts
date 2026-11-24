import { Prisma } from "@prisma/client";
import { getPrisma } from "@/lib/db/prisma";
import {
  getProfileWithAssets,
  type InvestorProfileWithAssets,
} from "@/lib/history/repository";
import type {
  CreateInvestorProfileRequestSchema,
  UpdateInvestorProfileRequest,
} from "@/lib/types/account";
import type { z } from "zod";

type CreateInvestorProfileInput = z.output<typeof CreateInvestorProfileRequestSchema>;

export class ProfileAlreadyExistsError extends Error {
  constructor() {
    super("Este usuário já possui um perfil de investidor.");
    this.name = "ProfileAlreadyExistsError";
  }
}

function toPrismaJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function toPrismaNullableJson(
  value: unknown,
): Prisma.InputJsonValue | typeof Prisma.DbNull {
  if (value === null || value === undefined) return Prisma.DbNull;
  return toPrismaJson(value);
}

/** ID do perfil ligado ao usuário, ou `null` se ele ainda não criou um. */
export async function getProfileIdForUser(userId: string): Promise<string | null> {
  const prisma = getPrisma();
  const row = await prisma.investorProfile.findUnique({
    where: { userId },
    select: { id: true },
  });
  return row?.id ?? null;
}

/** Perfil (com investimentos) do usuário logado, ou `null`. */
export async function getProfileForUser(
  userId: string,
): Promise<InvestorProfileWithAssets | null> {
  const profileId = await getProfileIdForUser(userId);
  if (!profileId) return null;
  return getProfileWithAssets(profileId);
}

/**
 * Cria o perfil do usuário. Se `input.email` não vier, usa o e-mail da conta.
 * Lança `ProfileAlreadyExistsError` se o usuário já tiver perfil.
 */
export async function createProfileForUser(
  userId: string,
  input: CreateInvestorProfileInput,
  accountEmail: string | null,
): Promise<InvestorProfileWithAssets> {
  const prisma = getPrisma();

  let createdId: string;
  try {
    const created = await prisma.investorProfile.create({
      data: {
        userId,
        name: input.name,
        email: input.email ?? accountEmail,
        riskProfile: input.riskProfile,
        horizonMonths: input.horizonMonths,
        monthlyIncomeCents: input.monthlyIncomeCents ?? null,
        goals: toPrismaJson(input.goals),
        targetAllocation: toPrismaJson(input.targetAllocation),
        preferences: toPrismaNullableJson(input.preferences),
      },
      select: { id: true },
    });
    createdId = created.id;
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new ProfileAlreadyExistsError();
    }
    throw error;
  }

  const profile = await getProfileWithAssets(createdId);
  if (!profile) {
    throw new Error("Perfil recém-criado não foi encontrado.");
  }
  return profile;
}

/**
 * Atualiza só os campos enviados. Devolve `null` se o usuário não tem perfil.
 */
export async function updateProfileForUser(
  userId: string,
  patch: UpdateInvestorProfileRequest,
): Promise<InvestorProfileWithAssets | null> {
  const prisma = getPrisma();

  const data: Prisma.InvestorProfileUpdateManyMutationInput = {};
  if (patch.name !== undefined) data.name = patch.name;
  if (patch.email !== undefined) data.email = patch.email;
  if (patch.riskProfile !== undefined) data.riskProfile = patch.riskProfile;
  if (patch.horizonMonths !== undefined) data.horizonMonths = patch.horizonMonths;
  if (patch.monthlyIncomeCents !== undefined) {
    data.monthlyIncomeCents = patch.monthlyIncomeCents;
  }
  if (patch.goals !== undefined) data.goals = toPrismaJson(patch.goals);
  if (patch.targetAllocation !== undefined) {
    data.targetAllocation = toPrismaJson(patch.targetAllocation);
  }
  if (patch.preferences !== undefined) {
    data.preferences = toPrismaNullableJson(patch.preferences);
  }

  const result = await prisma.investorProfile.updateMany({
    where: { userId },
    data,
  });
  if (result.count === 0) return null;

  return getProfileForUser(userId);
}
