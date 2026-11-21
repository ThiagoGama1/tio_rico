import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
  AiGenerationError,
  generateInvestmentAnalysis,
} from "@/lib/ai/advisor";
import { AiConfigurationError } from "@/lib/ai/provider";
import { fetchEconomicNews } from "@/lib/integrations/firecrawl";
import { calculatePortfolioWithMotor } from "@/lib/motor/adapter";
import {
  InvestorProfileInputSchema,
  MacroIndicatorsSchema,
  MotorCalculationResultSchema,
  PortfolioEvolutionSummarySchema,
  PortfolioPositionInputSchema,
  ReferenceMonthSchema,
  type AssetClass,
  type NewsFetchResult,
} from "@/lib/types/domain";

const AnalyzeCheckInRequestSchema = z.object({
  profile: InvestorProfileInputSchema,
  positions: z.array(PortfolioPositionInputSchema),
  referenceMonth: ReferenceMonthSchema,
  userNotes: z.string().max(4000).default(""),
  contributionCents: z.number().int().nonnegative(),
  macroIndicators: MacroIndicatorsSchema,
  motorResult: MotorCalculationResultSchema.optional(),
  evolutionSummary: PortfolioEvolutionSummarySchema.optional().nullable(),
  skipNews: z.boolean().default(false),
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Corpo da requisição deve ser um JSON válido." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  const parsed = AnalyzeCheckInRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Dados inválidos para análise do check-in.",
        details: z.flattenError(parsed.error),
      },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  const data = parsed.data;

  const motorResult =
    data.motorResult ??
    calculatePortfolioWithMotor({
      riskProfile: data.profile.riskProfile,
      horizonMonths: data.profile.horizonMonths,
      positions: data.positions,
      targetAllocation: data.profile.targetAllocation,
      contributionCents: data.contributionCents,
      macro: data.macroIndicators,
    });

  const assetClassSet = new Set<AssetClass>();
  for (const position of data.positions) {
    assetClassSet.add(position.assetClass);
  }
  for (const allocation of motorResult.allocations) {
    assetClassSet.add(allocation.assetClass);
  }
  const assetClasses = Array.from(assetClassSet);

  const news: NewsFetchResult = data.skipNews
    ? {
        items: [],
        newsAvailable: false,
        fetchedAt: new Date().toISOString(),
        queriesUsed: [],
      }
    : await fetchEconomicNews({ assetClasses });

  try {
    const { analysis, provider, modelId } = await generateInvestmentAnalysis({
      profile: data.profile,
      positions: data.positions,
      referenceMonth: data.referenceMonth,
      userNotes: data.userNotes,
      contributionCents: data.contributionCents,
      motorResult,
      macroIndicators: data.macroIndicators,
      evolutionSummary: data.evolutionSummary ?? null,
      news,
    });

    return NextResponse.json(
      {
        analysis,
        motorResult,
        news,
        meta: {
          provider,
          modelId,
        },
      },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof AiConfigurationError) {
      return NextResponse.json(
        {
          error: error.message,
          code: error.code,
        },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      );
    }

    if (error instanceof AiGenerationError) {
      return NextResponse.json(
        {
          error: error.message,
          code: error.code,
        },
        { status: 502, headers: { "Cache-Control": "no-store" } },
      );
    }

    return NextResponse.json(
      {
        error: "Erro interno inesperado ao gerar a análise do check-in.",
      },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
