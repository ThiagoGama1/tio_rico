import { describe, expect, it } from "vitest";
import { UpdateInvestorProfileRequestSchema } from "@/lib/types/account";
import {
  CreateCheckInRequestSchema,
  InvestorPreferencesSchema,
  InvestorProfileInputSchema,
  MAX_METAS,
  MAX_POSICOES,
} from "@/lib/types/domain";

const PERFIL = {
  name: "Ana",
  riskProfile: "moderado",
  horizonMonths: 60,
  targetAllocation: { acoes: 100 },
};

const metas = (n: number) => Array.from({ length: n }, (_, i) => ({ title: `Meta ${i}` }));
const posicoes = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    name: `Ativo ${i}`,
    assetClass: "acoes",
    amountCents: 100,
  }));

describe("limites de tamanho das entradas", () => {
  it(`aceita até ${MAX_METAS} metas e recusa mais`, () => {
    expect(InvestorProfileInputSchema.safeParse({ ...PERFIL, goals: metas(MAX_METAS) }).success).toBe(true);
    expect(InvestorProfileInputSchema.safeParse({ ...PERFIL, goals: metas(MAX_METAS + 1) }).success).toBe(false);
    expect(UpdateInvestorProfileRequestSchema.safeParse({ goals: metas(MAX_METAS + 1) }).success).toBe(false);
  });

  it(`aceita até ${MAX_POSICOES} posições no check-in e recusa mais`, () => {
    const base = { profileId: "p", referenceMonth: "2026-11", contributionCents: 0 };
    expect(CreateCheckInRequestSchema.safeParse({ ...base, positions: posicoes(MAX_POSICOES) }).success).toBe(true);
    expect(CreateCheckInRequestSchema.safeParse({ ...base, positions: posicoes(MAX_POSICOES + 1) }).success).toBe(false);
  });

  it("preferences guarda só as chaves conhecidas e descarta o resto", () => {
    const parsed = InvestorPreferencesSchema.parse({
      excluir: ["cripto"],
      excludeCrypto: true,
      currency: "BRL",
      lixo: "x".repeat(10_000),
    });
    expect(parsed).toEqual({ excluir: ["cripto"], excludeCrypto: true, currency: "BRL" });
  });

  it("preferences recusa classe inexistente e texto longo", () => {
    expect(InvestorPreferencesSchema.safeParse({ excluir: ["nao-existe"] }).success).toBe(false);
    expect(InvestorPreferencesSchema.safeParse({ currency: "x".repeat(50) }).success).toBe(false);
  });
});
