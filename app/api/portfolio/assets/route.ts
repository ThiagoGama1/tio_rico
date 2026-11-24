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
import {
  createAssetForUser,
  listAssetsForUser,
} from "@/lib/portfolio/repository";
import { CreatePortfolioAssetRequestSchema } from "@/lib/types/account";

/** GET /api/portfolio/assets — investimentos do usuário logado. */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  if (!isDatabaseConfigured()) {
    return databaseNotConfigured("consultar a carteira");
  }

  try {
    const assets = await listAssetsForUser(user.id);
    if (!assets) return profileNotFound();

    const totalCents = assets.reduce((sum, asset) => sum + asset.amountCents, 0);
    return jsonOk({ assets, totalCents });
  } catch {
    return jsonError(500, "Falha ao listar a carteira no banco de dados.");
  }
}

/** POST /api/portfolio/assets — adiciona um investimento. */
export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const parsed = await parseJsonBody(
    request,
    CreatePortfolioAssetRequestSchema,
    "Dados inválidos para criação do investimento.",
  );
  if (!parsed.ok) return parsed.response;

  if (!isDatabaseConfigured()) {
    return databaseNotConfigured("salvar investimentos");
  }

  try {
    const asset = await createAssetForUser(user.id, parsed.data);
    if (!asset) return profileNotFound();
    return jsonOk({ asset }, 201);
  } catch {
    return jsonError(500, "Falha ao salvar o investimento no banco de dados.");
  }
}
