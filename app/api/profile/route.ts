import type { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import {
  databaseNotConfigured,
  jsonError,
  jsonOk,
  parseJsonBody,
  profileNotFound,
  unauthorized,
} from "@/lib/api/responses";
import { isDatabaseConfigured } from "@/lib/db/prisma";
import { RepositoryHydrationError } from "@/lib/history/repository";
import {
  ProfileAlreadyExistsError,
  createProfileForUser,
  getProfileForUser,
  updateProfileForUser,
} from "@/lib/profile/repository";
import {
  CreateInvestorProfileRequestSchema,
  UpdateInvestorProfileRequestSchema,
} from "@/lib/types/account";

/** GET /api/profile — perfil (com investimentos) do usuário logado. */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  if (!isDatabaseConfigured()) {
    return databaseNotConfigured("consultar o perfil");
  }

  try {
    const profile = await getProfileForUser(user.id);
    if (!profile) return profileNotFound();
    return jsonOk({ profile });
  } catch (error) {
    if (error instanceof RepositoryHydrationError) {
      return jsonError(500, "Perfil com dados inconsistentes no banco.");
    }
    return jsonError(500, "Falha ao consultar o perfil no banco de dados.");
  }
}

/** POST /api/profile — cria o perfil do usuário logado (um por usuário). */
export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const parsed = await parseJsonBody(
    request,
    CreateInvestorProfileRequestSchema,
    "Dados inválidos para criação do perfil.",
  );
  if (!parsed.ok) return parsed.response;

  if (!isDatabaseConfigured()) {
    return databaseNotConfigured("criar o perfil");
  }

  try {
    const profile = await createProfileForUser(user.id, parsed.data, user.email);
    return jsonOk({ profile }, 201);
  } catch (error) {
    if (error instanceof ProfileAlreadyExistsError) {
      return jsonError(409, error.message);
    }
    return jsonError(500, "Falha ao criar o perfil no banco de dados.");
  }
}

/** PATCH /api/profile — edita só os campos enviados. */
export async function PATCH(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const parsed = await parseJsonBody(
    request,
    UpdateInvestorProfileRequestSchema,
    "Dados inválidos para atualização do perfil.",
  );
  if (!parsed.ok) return parsed.response;

  if (!isDatabaseConfigured()) {
    return databaseNotConfigured("atualizar o perfil");
  }

  try {
    const profile = await updateProfileForUser(user.id, parsed.data);
    if (!profile) return profileNotFound();
    return jsonOk({ profile });
  } catch {
    return jsonError(500, "Falha ao atualizar o perfil no banco de dados.");
  }
}
