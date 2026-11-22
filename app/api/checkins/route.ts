import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
  AiGenerationError,
  generateInvestmentAnalysis,
} from "@/lib/ai/advisor";
import { AiConfigurationError } from "@/lib/ai/provider";
import { isDatabaseConfigured } from "@/lib/db/prisma";
import { computePortfolioEvolution } from "@/lib/history/evolution";
import {
  RepositoryHydrationError,
  getProfileWithAssets,
  listCheckIns,
  saveCheckIn,
  type SaveCheckInPositionInput,
} from "@/lib/history/repository";
import { getMacroIndicators } from "@/lib/integrations/bcb";
import { fetchEconomicNews } from "@/lib/integrations/firecrawl";
import { calculatePortfolioWithMotor } from "@/lib/motor/adapter";
import {
  CreateCheckInRequestSchema,
  type AiAnalysisOutput,
  type AssetClass,
  type CheckInDetail,
  type NewsFetchResult,
  type PortfolioPositionInput,
} from "@/lib/types/domain";

const NO_STORE_HEADERS = { "Cache-Control": "no-store" } as const;
const MAX_CHECKIN_LIST_LIMIT = 100;

const PostCheckInRequestSchema = CreateCheckInRequestSchema.extend({
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
  const rawProfileId = request.nextUrl.searchParams.get("profileId");
  const rawLimit = request.nextUrl.searchParams.get("limit");
  const profileId = rawProfileId?.trim() || undefined;

  if (!isDatabaseConfigured()) {
    return NextResponse.json(
      {
        error:
          "Banco de dados não configurado. Defina DATABASE_URL para consultar check-ins.",
      },
      { status: 503, headers: NO_STORE_HEADERS },
    );
  }

  const parsedLimit = parseLimitParam(rawLimit);
  if (!parsedLimit.ok) {
    return NextResponse.json(
      { error: "Parâmetro 'limit' deve ser um número inteiro positivo." },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  try {
    const profile = await getProfileWithAssets(profileId);
    if (!profile) {
      return NextResponse.json(
        { error: "Perfil de investidor não encontrado." },
        { status: 404, headers: NO_STORE_HEADERS },
      );
    }

    const checkIns = await listCheckIns(profile.id, {
      limit: parsedLimit.value,
    });

    return NextResponse.json(
      {
        profileId: profile.id,
        checkIns,
      },
      { status: 200, headers: NO_STORE_HEADERS },
    );
  } catch (error) {
    if (error instanceof RepositoryHydrationError) {
      return NextResponse.json(
        { error: "Histórico de check-ins com dados inconsistentes no banco." },
        { status: 500, headers: NO_STORE_HEADERS },
      );
    }

    return NextResponse.json(
      { error: "Falha ao listar check-ins no banco de dados." },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Corpo da requisição deve ser um JSON válido." },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  const parsed = PostCheckInRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Dados inválidos para criação do check-in.",
        details: z.flattenError(parsed.error),
      },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  if (!isDatabaseConfigured()) {
    return NextResponse.json(
      {
        error:
          "Banco de dados não configurado. Defina DATABASE_URL para salvar check-ins ou utilize POST /api/checkins/analyze para análise stateless sem persistência.",
      },
      { status: 503, headers: NO_STORE_HEADERS },
    );
  }

  const data = parsed.data;
  const shouldSkipNews = data.skipNews === true || data.includeNews === false;
  const shouldSkipAi = data.skipAi === true || data.includeAiAnalysis === false;

  try {
    const profile = await getProfileWithAssets(data.profileId);
    if (!profile) {
      return NextResponse.json(
        { error: "Perfil de investidor não encontrado." },
        { status: 404, headers: NO_STORE_HEADERS },
      );
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
      return NextResponse.json(
        {
          error:
            "Nenhuma posição de carteira foi informada ou encontrada para este perfil.",
        },
        { status: 400, headers: NO_STORE_HEADERS },
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

    const motorResult = calculatePortfolioWithMotor({
      riskProfile: profile.riskProfile,
      horizonMonths: profile.horizonMonths,
      positions,
      targetAllocation: profile.targetAllocation,
      contributionCents: data.contributionCents,
      macro: macroIndicators,
    });

    const totalCurrentCents = motorResult.totalCurrentCents;
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
    for (const allocation of motorResult.allocations) {
      assetClassSet.add(allocation.assetClass);
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
      adherenceScore: motorResult.adherenceScore,
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
          return NextResponse.json(
            { error: error.message, code: error.code },
            { status: 503, headers: NO_STORE_HEADERS },
          );
        }

        if (error instanceof AiGenerationError) {
          return NextResponse.json(
            { error: error.message, code: error.code },
            { status: 502, headers: NO_STORE_HEADERS },
          );
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
      adherenceScore: motorResult.adherenceScore,
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

    return NextResponse.json(
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
      { status: 201, headers: NO_STORE_HEADERS },
    );
  } catch (error) {
    if (error instanceof RepositoryHydrationError) {
      return NextResponse.json(
        { error: "Dados inconsistentes no histórico do perfil." },
        { status: 500, headers: NO_STORE_HEADERS },
      );
    }

    return NextResponse.json(
      { error: "Erro interno ao processar e salvar o check-in mensal." },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }
}
