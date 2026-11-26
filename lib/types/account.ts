import { z } from "zod";
import {
  InvestorGoalSchema,
  InvestorPreferencesSchema,
  InvestorProfileInputSchema,
  PortfolioPositionInputSchema,
  RiskProfileSchema,
  TargetAllocationSchema,
} from "@/lib/types/domain";

// =============================================================================
// Sessão / Login
// =============================================================================

/**
 * Só aceita caminhos relativos do próprio app ("/carteira"), nunca URLs
 * absolutas nem "//host", para não virar open redirect.
 */
export const RelativeCallbackUrlSchema = z
  .string()
  .trim()
  .max(512)
  .regex(/^\/(?![/\\])/, "callbackUrl deve ser um caminho relativo iniciado por '/'");

export const EmailLoginRequestSchema = z.object({
  // trim/lowercase antes de validar: em `z.email().trim()` o formato é checado primeiro.
  email: z.string().trim().toLowerCase().pipe(z.email()),
  callbackUrl: RelativeCallbackUrlSchema.optional(),
});
export type EmailLoginRequest = z.infer<typeof EmailLoginRequestSchema>;

export const EmailLoginCodeSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  code: z.string().trim().regex(/^\d{6}$/, "Código de verificação inválido."),
});
export type EmailLoginCode = z.infer<typeof EmailLoginCodeSchema>;

// =============================================================================
// Perfil do investidor
// =============================================================================

export const CreateInvestorProfileRequestSchema = InvestorProfileInputSchema;

/**
 * Edição parcial do perfil. Escrito à mão (em vez de `.partial()`) porque no
 * Zod 4 `.partial()` ainda aplica o `.default([])` de `goals`, o que faria um
 * PATCH sem `goals` apagar as metas salvas.
 */
export const UpdateInvestorProfileRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    email: z.email().nullable(),
    riskProfile: RiskProfileSchema,
    horizonMonths: z.number().int().min(1).max(1200),
    monthlyIncomeCents: z.number().int().nonnegative().nullable(),
    goals: z.array(InvestorGoalSchema),
    targetAllocation: TargetAllocationSchema,
    preferences: InvestorPreferencesSchema.nullable(),
  })
  .partial()
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: "Informe ao menos um campo para atualizar.",
  });
export type UpdateInvestorProfileRequest = z.infer<
  typeof UpdateInvestorProfileRequestSchema
>;

// =============================================================================
// Carteira (PortfolioAsset)
// =============================================================================

const PortfolioAssetFieldsSchema = PortfolioPositionInputSchema.omit({ id: true });

export const CreatePortfolioAssetRequestSchema = PortfolioAssetFieldsSchema.strict();
export type CreatePortfolioAssetRequest = z.infer<
  typeof CreatePortfolioAssetRequestSchema
>;

export const UpdatePortfolioAssetRequestSchema = PortfolioAssetFieldsSchema.partial()
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: "Informe ao menos um campo para atualizar.",
  });
export type UpdatePortfolioAssetRequest = z.infer<
  typeof UpdatePortfolioAssetRequestSchema
>;
