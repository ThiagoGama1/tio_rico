import { beforeEach, describe, expect, it } from "vitest";
import {
  ONBOARDING_DRAFT_KEY,
  apagarRascunho,
  lerRascunho,
  mesAtual,
  prazoNoPassado,
  salvarRascunho,
} from "@/lib/onboarding/rascunho";

class MemoryStorage {
  private data = new Map<string, string>();
  getItem(key: string) {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.data.set(key, value);
  }
  removeItem(key: string) {
    this.data.delete(key);
  }
}

beforeEach(() => {
  (globalThis as { sessionStorage?: unknown }).sessionStorage = new MemoryStorage();
});

describe("rascunho do onboarding", () => {
  it("salvarRascunho junta com o que já existe", () => {
    salvarRascunho({ name: "Ana" });
    salvarRascunho({ goals: [] });
    expect(lerRascunho()).toEqual({ name: "Ana", goals: [] });
  });

  it("lerRascunho devolve {} com JSON inválido ou valor que não é objeto", () => {
    sessionStorage.setItem(ONBOARDING_DRAFT_KEY, "{quebrado");
    expect(lerRascunho()).toEqual({});
    sessionStorage.setItem(ONBOARDING_DRAFT_KEY, "[1,2]");
    expect(lerRascunho()).toEqual({});
  });

  it("apagarRascunho limpa tudo", () => {
    salvarRascunho({ name: "Ana" });
    apagarRascunho();
    expect(lerRascunho()).toEqual({});
  });
});

describe("prazo (#52)", () => {
  const agora = new Date(2026, 10, 27); // 27/11/2026

  it("mesAtual usa YYYY-MM", () => {
    expect(mesAtual(agora)).toBe("2026-11");
  });

  it("mês anterior é passado; o atual e os futuros não", () => {
    expect(prazoNoPassado("2020-01", agora)).toBe(true);
    expect(prazoNoPassado("2026-10", agora)).toBe(true);
    expect(prazoNoPassado("2026-11", agora)).toBe(false);
    expect(prazoNoPassado("2031-11", agora)).toBe(false);
    expect(prazoNoPassado("", agora)).toBe(false);
  });
});
