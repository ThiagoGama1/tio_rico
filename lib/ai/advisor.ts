import {
  generateText,
  NoObjectGeneratedError,
  NoOutputGeneratedError,
  Output,
  type LanguageModel,
} from "ai";
import {
  buildAdvisorSystemPrompt,
  buildAdvisorUserPrompt,
  MANDATORY_DISCLAIMER,
  type AdvisorContextInput,
} from "@/lib/ai/context-builder";
import { AiConfigurationError, resolveAiModel } from "@/lib/ai/provider";
import {
  AiAnalysisOutputSchema,
  type AiAnalysisOutput,
} from "@/lib/types/domain";

export type AiGenerationErrorCode =
  | "NO_OBJECT_GENERATED"
  | "NO_OUTPUT_GENERATED"
  | "VALIDATION_ERROR"
  | "PROVIDER_ERROR";

export class AiGenerationError extends Error {
  readonly code: AiGenerationErrorCode;
  readonly cause?: unknown;

  constructor(message: string, code: AiGenerationErrorCode, cause?: unknown) {
    super(message);
    this.name = "AiGenerationError";
    this.code = code;
    this.cause = cause;
  }
}

export interface GenerateInvestmentAnalysisOptions {
  model?: LanguageModel;
  provider?: string;
  modelId?: string;
  generateTextImpl?: typeof generateText;
  maxRetries?: number;
  abortSignal?: AbortSignal;
}

export interface GenerateInvestmentAnalysisResult {
  analysis: AiAnalysisOutput;
  provider: string;
  modelId: string;
}

function inferModelMeta(
  model: LanguageModel,
  explicitProvider?: string,
  explicitModelId?: string,
): { provider: string; modelId: string } {
  const modelRecord =
    typeof model === "object" && model !== null
      ? (model as { provider?: unknown; modelId?: unknown })
      : null;

  const provider =
    explicitProvider?.trim() ||
    (typeof modelRecord?.provider === "string" && modelRecord.provider.trim()
      ? modelRecord.provider.trim()
      : "custom");

  const modelId =
    explicitModelId?.trim() ||
    (typeof modelRecord?.modelId === "string" && modelRecord.modelId.trim()
      ? modelRecord.modelId.trim()
      : "custom");

  return { provider, modelId };
}

function applyMandatoryDisclaimerFallback(rawOutput: unknown): unknown {
  if (typeof rawOutput !== "object" || rawOutput === null || Array.isArray(rawOutput)) {
    return rawOutput;
  }

  const record = rawOutput as Record<string, unknown>;
  const existingDisclaimer =
    typeof record.disclaimer === "string" ? record.disclaimer.trim() : "";

  return {
    ...record,
    disclaimer: existingDisclaimer.length > 0 ? existingDisclaimer : MANDATORY_DISCLAIMER,
  };
}

/**
 * Generates a structured educational investment analysis for a monthly check-in
 * using Vercel AI SDK (`generateText` + `Output.object`) with strict Zod
 * post-validation and mandatory disclaimer enforcement.
 */
export async function generateInvestmentAnalysis(
  input: AdvisorContextInput,
  options?: GenerateInvestmentAnalysisOptions,
): Promise<GenerateInvestmentAnalysisResult> {
  let model: LanguageModel;
  let provider: string;
  let modelId: string;

  if (options?.model) {
    model = options.model;
    const inferred = inferModelMeta(
      options.model,
      options.provider,
      options.modelId,
    );
    provider = inferred.provider;
    modelId = inferred.modelId;
  } else {
    const resolved = resolveAiModel({
      provider: options?.provider,
      modelId: options?.modelId,
    });
    model = resolved.model;
    provider = resolved.provider;
    modelId = resolved.modelId;
  }

  const system = buildAdvisorSystemPrompt();
  const prompt = buildAdvisorUserPrompt(input);
  const runGenerateText = options?.generateTextImpl ?? generateText;

  let rawOutput: unknown;
  try {
    const result = await runGenerateText({
      model,
      output: Output.object({
        name: "AnaliseTioRico",
        description:
          "Análise estruturada de carteira e check-in mensal do Tio Rico",
        schema: AiAnalysisOutputSchema,
      }),
      system,
      prompt,
      temperature: 0.2,
      maxRetries: options?.maxRetries ?? 2,
      ...(options?.abortSignal ? { abortSignal: options.abortSignal } : {}),
    });

    rawOutput = result.output;
  } catch (error) {
    if (error instanceof AiConfigurationError || error instanceof AiGenerationError) {
      throw error;
    }

    if (NoObjectGeneratedError.isInstance(error)) {
      throw new AiGenerationError(
        "O modelo de IA não conseguiu gerar uma análise JSON válida no formato esperado.",
        "NO_OBJECT_GENERATED",
        error,
      );
    }

    if (NoOutputGeneratedError.isInstance(error)) {
      throw new AiGenerationError(
        "O modelo de IA não retornou conteúdo estruturado para a análise.",
        "NO_OUTPUT_GENERATED",
        error,
      );
    }

    throw new AiGenerationError(
      "Falha na comunicação com o provedor de IA ao gerar a análise do check-in.",
      "PROVIDER_ERROR",
      error,
    );
  }

  const normalizedCandidate = applyMandatoryDisclaimerFallback(rawOutput);
  const parsed = AiAnalysisOutputSchema.safeParse(normalizedCandidate);

  if (!parsed.success) {
    throw new AiGenerationError(
      "A saída retornada pelo modelo de IA falhou na validação de contrato.",
      "VALIDATION_ERROR",
      parsed.error,
    );
  }

  return {
    analysis: parsed.data,
    provider,
    modelId,
  };
}
