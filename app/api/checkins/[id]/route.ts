import type { NextRequest, NextResponse } from "next/server";
import {
  databaseNotConfigured,
  jsonError,
  jsonOk,
  unauthorized,
} from "@/lib/api/responses";
import { getSessionUser } from "@/lib/auth/session";
import { isDatabaseConfigured } from "@/lib/db/prisma";
import {
  RepositoryHydrationError,
  getCheckInByIdForProfile,
} from "@/lib/history/repository";
import { getProfileIdForUser } from "@/lib/profile/repository";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  // Await params before early returns so Next.js 16.4 (cacheComponents: true)
  // keeps this dynamic route handler request-scoped.
  const { id } = await context.params;
  const trimmedId = id.trim();

  const user = await getSessionUser();
  if (!user) {
    return unauthorized();
  }

  if (!trimmedId) {
    return jsonError(400, "Identificador de check-in inválido.");
  }

  if (!isDatabaseConfigured()) {
    return databaseNotConfigured("consultar check-ins");
  }

  try {
    const profileId = await getProfileIdForUser(user.id);
    if (!profileId) {
      return jsonError(404, "Check-in não encontrado.");
    }

    const checkIn = await getCheckInByIdForProfile(trimmedId, profileId);
    if (!checkIn) {
      return jsonError(404, "Check-in não encontrado.");
    }

    return jsonOk(checkIn);
  } catch (error) {
    if (error instanceof RepositoryHydrationError) {
      return jsonError(500, "Dados do check-in inconsistentes no banco de dados.");
    }

    return jsonError(500, "Falha ao consultar o check-in no banco de dados.");
  }
}
