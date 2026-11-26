import { Prisma } from "@prisma/client";
import { z } from "zod";
import { getPrisma } from "@/lib/db/prisma";
import {
  AiAnalysisOutputSchema,
  AssetClassSchema,
  InvestorGoalSchema,
  InvestorPreferencesSchema,
  MacroIndicatorsSchema,
  NewsFetchResultSchema,
  ResultadoMotorSchema,
  ReferenceMonthSchema,
  RiskProfileSchema,
  TargetAllocationSchema,
  type AiAnalysisOutput,
  type AssetClass,
  type CheckInDetail,
  type CheckInPositionDetail,
  type InvestorProfile,
  type MacroIndicators,
  type NewsFetchResult,
  type PortfolioPositionInput,
  type ReferenceMonth,
} from "@/lib/types/domain";
import type { ResultadoMotor } from "@/motor/tipos";

export const DEMO_PROFILE_ID = "demo-marina-costa";

const GoalsListSchema = z.array(InvestorGoalSchema);

export class RepositoryHydrationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RepositoryHydrationError";
  }
}

export interface PortfolioAssetRecord {
  id: string;
  profileId: string;
  name: string;
  assetClass: AssetClass;
  amountCents: number;
  indexer: string | null;
  indexerRate: number | null;
  liquidity: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface InvestorProfileWithAssets extends InvestorProfile {
  assets: PortfolioAssetRecord[];
}

export interface ListCheckInsOptions {
  limit?: number;
  order?: "asc" | "desc";
}

export interface SaveCheckInPositionInput {
  assetClass: AssetClass;
  assetLabel: string;
  amountCents: number;
  allocationPct: number;
  targetPct: number;
}

export interface SaveCheckInInput {
  profileId: string;
  referenceMonth: ReferenceMonth;
  userNotes: string;
  contributionCents: number;
  totalValueCents: number;
  adherenceScore: number | null;
  macroSnapshot: MacroIndicators;
  motorResult: ResultadoMotor;
  aiAnalysis?: AiAnalysisOutput | null;
  newsSources?: NewsFetchResult | null;
  positions: SaveCheckInPositionInput[];
  /**
   * When true, atomically synchronizes the investor's `PortfolioAsset` rows
   * inside the same Prisma transaction. Uses `portfolioAssets` when provided,
   * falling back to `positions`.
   */
  syncPortfolioAssets?: boolean;
  portfolioAssets?: PortfolioPositionInput[];
}

type PrismaProfileWithAssets = Prisma.InvestorProfileGetPayload<{
  include: { assets: true };
}>;

type PrismaPortfolioAsset = Prisma.PortfolioAssetGetPayload<Record<string, never>>;

type PrismaCheckInWithPositions = Prisma.CheckInGetPayload<{
  include: { positions: true };
}>;

type PrismaCheckInPosition = Prisma.CheckInPositionGetPayload<Record<string, never>>;

function toPrismaJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function toPrismaNullableJson(
  value: unknown,
): Prisma.InputJsonValue | typeof Prisma.DbNull {
  if (value === null || value === undefined) {
    return Prisma.DbNull;
  }
  return toPrismaJson(value);
}

function parseAssetClass(raw: string): AssetClass {
  const parsed = AssetClassSchema.safeParse(raw);
  return parsed.success ? parsed.data : "outros";
}

function clampPct(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value * 100) / 100));
}

function sanitizeCents(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.round(value));
}

function hydratePortfolioAsset(
  row: PrismaPortfolioAsset,
): PortfolioAssetRecord {
  return {
    id: row.id,
    profileId: row.profileId,
    name: row.name,
    assetClass: parseAssetClass(row.assetClass),
    amountCents: sanitizeCents(row.amountCents),
    indexer: row.indexer,
    indexerRate: row.indexerRate,
    liquidity: row.liquidity,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function hydrateProfileWithAssets(
  row: PrismaProfileWithAssets,
): InvestorProfileWithAssets {
  const riskParsed = RiskProfileSchema.safeParse(row.riskProfile);
  const goalsParsed = GoalsListSchema.safeParse(row.goals);
  const targetParsed = TargetAllocationSchema.safeParse(row.targetAllocation);
  const prefsParsed =
    row.preferences === null
      ? { success: true as const, data: null }
      : InvestorPreferencesSchema.safeParse(row.preferences);

  return {
    id: row.id,
    name: row.name,
    email: row.email,
    riskProfile: riskParsed.success ? riskParsed.data : "moderado",
    horizonMonths: Math.max(1, Math.round(row.horizonMonths)),
    monthlyIncomeCents:
      row.monthlyIncomeCents !== null
        ? sanitizeCents(row.monthlyIncomeCents)
        : null,
    goals: goalsParsed.success ? goalsParsed.data : [],
    targetAllocation: targetParsed.success ? targetParsed.data : {},
    preferences: prefsParsed.success ? prefsParsed.data : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    assets: row.assets.map(hydratePortfolioAsset),
  };
}

function hydrateCheckInPosition(
  row: PrismaCheckInPosition,
): CheckInPositionDetail {
  return {
    id: row.id,
    assetClass: parseAssetClass(row.assetClass),
    assetLabel: row.assetLabel,
    amountCents: sanitizeCents(row.amountCents),
    allocationPct: clampPct(row.allocationPct),
    targetPct: clampPct(row.targetPct),
  };
}

function hydrateCheckIn(row: PrismaCheckInWithPositions): CheckInDetail {
  const referenceMonthParsed = ReferenceMonthSchema.safeParse(
    row.referenceMonth,
  );
  if (!referenceMonthParsed.success) {
    throw new RepositoryHydrationError(
      `Check-in ${row.id} possui referenceMonth inválido: "${row.referenceMonth}".`,
    );
  }

  const macroParsed = MacroIndicatorsSchema.safeParse(row.macroSnapshot);
  if (!macroParsed.success) {
    throw new RepositoryHydrationError(
      `Check-in ${row.id} possui macroSnapshot incompatível com o contrato de domínio.`,
    );
  }

  const motorParsed = ResultadoMotorSchema.safeParse(row.motorResult);
  if (!motorParsed.success) {
    throw new RepositoryHydrationError(
      `Check-in ${row.id} possui motorResult incompatível com o contrato de domínio.`,
    );
  }

  let aiAnalysis: AiAnalysisOutput | null = null;
  if (row.aiAnalysis !== null) {
    const aiParsed = AiAnalysisOutputSchema.safeParse(row.aiAnalysis);
    if (aiParsed.success) {
      aiAnalysis = aiParsed.data;
    }
  }

  let newsSources: NewsFetchResult | null = null;
  if (row.newsSources !== null) {
    const newsParsed = NewsFetchResultSchema.safeParse(row.newsSources);
    if (newsParsed.success) {
      newsSources = newsParsed.data;
    }
  }

  return {
    id: row.id,
    profileId: row.profileId,
    referenceMonth: referenceMonthParsed.data,
    userNotes: row.userNotes,
    contributionCents: sanitizeCents(row.contributionCents),
    totalValueCents: sanitizeCents(row.totalValueCents),
    adherenceScore:
      row.adherenceScore !== null ? clampPct(row.adherenceScore) : null,
    macroSnapshot: macroParsed.data,
    motorResult: motorParsed.data,
    aiAnalysis,
    newsSources,
    positions: row.positions.map(hydrateCheckInPosition),
    createdAt: row.createdAt.toISOString(),
  };
}

async function resolveDefaultProfileId(): Promise<string | null> {
  const prisma = getPrisma();

  const demo = await prisma.investorProfile.findUnique({
    where: { id: DEMO_PROFILE_ID },
    select: { id: true },
  });
  if (demo) return demo.id;

  const first = await prisma.investorProfile.findFirst({
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  return first?.id ?? null;
}

/**
 * Loads an investor profile along with its current `PortfolioAsset` rows.
 *
 * When `profileId` is omitted, looks up `DEMO_PROFILE_ID` first and falls back
 * to the earliest created profile in the database.
 */
export async function getProfileWithAssets(
  profileId?: string,
): Promise<InvestorProfileWithAssets | null> {
  const prisma = getPrisma();
  const trimmedId = profileId?.trim();

  const assetOrderBy: Prisma.PortfolioAssetOrderByWithRelationInput[] = [
    { amountCents: "desc" },
    { name: "asc" },
  ];

  if (trimmedId) {
    const profile = await prisma.investorProfile.findUnique({
      where: { id: trimmedId },
      include: { assets: { orderBy: assetOrderBy } },
    });
    return profile ? hydrateProfileWithAssets(profile) : null;
  }

  const demoProfile = await prisma.investorProfile.findUnique({
    where: { id: DEMO_PROFILE_ID },
    include: { assets: { orderBy: assetOrderBy } },
  });
  if (demoProfile) {
    return hydrateProfileWithAssets(demoProfile);
  }

  const firstProfile = await prisma.investorProfile.findFirst({
    orderBy: { createdAt: "asc" },
    include: { assets: { orderBy: assetOrderBy } },
  });
  return firstProfile ? hydrateProfileWithAssets(firstProfile) : null;
}

/**
 * Lists hydrated check-ins for a profile (defaulting to `DEMO_PROFILE_ID` or
 * the first profile found), ordered by `referenceMonth` and `createdAt`.
 *
 * Defaults to descending order (most recent first) so `limit` returns the
 * latest N check-ins.
 */
export async function listCheckIns(
  profileId?: string,
  options?: ListCheckInsOptions,
): Promise<CheckInDetail[]> {
  const prisma = getPrisma();
  const trimmedId = profileId?.trim();
  const resolvedProfileId = trimmedId || (await resolveDefaultProfileId());

  if (!resolvedProfileId) {
    return [];
  }

  const order = options?.order ?? "desc";
  const limit =
    typeof options?.limit === "number" &&
    Number.isFinite(options.limit) &&
    options.limit > 0
      ? Math.floor(options.limit)
      : undefined;

  const rows = await prisma.checkIn.findMany({
    where: { profileId: resolvedProfileId },
    include: {
      positions: {
        orderBy: [{ amountCents: "desc" }, { assetLabel: "asc" }],
      },
    },
    orderBy: [{ referenceMonth: order }, { createdAt: order }],
    ...(limit !== undefined ? { take: limit } : {}),
  });

  return rows.map(hydrateCheckIn);
}

/**
 * Loads a single check-in by ID with all its hydrated positions.
 */
export async function getCheckInById(
  id: string,
): Promise<CheckInDetail | null> {
  const trimmedId = id.trim();
  if (!trimmedId) {
    return null;
  }

  const prisma = getPrisma();
  const row = await prisma.checkIn.findUnique({
    where: { id: trimmedId },
    include: {
      positions: {
        orderBy: [{ amountCents: "desc" }, { assetLabel: "asc" }],
      },
    },
  });

  return row ? hydrateCheckIn(row) : null;
}

/**
 * Loads a single check-in by ID only when it belongs to `profileId`
 * (prevents IDOR across investor profiles).
 */
export async function getCheckInByIdForProfile(
  id: string,
  profileId: string,
): Promise<CheckInDetail | null> {
  const trimmedId = id.trim();
  const trimmedProfileId = profileId.trim();
  if (!trimmedId || !trimmedProfileId) {
    return null;
  }

  const prisma = getPrisma();
  const row = await prisma.checkIn.findFirst({
    where: { id: trimmedId, profileId: trimmedProfileId },
    include: {
      positions: {
        orderBy: [{ amountCents: "desc" }, { assetLabel: "asc" }],
      },
    },
  });

  return row ? hydrateCheckIn(row) : null;
}

/**
 * Atomically persists a `CheckIn` and its `CheckInPosition[]` rows inside a
 * Prisma transaction, optionally synchronizing `PortfolioAsset` rows for the
 * investor profile.
 */
export async function saveCheckIn(
  params: SaveCheckInInput,
): Promise<CheckInDetail> {
  const prisma = getPrisma();
  const referenceMonth = ReferenceMonthSchema.parse(params.referenceMonth);

  const created = await prisma.$transaction(async (tx) => {
    const checkIn = await tx.checkIn.create({
      data: {
        profileId: params.profileId,
        referenceMonth,
        userNotes: params.userNotes,
        contributionCents: sanitizeCents(params.contributionCents),
        totalValueCents: sanitizeCents(params.totalValueCents),
        adherenceScore:
          params.adherenceScore !== null
            ? clampPct(params.adherenceScore)
            : null,
        macroSnapshot: toPrismaJson(params.macroSnapshot),
        motorResult: toPrismaJson(params.motorResult),
        aiAnalysis: toPrismaNullableJson(params.aiAnalysis ?? null),
        newsSources: toPrismaNullableJson(params.newsSources ?? null),
        positions: {
          create: params.positions.map((position) => ({
            assetClass: position.assetClass,
            assetLabel: position.assetLabel,
            amountCents: sanitizeCents(position.amountCents),
            allocationPct: clampPct(position.allocationPct),
            targetPct: clampPct(position.targetPct),
          })),
        },
      },
      include: {
        positions: {
          orderBy: [{ amountCents: "desc" }, { assetLabel: "asc" }],
        },
      },
    });

    if (params.syncPortfolioAssets) {
      await tx.portfolioAsset.deleteMany({
        where: { profileId: params.profileId },
      });

      const assetRows =
        params.portfolioAssets && params.portfolioAssets.length > 0
          ? params.portfolioAssets.map((asset) => ({
              profileId: params.profileId,
              name: asset.name,
              assetClass: asset.assetClass,
              amountCents: sanitizeCents(asset.amountCents),
              indexer: asset.indexer ?? null,
              indexerRate:
                typeof asset.indexerRate === "number" &&
                Number.isFinite(asset.indexerRate)
                  ? asset.indexerRate
                  : null,
              liquidity: asset.liquidity ?? null,
            }))
          : params.positions.map((position) => ({
              profileId: params.profileId,
              name: position.assetLabel,
              assetClass: position.assetClass,
              amountCents: sanitizeCents(position.amountCents),
              indexer: null,
              indexerRate: null,
              liquidity: null,
            }));

      if (assetRows.length > 0) {
        await tx.portfolioAsset.createMany({ data: assetRows });
      }
    }

    return checkIn;
  });

  return hydrateCheckIn(created);
}
