import { z } from "zod";

// =============================================================================
// Enums & Constants
// =============================================================================

export const ASSET_CLASSES = [
  "renda_fixa_pos",
  "renda_fixa_pre",
  "renda_fixa_ipca",
  "acoes",
  "fiis",
  "internacional",
  "cripto",
  "caixa",
  "outros",
] as const;

export const AssetClassSchema = z.enum(ASSET_CLASSES);
export type AssetClass = z.infer<typeof AssetClassSchema>;

export const ASSET_CLASS_LABELS: Record<AssetClass, string> = {
  renda_fixa_pos: "Renda Fixa Pós-Fixada (CDI/Selic)",
  renda_fixa_pre: "Renda Fixa Prefixada",
  renda_fixa_ipca: "Renda Fixa IPCA+",
  acoes: "Ações (Brasil)",
  fiis: "Fundos Imobiliários (FIIs)",
  internacional: "Investimentos Internacionais",
  cripto: "Criptoativos",
  caixa: "Caixa / Reserva de Emergência",
  outros: "Outros Ativos",
};

export const RISK_PROFILES = ["conservador", "moderado", "arrojado"] as const;

export const RiskProfileSchema = z.enum(RISK_PROFILES);
export type RiskProfile = z.infer<typeof RiskProfileSchema>;

export const RISK_PROFILE_LABELS: Record<RiskProfile, string> = {
  conservador: "Conservador",
  moderado: "Moderado",
  arrojado: "Arrojado",
};

export const ReferenceMonthSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Mês de referência deve seguir o formato YYYY-MM");
export type ReferenceMonth = z.infer<typeof ReferenceMonthSchema>;

// =============================================================================
// Investor Profile & Portfolio Positions
// =============================================================================

export const InvestorGoalSchema = z.object({
  title: z.string().trim().min(1).max(160),
  targetAmountCents: z.number().int().nonnegative().optional(),
  targetDate: z.string().trim().max(32).optional(),
  priority: z.enum(["alta", "media", "baixa"]).optional(),
});
export type InvestorGoal = z.infer<typeof InvestorGoalSchema>;

export const TargetAllocationSchema = z
  .partialRecord(AssetClassSchema, z.number().min(0).max(100))
  .refine(
    (allocation) => {
      const sum = Object.values(allocation).reduce<number>(
        (acc, val) => acc + (typeof val === "number" ? val : 0),
        0,
      );
      return sum <= 100.01;
    },
    { message: "A soma da alocação-alvo não pode exceder 100%" },
  );
export type TargetAllocation = z.infer<typeof TargetAllocationSchema>;

export const InvestorPreferencesSchema = z.record(z.string(), z.unknown());
export type InvestorPreferences = z.infer<typeof InvestorPreferencesSchema>;

export const InvestorProfileInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.email().optional().nullable(),
  riskProfile: RiskProfileSchema,
  horizonMonths: z.number().int().min(1).max(1200),
  monthlyIncomeCents: z.number().int().nonnegative().optional().nullable(),
  goals: z.array(InvestorGoalSchema).default([]),
  targetAllocation: TargetAllocationSchema,
  preferences: InvestorPreferencesSchema.optional().nullable(),
});
export type InvestorProfileInput = z.infer<typeof InvestorProfileInputSchema>;

export const InvestorProfileSchema = InvestorProfileInputSchema.extend({
  id: z.string().min(1),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type InvestorProfile = z.infer<typeof InvestorProfileSchema>;

export const PortfolioPositionInputSchema = z.object({
  id: z.string().min(1).optional(),
  name: z.string().trim().min(1).max(160),
  assetClass: AssetClassSchema,
  amountCents: z.number().int().nonnegative(),
  indexer: z.string().trim().max(40).optional().nullable(),
  indexerRate: z.number().optional().nullable(),
  liquidity: z.string().trim().max(60).optional().nullable(),
});
export type PortfolioPositionInput = z.infer<typeof PortfolioPositionInputSchema>;

// =============================================================================
// Macro Indicators (BCB SGS)
// =============================================================================

export const IpcaHistoryPointSchema = z.object({
  date: z.string().min(1),
  value: z.number(),
});
export type IpcaHistoryPoint = z.infer<typeof IpcaHistoryPointSchema>;

export const MacroIndicatorsSourceSchema = z.enum([
  "bcb_sgs",
  "database_cache",
  "fallback",
]);
export type MacroIndicatorsSource = z.infer<typeof MacroIndicatorsSourceSchema>;

export const MacroIndicatorsSchema = z.object({
  selicMetaAnnual: z.number(),
  selicDate: z.string().min(1),
  cdiAnnual: z.number(),
  cdiDaily: z.number().nullable(),
  cdiDate: z.string().min(1),
  ipcaMonthly: z.number(),
  ipca12m: z.number(),
  ipcaDate: z.string().min(1),
  ipcaHistory: z.array(IpcaHistoryPointSchema),
  source: MacroIndicatorsSourceSchema,
  fetchedAt: z.string().min(1),
  isStale: z.boolean(),
});
export type MacroIndicators = z.infer<typeof MacroIndicatorsSchema>;

// =============================================================================
// Calculation Motor Contracts
// =============================================================================

export const ClassAllocationComparisonSchema = z.object({
  assetClass: AssetClassSchema,
  currentCents: z.number().int().nonnegative(),
  currentPct: z.number().min(0).max(100),
  targetPct: z.number().min(0).max(100),
  deviationPct: z.number(),
  suggestedContributionCents: z.number().int().nonnegative(),
  projectedPctAfterContribution: z.number().min(0).max(100),
});
export type ClassAllocationComparison = z.infer<
  typeof ClassAllocationComparisonSchema
>;

export const MotorCalculationInputSchema = z.object({
  riskProfile: RiskProfileSchema,
  horizonMonths: z.number().int().min(1),
  positions: z.array(PortfolioPositionInputSchema),
  targetAllocation: TargetAllocationSchema,
  contributionCents: z.number().int().nonnegative(),
  macro: MacroIndicatorsSchema,
});
export type MotorCalculationInput = z.infer<typeof MotorCalculationInputSchema>;

export const MotorCalculationResultSchema = z.object({
  totalCurrentCents: z.number().int().nonnegative(),
  contributionCents: z.number().int().nonnegative(),
  totalAfterContributionCents: z.number().int().nonnegative(),
  allocations: z.array(ClassAllocationComparisonSchema),
  adherenceScore: z.number().min(0).max(100),
  adherenceScoreAfterContribution: z.number().min(0).max(100),
  estimatedAnnualYieldPct: z.number(),
  estimatedRealYieldPct: z.number(),
  realInterestRatePct: z.number(),
  engineVersion: z.string().min(1),
});
export type MotorCalculationResult = z.infer<typeof MotorCalculationResultSchema>;

// =============================================================================
// Market News (Firecrawl)
// =============================================================================

export const MarketNewsItemSchema = z.object({
  title: z.string().min(1),
  url: z.string().min(1),
  source: z.string().min(1),
  publishedAt: z.string().optional(),
  snippet: z.string(),
  topic: z.string().min(1),
});
export type MarketNewsItem = z.infer<typeof MarketNewsItemSchema>;

export const NewsFetchResultSchema = z.object({
  items: z.array(MarketNewsItemSchema),
  newsAvailable: z.boolean(),
  fetchedAt: z.string().min(1),
  queriesUsed: z.array(z.string()),
  error: z.string().optional(),
});
export type NewsFetchResult = z.infer<typeof NewsFetchResultSchema>;

// =============================================================================
// Portfolio Evolution & History
// =============================================================================

export const PortfolioEvolutionPointSchema = z.object({
  checkInId: z.string().min(1),
  referenceMonth: ReferenceMonthSchema,
  createdAt: z.string().min(1),
  totalValueCents: z.number().int().nonnegative(),
  contributionCents: z.number().int().nonnegative(),
  adherenceScore: z.number().min(0).max(100).nullable(),
  allocationsByClass: z.partialRecord(AssetClassSchema, z.number().min(0).max(100)),
});
export type PortfolioEvolutionPoint = z.infer<typeof PortfolioEvolutionPointSchema>;

export const ClassDeltaSchema = z.object({
  assetClass: AssetClassSchema,
  previousCents: z.number().int().nonnegative(),
  currentCents: z.number().int().nonnegative(),
  deltaCents: z.number().int(),
  previousPct: z.number(),
  currentPct: z.number(),
  deltaPct: z.number(),
});
export type ClassDelta = z.infer<typeof ClassDeltaSchema>;

export const PortfolioEvolutionSummarySchema = z.object({
  totalCheckIns: z.number().int().nonnegative(),
  latestTotalCents: z.number().int().nonnegative(),
  previousTotalCents: z.number().int().nonnegative().nullable(),
  deltaFromPreviousCents: z.number().int().nullable(),
  deltaFromPreviousPct: z.number().nullable(),
  deltaFromFirstCents: z.number().int().nullable(),
  deltaFromFirstPct: z.number().nullable(),
  totalContributedCents: z.number().int().nonnegative(),
  latestAdherenceScore: z.number().min(0).max(100).nullable(),
  adherenceDeltaFromPrevious: z.number().nullable(),
  classDeltas: z.array(ClassDeltaSchema),
  points: z.array(PortfolioEvolutionPointSchema),
});
export type PortfolioEvolutionSummary = z.infer<
  typeof PortfolioEvolutionSummarySchema
>;

// =============================================================================
// AI Structured Analysis Output (Vercel AI SDK Output.object)
// =============================================================================

export const AiAdjustmentOptionSchema = z.object({
  classeAtivo: AssetClassSchema.describe(
    "Classe de ativo alvo do ajuste sugerido",
  ),
  acaoSugerida: z
    .string()
    .min(1)
    .describe(
      "Descrição educacional da opção de ajuste (ex.: direcionar aporte, manter posição, acompanhar desequilíbrio)",
    ),
  valorSugeridoCentavos: z
    .number()
    .int()
    .nonnegative()
    .optional()
    .describe(
      "Valor sugerido em centavos inteiros, alinhado aos números do motor de cálculo quando aplicável",
    ),
  justificativa: z
    .string()
    .min(1)
    .describe(
      "Explicação em linguagem simples conectando perfil, desvio de alocação e contexto macro",
    ),
});
export type AiAdjustmentOption = z.infer<typeof AiAdjustmentOptionSchema>;

export const AiNewsSourceRefSchema = z.object({
  titulo: z.string().min(1).describe("Título da notícia ou fonte consultada"),
  url: z.string().min(1).describe("URL da fonte consultada"),
  fonte: z.string().min(1).describe("Nome do veículo ou instituição da fonte"),
});
export type AiNewsSourceRef = z.infer<typeof AiNewsSourceRefSchema>;

export const AiAnalysisOutputSchema = z.object({
  resumoExecutivo: z
    .string()
    .min(1)
    .describe(
      "Síntese direta em 2-4 frases sobre o estado atual da carteira, aderência e efeito do aporte",
    ),
  diagnosticoAlocacao: z
    .string()
    .min(1)
    .describe(
      "Explicação clara da alocação atual versus alocação-alvo usando exclusivamente os números fornecidos pelo motor",
    ),
  evolucaoDesdeUltimoCheckin: z
    .string()
    .min(1)
    .describe(
      "Análise comparativa da evolução desde o último check-in, ou observação clara caso este seja o primeiro check-in",
    ),
  impactoMacroENoticias: z
    .string()
    .min(1)
    .describe(
      "Como Selic, CDI, IPCA e notícias recentes se relacionam com as classes presentes na carteira",
    ),
  opcoesDeAjuste: z
    .array(AiAdjustmentOptionSchema)
    .describe(
      "Lista de opções educacionais de ajuste por classe de ativo, sem recomendar compra/venda de ativos específicos",
    ),
  alertas: z
    .array(z.string().min(1))
    .describe(
      "Pontos de atenção relevantes (ex.: concentração elevada, liquidez, dados macro defasados ou ausência de notícias)",
    ),
  fontesConsultadas: z
    .array(AiNewsSourceRefSchema)
    .describe(
      "Fontes de notícias efetivamente utilizadas na análise (array vazio se nenhuma notícia esteve disponível)",
    ),
  disclaimer: z
    .string()
    .min(1)
    .describe(
      "Aviso claro de caráter educacional informando que a análise não constitui recomendação de investimento nem substitui profissional certificado",
    ),
});
export type AiAnalysisOutput = z.infer<typeof AiAnalysisOutputSchema>;

// =============================================================================
// Check-In Request & Detail DTOs
// =============================================================================

export const CreateCheckInRequestSchema = z.object({
  profileId: z.string().trim().min(1),
  referenceMonth: ReferenceMonthSchema,
  userNotes: z.string().max(4000).default(""),
  contributionCents: z.number().int().nonnegative(),
  positions: z.array(PortfolioPositionInputSchema).optional(),
  includeNews: z.boolean().default(true),
  includeAiAnalysis: z.boolean().default(true),
});
export type CreateCheckInRequest = z.infer<typeof CreateCheckInRequestSchema>;

export const CheckInPositionDetailSchema = z.object({
  id: z.string().min(1),
  assetClass: AssetClassSchema,
  assetLabel: z.string().min(1),
  amountCents: z.number().int().nonnegative(),
  allocationPct: z.number().min(0).max(100),
  targetPct: z.number().min(0).max(100),
});
export type CheckInPositionDetail = z.infer<typeof CheckInPositionDetailSchema>;

export const CheckInDetailSchema = z.object({
  id: z.string().min(1),
  profileId: z.string().min(1),
  referenceMonth: ReferenceMonthSchema,
  userNotes: z.string(),
  contributionCents: z.number().int().nonnegative(),
  totalValueCents: z.number().int().nonnegative(),
  adherenceScore: z.number().min(0).max(100).nullable(),
  macroSnapshot: MacroIndicatorsSchema,
  motorResult: MotorCalculationResultSchema,
  aiAnalysis: AiAnalysisOutputSchema.nullable(),
  newsSources: NewsFetchResultSchema.nullable(),
  positions: z.array(CheckInPositionDetailSchema),
  createdAt: z.string().min(1),
});
export type CheckInDetail = z.infer<typeof CheckInDetailSchema>;
