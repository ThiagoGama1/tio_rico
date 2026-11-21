import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import {
  NoObjectGeneratedError,
  NoOutputGeneratedError,
  type LanguageModel,
  type generateText,
} from "ai";
import { POST as analyzeCheckInPost } from "@/app/api/checkins/analyze/route";
import {
  AiGenerationError,
  generateInvestmentAnalysis,
} from "@/lib/ai/advisor";
import {
  MANDATORY_DISCLAIMER,
  type AdvisorContextInput,
} from "@/lib/ai/context-builder";
import {
  AiConfigurationError,
  DEFAULT_AI_MODELS,
  getAiProviderStatus,
  resolveAiModel,
} from "@/lib/ai/provider";
import { calculatePortfolioWithMotor } from "@/lib/motor/adapter";
import type { AiAnalysisOutput, MacroIndicators } from "@/lib/types/domain";

const SAMPLE_MACRO: MacroIndicators = {
  selicMetaAnnual: 14.75,
  selicDate: "2026-11-01",
  cdiAnnual: 14.65,
  cdiDaily: 0.0542,
  cdiDate: "2026-11-01",
  ipcaMonthly: 0.45,
  ipca12m: 5.0,
  ipcaDate: "2026-10-01",
  ipcaHistory: [{ date: "2026-10-01", value: 0.45 }],
  source: "bcb_sgs",
  fetchedAt: "2026-11-20T12:00:00.000Z",
  isStale: false,
};

function createSampleInput(): AdvisorContextInput {
  const positions = [
    {
      name: "Tesouro Selic",
      assetClass: "renda_fixa_pos" as const,
      amountCents: 700_000,
    },
    {
      name: "ETF Ações Brasil",
      assetClass: "acoes" as const,
      amountCents: 300_000,
    },
  ];
  const targetAllocation = { renda_fixa_pos: 50, acoes: 50 };
  const motorResult = calculatePortfolioWithMotor({
    riskProfile: "moderado",
    horizonMonths: 60,
    positions,
    targetAllocation,
    contributionCents: 200_000,
    macro: SAMPLE_MACRO,
  });

  return {
    profile: {
      name: "Marina Costa",
      riskProfile: "moderado",
      horizonMonths: 60,
      monthlyIncomeCents: 1_200_000,
      goals: [{ title: "Aposentadoria", targetAmountCents: 100_000_000 }],
      targetAllocation,
    },
    positions,
    referenceMonth: "2026-11",
    userNotes: "Quero manter disciplina nos aportes.",
    contributionCents: 200_000,
    motorResult,
    macroIndicators: SAMPLE_MACRO,
    evolutionSummary: null,
    news: {
      items: [],
      newsAvailable: false,
      fetchedAt: "2026-11-20T12:00:00.000Z",
      queriesUsed: ["Selic Copom IPCA economia Brasil"],
    },
  };
}

const VALID_ANALYSIS: AiAnalysisOutput = {
  resumoExecutivo:
    "Sua carteira soma R$ 10.000,00 com aderência de 80,00%, subindo após o aporte de R$ 2.000,00.",
  diagnosticoAlocacao:
    "Renda Fixa Pós-Fixada está em 70,00% frente ao alvo de 50,00% (+20,00 p.p.) e Ações em 30,00% frente a 50,00% (-20,00 p.p.).",
  evolucaoDesdeUltimoCheckin:
    "Este é o primeiro check-in registrado, servindo como marco inicial de acompanhamento.",
  impactoMacroENoticias:
    "Com a Selic em 14,75% e IPCA em 5,00%, o juro real de 9,29% mantém a renda fixa atrativa; não houve notícias externas disponíveis.",
  opcoesDeAjuste: [
    {
      classeAtivo: "acoes",
      acaoSugerida: "Direcionar o novo aporte mensal para a classe de ações",
      valorSugeridoCentavos: 200_000,
      justificativa:
        "A classe está 20,00 p.p. abaixo do alvo e o aporte melhora a aderência sem exigir vendas.",
    },
  ],
  alertas: ["Notícias externas indisponíveis nesta execução."],
  fontesConsultadas: [],
  disclaimer:
    "Conteúdo educacional. Não constitui recomendação de investimento.",
};

const FAKE_MODEL = {
  specificationVersion: "v4",
  provider: "anthropic.messages",
  modelId: "claude-sonnet-4-5",
} as unknown as LanguageModel;

describe("AI provider resolution", () => {
  it("auto-detects anthropic when ANTHROPIC_API_KEY is present", () => {
    const resolved = resolveAiModel({
      env: { ANTHROPIC_API_KEY: "sk-ant-test-key" },
    });

    expect(resolved.provider).toBe("anthropic");
    expect(resolved.modelId).toBe(DEFAULT_AI_MODELS.anthropic);
  });

  it("auto-detects google via GEMINI_API_KEY alias and supports AI_MODEL override", () => {
    const resolved = resolveAiModel({
      env: {
        GEMINI_API_KEY: "AIza-test-key",
        AI_MODEL: "gemini-2.5-pro",
      },
    });

    expect(resolved.provider).toBe("google");
    expect(resolved.modelId).toBe("gemini-2.5-pro");
  });

  it("respects explicit AI_PROVIDER=google even when ANTHROPIC_API_KEY is also set", () => {
    const resolved = resolveAiModel({
      env: {
        AI_PROVIDER: "google",
        ANTHROPIC_API_KEY: "sk-ant-test",
        GOOGLE_GENERATIVE_AI_API_KEY: "AIza-google-key",
      },
    });

    expect(resolved.provider).toBe("google");
    expect(resolved.modelId).toBe(DEFAULT_AI_MODELS.google);
  });

  it("throws AiConfigurationError when provider is invalid or API key is missing without echoing env values", () => {
    let invalidProviderError: unknown;
    try {
      resolveAiModel({ env: { AI_PROVIDER: "secret-unknown-llm" } });
    } catch (error) {
      invalidProviderError = error;
    }

    expect(invalidProviderError).toBeInstanceOf(AiConfigurationError);
    expect((invalidProviderError as AiConfigurationError).code).toBe(
      "INVALID_PROVIDER",
    );
    expect((invalidProviderError as AiConfigurationError).message).not.toContain(
      "secret-unknown-llm",
    );

    const invalidStatus = getAiProviderStatus({
      AI_PROVIDER: "secret-unknown-llm",
    });
    expect(invalidStatus.configured).toBe(false);
    expect(invalidStatus.reason).not.toContain("secret-unknown-llm");

    expect(() => resolveAiModel({ env: {} })).toThrowError(AiConfigurationError);

    expect(() =>
      resolveAiModel({ env: { AI_PROVIDER: "anthropic" } }),
    ).toThrowError(AiConfigurationError);
  });

  it("reports provider status safely without exposing API keys", () => {
    const configured = getAiProviderStatus({
      ANTHROPIC_API_KEY: "sk-ant-super-secret",
    });
    expect(configured).toEqual({
      configured: true,
      provider: "anthropic",
      modelId: DEFAULT_AI_MODELS.anthropic,
    });
    expect(JSON.stringify(configured)).not.toContain("sk-ant-super-secret");

    const missing = getAiProviderStatus({ AI_PROVIDER: "google" });
    expect(missing.configured).toBe(false);
    expect(missing.provider).toBe("google");
    expect(missing.modelId).toBeNull();
  });
});

describe("generateInvestmentAnalysis", () => {
  it("returns validated structured output via generateText + Output.object", async () => {
    const mockGenerateText = vi.fn(async () => ({
      output: VALID_ANALYSIS,
    })) as unknown as typeof generateText;

    const result = await generateInvestmentAnalysis(createSampleInput(), {
      model: FAKE_MODEL,
      provider: "anthropic",
      modelId: "claude-sonnet-4-5",
      generateTextImpl: mockGenerateText,
    });

    expect(mockGenerateText).toHaveBeenCalledTimes(1);
    const callArg = (mockGenerateText as unknown as ReturnType<typeof vi.fn>)
      .mock.calls[0][0] as Record<string, unknown>;
    expect(callArg.model).toBe(FAKE_MODEL);
    expect(callArg.output).toBeDefined();
    expect(typeof callArg.system).toBe("string");
    expect(typeof callArg.prompt).toBe("string");

    expect(result.provider).toBe("anthropic");
    expect(result.modelId).toBe("claude-sonnet-4-5");
    expect(result.analysis).toEqual(VALID_ANALYSIS);
  });

  it("falls back to MANDATORY_DISCLAIMER when model returns blank disclaimer", async () => {
    const mockGenerateText = vi.fn(async () => ({
      output: {
        ...VALID_ANALYSIS,
        disclaimer: "   ",
      },
    })) as unknown as typeof generateText;

    const result = await generateInvestmentAnalysis(createSampleInput(), {
      model: FAKE_MODEL,
      provider: "google",
      modelId: "gemini-2.5-flash",
      generateTextImpl: mockGenerateText,
    });

    expect(result.analysis.disclaimer).toBe(MANDATORY_DISCLAIMER);
  });

  it("wraps NoObjectGeneratedError into AiGenerationError with code NO_OBJECT_GENERATED", async () => {
    const sdkError = new NoObjectGeneratedError({
      message: "Failed to parse object",
      text: "{ invalid json",
      response: {
        id: "resp-1",
        timestamp: new Date("2026-11-20T12:00:00.000Z"),
        modelId: "claude-sonnet-4-5",
      },
      usage: {
        inputTokens: 100,
        inputTokenDetails: {
          noCacheTokens: 100,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
        },
        outputTokens: 20,
        outputTokenDetails: {
          textTokens: 20,
          reasoningTokens: 0,
        },
        totalTokens: 120,
      },
      finishReason: "stop",
    });

    const mockGenerateText = vi.fn(async () => {
      throw sdkError;
    }) as unknown as typeof generateText;

    await expect(
      generateInvestmentAnalysis(createSampleInput(), {
        model: FAKE_MODEL,
        generateTextImpl: mockGenerateText,
      }),
    ).rejects.toMatchObject({
      name: "AiGenerationError",
      code: "NO_OBJECT_GENERATED",
    });
  });

  it("wraps NoOutputGeneratedError into AiGenerationError with code NO_OUTPUT_GENERATED", async () => {
    const sdkError = new NoOutputGeneratedError({
      message: "No output generated",
    });

    const mockGenerateText = vi.fn(async () => {
      throw sdkError;
    }) as unknown as typeof generateText;

    await expect(
      generateInvestmentAnalysis(createSampleInput(), {
        model: FAKE_MODEL,
        generateTextImpl: mockGenerateText,
      }),
    ).rejects.toMatchObject({
      name: "AiGenerationError",
      code: "NO_OUTPUT_GENERATED",
    });
  });

  it("wraps invalid output payload into AiGenerationError with code VALIDATION_ERROR", async () => {
    const mockGenerateText = vi.fn(async () => ({
      output: { resumoExecutivo: "Incompleto" },
    })) as unknown as typeof generateText;

    await expect(
      generateInvestmentAnalysis(createSampleInput(), {
        model: FAKE_MODEL,
        generateTextImpl: mockGenerateText,
      }),
    ).rejects.toMatchObject({
      name: "AiGenerationError",
      code: "VALIDATION_ERROR",
    });
  });

  it("wraps unknown upstream errors into AiGenerationError without leaking secrets", async () => {
    const mockGenerateText = vi.fn(async () => {
      throw new Error("Upstream 500 with sk-ant-secret");
    }) as unknown as typeof generateText;

    let caught: unknown;
    try {
      await generateInvestmentAnalysis(createSampleInput(), {
        model: FAKE_MODEL,
        generateTextImpl: mockGenerateText,
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(AiGenerationError);
    expect((caught as AiGenerationError).code).toBe("PROVIDER_ERROR");
    expect((caught as AiGenerationError).message).not.toContain("sk-ant-secret");
  });
});

describe("POST /api/checkins/analyze", () => {
  const savedEnv = {
    AI_PROVIDER: process.env.AI_PROVIDER,
    AI_MODEL: process.env.AI_MODEL,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    GOOGLE_GENERATIVE_AI_API_KEY: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
  };

  afterEach(() => {
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  it("returns 400 on malformed JSON body", async () => {
    const req = new NextRequest("http://localhost:3000/api/checkins/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{ invalid-json",
    });

    const res = await analyzeCheckInPost(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 on Zod validation failure", async () => {
    const req = new NextRequest("http://localhost:3000/api/checkins/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ referenceMonth: "invalid-month" }),
    });

    const res = await analyzeCheckInPost(req);
    const json = (await res.json()) as { error: string; details?: unknown };
    expect(res.status).toBe(400);
    expect(json.details).toBeDefined();
  });

  it("computes motorResult when omitted and returns 503 when AI keys are unconfigured", async () => {
    delete process.env.AI_PROVIDER;
    delete process.env.AI_MODEL;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    delete process.env.GEMINI_API_KEY;

    const sample = createSampleInput();
    const req = new NextRequest("http://localhost:3000/api/checkins/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        profile: sample.profile,
        positions: sample.positions,
        referenceMonth: sample.referenceMonth,
        userNotes: sample.userNotes,
        contributionCents: sample.contributionCents,
        macroIndicators: sample.macroIndicators,
        skipNews: true,
      }),
    });

    const res = await analyzeCheckInPost(req);
    const json = (await res.json()) as { error: string; code: string };
    expect(res.status).toBe(503);
    expect(json.code).toBe("MISSING_API_KEY");
  });
});
