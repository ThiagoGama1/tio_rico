import type { NextResponse } from "next/server";
import {
  databaseNotConfigured,
  jsonError,
  jsonOk,
  profileNotFound,
  unauthorized,
} from "@/lib/api/responses";
import { getSessionUser } from "@/lib/auth/session";
import { isDatabaseConfigured } from "@/lib/db/prisma";
import { computePortfolioEvolution } from "@/lib/history/evolution";
import {
  RepositoryHydrationError,
  listCheckIns,
} from "@/lib/history/repository";
import { getProfileForUser } from "@/lib/profile/repository";

export async function GET(): Promise<NextResponse> {
  const user = await getSessionUser();
  if (!user) {
    return unauthorized();
  }

  if (!isDatabaseConfigured()) {
    return databaseNotConfigured("consultar a evolução da carteira");
  }

  try {
    const profile = await getProfileForUser(user.id);
    if (!profile) {
      return profileNotFound();
    }

    const checkIns = await listCheckIns(profile.id, { order: "asc" });
    const evolution = computePortfolioEvolution(checkIns, {
      id: profile.id,
      goals: profile.goals,
      targetAllocation: profile.targetAllocation,
    });

    return jsonOk({
      profile,
      evolution,
      checkInsCount: checkIns.length,
    });
  } catch (error) {
    if (error instanceof RepositoryHydrationError) {
      return jsonError(500, "Histórico da carteira com dados inconsistentes.");
    }

    return jsonError(500, "Falha ao calcular a evolução da carteira.");
  }
}
