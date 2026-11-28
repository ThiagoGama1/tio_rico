// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => "/evolucao",
}));

import { Evolution } from "@/components/pages/evolution";
import { computePortfolioEvolution } from "@/lib/history/evolution";
import {
  CHECKINS,
  EVOLUCAO_RESPOSTA,
  EVOLUCAO_VAZIA,
  PERFIL,
  mockFetch,
} from "@/lib/testing/telas";

beforeEach(() => vi.clearAllMocks());
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Evolution (evolução)", () => {
  it("mostra variação do período, aportes, gráfico e mudanças por classe", async () => {
    mockFetch([{ url: "/api/portfolio/evolution", body: EVOLUCAO_RESPOSTA }]);
    render(<Evolution />);

    const resumo = await screen.findByRole("region", { name: "Resumo da evolução" });
    // R$ 10.000,00 (out) → R$ 12.000,00 (nov)
    expect(within(resumo).getAllByText("+R$ 2.000,00")).toHaveLength(2);
    expect(within(resumo).getByText("R$ 2.500,00")).toBeTruthy();
    expect(within(resumo).getByText("2 check-ins registrados")).toBeTruthy();
    expect(screen.getByRole("img", { name: "Linha de evolução do patrimônio por check-in" })).toBeTruthy();
    expect(screen.getByText("OUT/2026 → NOV/2026")).toBeTruthy();
    expect(screen.getByText("Fundos Imobiliários (FIIs)")).toBeTruthy();
  });

  it("estado vazio: perfil sem check-in", async () => {
    mockFetch([{ url: "/api/portfolio/evolution", body: EVOLUCAO_VAZIA }]);
    render(<Evolution />);

    expect(await screen.findByText("Seu histórico aparecerá aqui depois do primeiro check-in.")).toBeTruthy();
    expect(screen.getByText("Ainda não há períodos registrados para detalhar.")).toBeTruthy();
    expect(screen.getByText("Nenhum aporte registrado ainda")).toBeTruthy();
  });

  it("com um único check-in, pede o próximo para desenhar a linha", async () => {
    const umCheckIn = {
      ...EVOLUCAO_RESPOSTA,
      evolution: computePortfolioEvolution([CHECKINS[0]], {
        id: PERFIL.id,
        goals: PERFIL.goals,
        targetAllocation: PERFIL.targetAllocation,
      }),
      checkInsCount: 1,
    };
    mockFetch([{ url: "/api/portfolio/evolution", body: umCheckIn }]);
    render(<Evolution />);

    expect(await screen.findByText("Primeiro check-in registrado")).toBeTruthy();
    expect(screen.getByText("Registre mais um check-in para comparar as mudanças por classe de ativo.")).toBeTruthy();
  });

  it("mostra a mensagem de erro da API", async () => {
    mockFetch([
      { url: "/api/portfolio/evolution", status: 500, body: { error: "Histórico da carteira com dados inconsistentes." } },
    ]);
    render(<Evolution />);

    expect(await screen.findByText("Histórico da carteira com dados inconsistentes.")).toBeTruthy();
  });

  it("volta para o login quando a sessão expirou (401)", async () => {
    mockFetch([{ url: "/api/portfolio/evolution", status: 401, body: { error: "Não autenticado." } }]);
    render(<Evolution />);

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/login"));
  });

  it("ação principal: 'Ver check-ins' leva à lista", async () => {
    mockFetch([{ url: "/api/portfolio/evolution", body: EVOLUCAO_RESPOSTA }]);
    render(<Evolution />);

    await screen.findByRole("region", { name: "Resumo da evolução" });
    expect(screen.getByRole("button", { name: "Ver check-ins" }).getAttribute("href")).toBe("/check-ins");
  });
});
