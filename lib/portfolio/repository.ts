import { Prisma } from "@prisma/client";
import { getPrisma } from "@/lib/db/prisma";
import type { PortfolioAssetRecord } from "@/lib/history/repository";
import { getProfileIdForUser } from "@/lib/profile/repository";
import {
  AssetClassSchema,
  MAX_POSICOES,
  type AssetClass,
} from "@/lib/types/domain";
import type {
  CreatePortfolioAssetRequest,
  UpdatePortfolioAssetRequest,
} from "@/lib/types/account";

type PrismaPortfolioAsset = Prisma.PortfolioAssetGetPayload<Record<string, never>>;

/** The portfolio already has MAX_POSICOES assets. */
export class PortfolioLimitError extends Error {
  constructor() {
    super(`A carteira já tem o máximo de ${MAX_POSICOES} investimentos.`);
    this.name = "PortfolioLimitError";
  }
}

const ASSET_ORDER_BY: Prisma.PortfolioAssetOrderByWithRelationInput[] = [
  { amountCents: "desc" },
  { name: "asc" },
];

function parseAssetClass(raw: string): AssetClass {
  const parsed = AssetClassSchema.safeParse(raw);
  return parsed.success ? parsed.data : "outros";
}

function finiteOrNull(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function hydrateAsset(row: PrismaPortfolioAsset): PortfolioAssetRecord {
  return {
    id: row.id,
    profileId: row.profileId,
    name: row.name,
    assetClass: parseAssetClass(row.assetClass),
    amountCents: Math.max(0, Math.round(row.amountCents)),
    indexer: row.indexer,
    indexerRate: finiteOrNull(row.indexerRate),
    liquidity: row.liquidity,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Filtro que amarra qualquer consulta de investimento ao dono do perfil.
 * Toda leitura/escrita deste módulo passa por ele.
 */
function ownedBy(userId: string): Prisma.PortfolioAssetWhereInput {
  return { profile: { userId } };
}

/** Lista os investimentos do usuário. `null` = usuário ainda sem perfil. */
export async function listAssetsForUser(
  userId: string,
): Promise<PortfolioAssetRecord[] | null> {
  const profileId = await getProfileIdForUser(userId);
  if (!profileId) return null;

  const prisma = getPrisma();
  const rows = await prisma.portfolioAsset.findMany({
    where: { profileId, ...ownedBy(userId) },
    orderBy: ASSET_ORDER_BY,
  });
  return rows.map(hydrateAsset);
}

export async function getAssetForUser(
  userId: string,
  assetId: string,
): Promise<PortfolioAssetRecord | null> {
  const prisma = getPrisma();
  const row = await prisma.portfolioAsset.findFirst({
    where: { id: assetId, ...ownedBy(userId) },
  });
  return row ? hydrateAsset(row) : null;
}

/** Cria um investimento no perfil do usuário. `null` = usuário sem perfil. */
export async function createAssetForUser(
  userId: string,
  input: CreatePortfolioAssetRequest,
): Promise<PortfolioAssetRecord | null> {
  const profileId = await getProfileIdForUser(userId);
  if (!profileId) return null;

  const prisma = getPrisma();
  const existentes = await prisma.portfolioAsset.count({ where: { profileId } });
  if (existentes >= MAX_POSICOES) {
    throw new PortfolioLimitError();
  }

  const row = await prisma.portfolioAsset.create({
    data: {
      profileId,
      name: input.name,
      assetClass: input.assetClass,
      amountCents: input.amountCents,
      indexer: input.indexer ?? null,
      indexerRate: finiteOrNull(input.indexerRate),
      liquidity: input.liquidity ?? null,
    },
  });
  return hydrateAsset(row);
}

/**
 * Atualiza só os campos enviados. `null` = investimento não existe ou é de
 * outro usuário (a rota responde 404 nos dois casos).
 */
export async function updateAssetForUser(
  userId: string,
  assetId: string,
  patch: UpdatePortfolioAssetRequest,
): Promise<PortfolioAssetRecord | null> {
  const data: Prisma.PortfolioAssetUpdateManyMutationInput = {};
  if (patch.name !== undefined) data.name = patch.name;
  if (patch.assetClass !== undefined) data.assetClass = patch.assetClass;
  if (patch.amountCents !== undefined) data.amountCents = patch.amountCents;
  if (patch.indexer !== undefined) data.indexer = patch.indexer;
  if (patch.indexerRate !== undefined) {
    data.indexerRate = finiteOrNull(patch.indexerRate);
  }
  if (patch.liquidity !== undefined) data.liquidity = patch.liquidity;

  const prisma = getPrisma();
  const result = await prisma.portfolioAsset.updateMany({
    where: { id: assetId, ...ownedBy(userId) },
    data,
  });
  if (result.count === 0) return null;

  return getAssetForUser(userId, assetId);
}

/** Remove o investimento. `false` = não existe ou é de outro usuário. */
export async function deleteAssetForUser(
  userId: string,
  assetId: string,
): Promise<boolean> {
  const prisma = getPrisma();
  const result = await prisma.portfolioAsset.deleteMany({
    where: { id: assetId, ...ownedBy(userId) },
  });
  return result.count > 0;
}
