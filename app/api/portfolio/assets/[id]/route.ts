import type { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import {
  databaseNotConfigured,
  jsonError,
  jsonOk,
  parseJsonBody,
  unauthorized,
} from "@/lib/api/responses";
import { isDatabaseConfigured } from "@/lib/db/prisma";
import {
  deleteAssetForUser,
  getAssetForUser,
  updateAssetForUser,
} from "@/lib/portfolio/repository";
import { UpdatePortfolioAssetRequestSchema } from "@/lib/types/account";

type RouteParams = { params: Promise<{ id: string }> };

// Investimento de outro usuário responde 404 (e não 403) para não revelar
// que o ID existe.
function assetNotFound() {
  return jsonError(404, "Investimento não encontrado.");
}

function invalidId() {
  return jsonError(400, "Identificador de investimento inválido.");
}

/** GET /api/portfolio/assets/:id */
export async function GET(_request: NextRequest, context: RouteParams) {
  const { id } = await context.params;
  const assetId = id.trim();

  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!assetId) return invalidId();
  if (!isDatabaseConfigured()) {
    return databaseNotConfigured("consultar a carteira");
  }

  try {
    const asset = await getAssetForUser(user.id, assetId);
    if (!asset) return assetNotFound();
    return jsonOk({ asset });
  } catch {
    return jsonError(500, "Falha ao consultar o investimento no banco de dados.");
  }
}

/** PATCH /api/portfolio/assets/:id — edita só os campos enviados. */
export async function PATCH(request: NextRequest, context: RouteParams) {
  const { id } = await context.params;
  const assetId = id.trim();

  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!assetId) return invalidId();

  const parsed = await parseJsonBody(
    request,
    UpdatePortfolioAssetRequestSchema,
    "Dados inválidos para atualização do investimento.",
  );
  if (!parsed.ok) return parsed.response;

  if (!isDatabaseConfigured()) {
    return databaseNotConfigured("atualizar investimentos");
  }

  try {
    const asset = await updateAssetForUser(user.id, assetId, parsed.data);
    if (!asset) return assetNotFound();
    return jsonOk({ asset });
  } catch {
    return jsonError(500, "Falha ao atualizar o investimento no banco de dados.");
  }
}

/** DELETE /api/portfolio/assets/:id */
export async function DELETE(_request: NextRequest, context: RouteParams) {
  const { id } = await context.params;
  const assetId = id.trim();

  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!assetId) return invalidId();
  if (!isDatabaseConfigured()) {
    return databaseNotConfigured("remover investimentos");
  }

  try {
    const deleted = await deleteAssetForUser(user.id, assetId);
    if (!deleted) return assetNotFound();
    return jsonOk({ ok: true, id: assetId });
  } catch {
    return jsonError(500, "Falha ao remover o investimento no banco de dados.");
  }
}
