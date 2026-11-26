import type { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  AiGenerationError,
  generateInvestmentAnalysis,
} from "@/lib/ai/advisor";
import { AiConfigurationError } from "@/lib/ai/provider";
import { jsonError, jsonOk, parseJsonBody } from "@/lib/api/responses";
import { fetchEconomicNews } from "@/lib/integrations/firecrawl";
import { montarEntradaMotor } from "@/lib/motor/conversao";
import { gerarDiagnostico, type ResultadoMotor } from "@/motor";
import {
  InvestorProfileInputSchema,
  MacroIndicatorsSchema,
  ResultadoMotorSchema,
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
  motorResult: ResultadoMotorSchema.optional(),
  evolutionSummary: PortfolioEvolutionSummarySchema.optional().nullable(),
  skipNews: z.boolean().default(false),
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  const parsed = await parseJsonBody(
    request,
    AnalyzeCheckInRequestSchema,
    "Dados inválidos para análise do check-in.",
  );
  if (!parsed.ok) return parsed.response;

  const data = parsed.data;

  let motorResult: ResultadoMotor;
  try {
    motorResult =
      data.motorResult ??
      gerarDiagnostico(
        montarEntradaMotor({
          riskProfile: data.profile.riskProfile,
          horizonMonths: data.profile.horizonMonths,
          positions: data.positions,
          targetAllocation: data.profile.targetAllocation,
          contributionCents: data.contributionCents,
          macro: data.macroIndicators,
          preferences: data.profile.preferences,
        }),
      );
  } catch {
    return NextResponse.json(
      { error: "Falha no motor de cálculo ao processar a carteira." },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }

  const assetClassSet = new Set<AssetClass>();
  for (const position of data.positions) {
    assetClassSet.add(position.assetClass);
  }
  for (const resultadoClasse of motorResult.classes) {
    assetClassSet.add(resultadoClasse.classe);
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

    return jsonOk({
      analysis,
      motorResult,
      news,
      meta: {
        provider,
        modelId,
      },
    });
  } catch (error) {
    if (error instanceof AiConfigurationError) {
      return jsonError(503, error.message, { code: error.code });
    }

    if (error instanceof AiGenerationError) {
      return jsonError(502, error.message, { code: error.code });
    }

    return jsonError(
      500,
      "Erro interno inesperado ao gerar a análise do check-in.",
    );
  }
}
