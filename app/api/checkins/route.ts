import type { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  AiGenerationError,
  generateInvestmentAnalysis,
} from "@/lib/ai/advisor";
import { AiConfigurationError } from "@/lib/ai/provider";
import {
  databaseNotConfigured,
  jsonError,
  jsonOk,
  profileNotFound,
  readJsonBody,
  unauthorized,
} from "@/lib/api/responses";
import { getSessionUser } from "@/lib/auth/session";
import { isDatabaseConfigured } from "@/lib/db/prisma";
import { computePortfolioEvolution } from "@/lib/history/evolution";
import {
  RepositoryHydrationError,
  listCheckIns,
  saveCheckIn,
  type SaveCheckInPositionInput,
} from "@/lib/history/repository";
import { getMacroIndicators } from "@/lib/integrations/bcb";
import { fetchEconomicNews } from "@/lib/integrations/firecrawl";
import { montarEntradaMotor } from "@/lib/motor/conversao";
import { gerarDiagnostico } from "@/motor";
import {
  getProfileForUser,
  getProfileIdForUser,
} from "@/lib/profile/repository";
import {
  CreateCheckInRequestSchema,
  type AiAnalysisOutput,
  type AssetClass,
  type CheckInDetail,
  type NewsFetchResult,
  type PortfolioPositionInput,
} from "@/lib/types/domain";

const MAX_CHECKIN_LIST_LIMIT = 100;

const PostCheckInRequestSchema = CreateCheckInRequestSchema.omit({
  profileId: true,
}).extend({
  skipAi: z.boolean().optional(),
  skipNews: z.boolean().optional(),
  syncPortfolioAssets: z.boolean().optional(),
});

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function parseLimitParam(
  rawLimit: string | null,
): { ok: true; value: number | undefined } | { ok: false } {
  if (rawLimit === null || rawLimit.trim() === "") {
    return { ok: true, value: undefined };
  }
  const trimmed = rawLimit.trim();
  if (!/^\d+$/.test(trimmed)) {
    return { ok: false };
  }
  const parsed = Number.parseInt(trimmed, 10);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    return { ok: false };
  }
  return { ok: true, value: Math.min(parsed, MAX_CHECKIN_LIST_LIMIT) };
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  // Always read searchParams before any early return so Next.js 16.4
  // (`cacheComponents: true`) treats this Route Handler as dynamic.
  const rawLimit = request.nextUrl.searchParams.get("limit");

  const user = await getSessionUser();
  if (!user) {
    return unauthorized();
  }

  if (!isDatabaseConfigured()) {
    return databaseNotConfigured("consultar check-ins");
  }

  const parsedLimit = parseLimitParam(rawLimit);
  if (!parsedLimit.ok) {
    return jsonError(400, "Parâmetro 'limit' deve ser um número inteiro positivo.");
  }

  try {
    const profileId = await getProfileIdForUser(user.id);
    if (!profileId) {
      return profileNotFound();
    }

    const checkIns = await listCheckIns(profileId, {
      limit: parsedLimit.value,
    });

    return jsonOk({
      profileId,
      checkIns,
    });
  } catch (error) {
    if (error instanceof RepositoryHydrationError) {
      return jsonError(
        500,
        "Histórico de check-ins com dados inconsistentes no banco.",
      );
    }

    return jsonError(500, "Falha ao listar check-ins no banco de dados.");
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const user = await getSessionUser();
  if (!user) {
    return unauthorized();
  }

  const read = await readJsonBody(request);
  if (!read.ok) return read.response;

  const parsed = PostCheckInRequestSchema.safeParse(read.body);
  if (!parsed.success) {
    return jsonError(400, "Dados inválidos para criação do check-in.", {
      details: z.flattenError(parsed.error),
    });
  }

  if (!isDatabaseConfigured()) {
    return jsonError(
      503,
      "Banco de dados não configurado. Defina DATABASE_URL para salvar check-ins.",
    );
  }

  const data = parsed.data;
  const shouldSkipNews = data.skipNews === true || data.includeNews === false;
  const shouldSkipAi = data.skipAi === true || data.includeAiAnalysis === false;

  try {
    const profile = await getProfileForUser(user.id);
    if (!profile) {
      return profileNotFound();
    }

    const positions: PortfolioPositionInput[] =
      data.positions && data.positions.length > 0
        ? data.positions
        : profile.assets.map((asset) => ({
            id: asset.id,
            name: asset.name,
            assetClass: asset.assetClass,
            amountCents: asset.amountCents,
            indexer: asset.indexer,
            indexerRate: asset.indexerRate,
            liquidity: asset.liquidity,
          }));

    if (positions.length === 0) {
      return jsonError(
        400,
        "Nenhuma posição de carteira foi informada ou encontrada para este perfil.",
      );
    }

    const [previousCheckIns, macroIndicators] = await Promise.all([
      listCheckIns(profile.id, { order: "asc" }),
      getMacroIndicators(),
    ]);

    const profileContext = {
      id: profile.id,
      goals: profile.goals,
      targetAllocation: profile.targetAllocation,
    };

    const motorResult = gerarDiagnostico(
      montarEntradaMotor({
        riskProfile: profile.riskProfile,
        horizonMonths: profile.horizonMonths,
        positions,
        targetAllocation: profile.targetAllocation,
        contributionCents: data.contributionCents,
        macro: macroIndicators,
        preferences: profile.preferences,
      }),
    );

    const totalCurrentCents = motorResult.totalCentavos;
    const checkInPositions: SaveCheckInPositionInput[] = positions.map(
      (position) => ({
        assetClass: position.assetClass,
        assetLabel: position.name,
        amountCents: position.amountCents,
        allocationPct:
          totalCurrentCents > 0
            ? round2((position.amountCents / totalCurrentCents) * 100)
            : 0,
        targetPct: profile.targetAllocation[position.assetClass] ?? 0,
      }),
    );

    const assetClassSet = new Set<AssetClass>();
    for (const position of positions) {
      assetClassSet.add(position.assetClass);
    }
    for (const resultadoClasse of motorResult.classes) {
      assetClassSet.add(resultadoClasse.classe);
    }
    const assetClasses = Array.from(assetClassSet);

    const news: NewsFetchResult = shouldSkipNews
      ? {
          items: [],
          newsAvailable: false,
          fetchedAt: new Date().toISOString(),
          queriesUsed: [],
        }
      : await fetchEconomicNews({ assetClasses });

    const provisionalCurrentCheckIn: CheckInDetail = {
      id: "provisional-current",
      profileId: profile.id,
      referenceMonth: data.referenceMonth,
      userNotes: data.userNotes,
      contributionCents: data.contributionCents,
      totalValueCents: totalCurrentCents,
      adherenceScore: motorResult.aderencia,
      macroSnapshot: macroIndicators,
      motorResult,
      aiAnalysis: null,
      newsSources: news,
      positions: checkInPositions.map((position, idx) => ({
        id: `provisional-pos-${idx + 1}`,
        ...position,
      })),
      createdAt: new Date().toISOString(),
    };

    const evolutionForAi = computePortfolioEvolution(
      [...previousCheckIns, provisionalCurrentCheckIn],
      profileContext,
    );

    let aiAnalysis: AiAnalysisOutput | null = null;
    let aiProvider: string | null = null;
    let aiModelId: string | null = null;

    if (!shouldSkipAi) {
      try {
        const aiResult = await generateInvestmentAnalysis({
          profile: {
            name: profile.name,
            riskProfile: profile.riskProfile,
            horizonMonths: profile.horizonMonths,
            monthlyIncomeCents: profile.monthlyIncomeCents,
            goals: profile.goals,
            targetAllocation: profile.targetAllocation,
          },
          positions,
          referenceMonth: data.referenceMonth,
          userNotes: data.userNotes,
          contributionCents: data.contributionCents,
          macroIndicators,
          motorResult,
          evolutionSummary: evolutionForAi,
          news,
        });
        aiAnalysis = aiResult.analysis;
        aiProvider = aiResult.provider;
        aiModelId = aiResult.modelId;
      } catch (error) {
        if (error instanceof AiConfigurationError) {
          return jsonError(503, error.message, { code: error.code });
        }

        if (error instanceof AiGenerationError) {
          return jsonError(502, error.message, { code: error.code });
        }

        throw error;
      }
    }

    const checkIn = await saveCheckIn({
      profileId: profile.id,
      referenceMonth: data.referenceMonth,
      userNotes: data.userNotes,
      contributionCents: data.contributionCents,
      totalValueCents: totalCurrentCents,
      adherenceScore: motorResult.aderencia,
      macroSnapshot: macroIndicators,
      motorResult,
      aiAnalysis,
      newsSources: news,
      positions: checkInPositions,
      syncPortfolioAssets: data.syncPortfolioAssets ?? true,
      portfolioAssets: positions,
    });

    const evolution = computePortfolioEvolution(
      [...previousCheckIns, checkIn],
      profileContext,
    );

    return jsonOk(
      {
        checkIn,
        evolution,
        meta: {
          aiProvider,
          aiModelId,
          macroSource: macroIndicators.source,
          macroIsStale: macroIndicators.isStale,
          newsAvailable: news.newsAvailable,
        },
      },
      201,
    );
  } catch (error) {
    if (error instanceof RepositoryHydrationError) {
      return jsonError(500, "Dados inconsistentes no histórico do perfil.");
    }

    return jsonError(500, "Erro interno ao processar e salvar o check-in mensal.");
  }
}
