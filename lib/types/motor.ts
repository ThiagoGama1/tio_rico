import { z } from "zod";
import {
  OPCOES_EXPERIENCIA,
  OPCOES_OBJETIVO,
  OPCOES_PRAZO,
  OPCOES_REACAO_QUEDA,
} from "@/motor/perfil";
import { AssetClassSchema } from "@/lib/types/domain";

// Validação (Zod) dos corpos das rotas /api/motor/*. As opções vêm do motor,
// então se uma resposta nova for criada em motor/perfil.ts a rota aceita sozinha.

export const SuitabilityRequestSchema = z
  .object({
    objetivo: z.enum(OPCOES_OBJETIVO),
    prazo: z.enum(OPCOES_PRAZO),
    experiencia: z.enum(OPCOES_EXPERIENCIA),
    reacaoQueda: z.enum(OPCOES_REACAO_QUEDA),
    // classes que a pessoa não quer na carteira (ex.: ["cripto"]); só afeta o alvo sugerido
    excluir: z.array(AssetClassSchema).max(9).default([]),
  })
  .strict();
export type SuitabilityRequest = z.infer<typeof SuitabilityRequestSchema>;

/** Limite da projeção: 100 anos. */
export const MAX_MESES_PROJECAO = 1200;

export const ProjecaoRequestSchema = z
  .object({
    valorInicialCentavos: z.number().int().nonnegative().default(0),
    aporteMensalCentavos: z.number().int().nonnegative(),
    // % ao ano, como o resto do app (12 = 12% a.a.). A rota converte para decimal.
    taxaAnualPct: z.number().min(-99).max(1000),
    meses: z.number().int().min(1).max(MAX_MESES_PROJECAO),
    metaCentavos: z.number().int().positive().optional(),
  })
  .strict();
export type ProjecaoRequest = z.infer<typeof ProjecaoRequestSchema>;
