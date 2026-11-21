import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import type { LanguageModel } from "ai";

export const AI_PROVIDERS = ["anthropic", "google"] as const;
export type AiProviderName = (typeof AI_PROVIDERS)[number];

/**
 * Verified default models from installed `@ai-sdk/anthropic` and `@ai-sdk/google`
 * type catalogs (overrideable via `AI_MODEL`).
 */
export const DEFAULT_AI_MODELS: Record<AiProviderName, string> = {
  anthropic: "claude-sonnet-4-5",
  google: "gemini-2.5-flash",
};

export type AiConfigurationErrorCode = "INVALID_PROVIDER" | "MISSING_API_KEY";

export class AiConfigurationError extends Error {
  readonly code: AiConfigurationErrorCode;

  constructor(message: string, code: AiConfigurationErrorCode) {
    super(message);
    this.name = "AiConfigurationError";
    this.code = code;
  }
}

export interface ResolveAiModelOptions {
  provider?: string;
  modelId?: string;
  env?: Record<string, string | undefined>;
}

export interface ResolvedAiModel {
  model: LanguageModel;
  provider: AiProviderName;
  modelId: string;
}

export interface AiProviderStatus {
  configured: boolean;
  provider: AiProviderName | null;
  modelId: string | null;
  reason?: string;
}

function readTrimmed(value: string | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

function resolveProviderAndKey(
  options?: ResolveAiModelOptions,
): { provider: AiProviderName; apiKey: string; modelId: string } {
  const env = options?.env ?? process.env;
  const rawProvider = readTrimmed(options?.provider ?? env.AI_PROVIDER).toLowerCase();

  const anthropicKey = readTrimmed(env.ANTHROPIC_API_KEY);
  const googleKey =
    readTrimmed(env.GOOGLE_GENERATIVE_AI_API_KEY) ||
    readTrimmed(env.GEMINI_API_KEY);

  let provider: AiProviderName;

  if (rawProvider) {
    if (rawProvider !== "anthropic" && rawProvider !== "google") {
      throw new AiConfigurationError(
        'AI_PROVIDER inválido. Use "anthropic" ou "google".',
        "INVALID_PROVIDER",
      );
    }
    provider = rawProvider;
  } else if (anthropicKey) {
    provider = "anthropic";
  } else if (googleKey) {
    provider = "google";
  } else {
    throw new AiConfigurationError(
      "Nenhuma chave de API de IA configurada. Defina ANTHROPIC_API_KEY ou GOOGLE_GENERATIVE_AI_API_KEY (ou GEMINI_API_KEY).",
      "MISSING_API_KEY",
    );
  }

  const apiKey = provider === "anthropic" ? anthropicKey : googleKey;

  if (!apiKey) {
    const requiredVars =
      provider === "anthropic"
        ? "ANTHROPIC_API_KEY"
        : "GOOGLE_GENERATIVE_AI_API_KEY (ou GEMINI_API_KEY)";
    throw new AiConfigurationError(
      `Provedor "${provider}" selecionado, mas a variável ${requiredVars} não está configurada.`,
      "MISSING_API_KEY",
    );
  }

  const modelId =
    readTrimmed(options?.modelId ?? env.AI_MODEL) || DEFAULT_AI_MODELS[provider];

  return { provider, apiKey, modelId };
}

/**
 * Resolves the active Vercel AI SDK LanguageModel (Anthropic Claude or Google Gemini)
 * using private API keys from environment variables.
 */
export function resolveAiModel(options?: ResolveAiModelOptions): ResolvedAiModel {
  const { provider, apiKey, modelId } = resolveProviderAndKey(options);

  if (provider === "anthropic") {
    const anthropicProvider = createAnthropic({ apiKey });
    return {
      model: anthropicProvider(modelId),
      provider,
      modelId,
    };
  }

  const googleProvider = createGoogleGenerativeAI({ apiKey });
  return {
    model: googleProvider(modelId),
    provider,
    modelId,
  };
}

/**
 * Safe inspection helper for health checks and diagnostics.
 * Never returns or leaks API key values.
 */
export function getAiProviderStatus(
  env: Record<string, string | undefined> = process.env,
): AiProviderStatus {
  try {
    const { provider, modelId } = resolveProviderAndKey({ env });
    return {
      configured: true,
      provider,
      modelId,
    };
  } catch (error) {
    const rawProvider = readTrimmed(env.AI_PROVIDER).toLowerCase();
    const recognizedProvider: AiProviderName | null =
      rawProvider === "anthropic" || rawProvider === "google"
        ? rawProvider
        : null;

    return {
      configured: false,
      provider: recognizedProvider,
      modelId: null,
      reason:
        error instanceof Error
          ? error.message
          : "Configuração do provedor de IA indisponível.",
    };
  }
}
