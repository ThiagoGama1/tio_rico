// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => "/overview",
}));

import { Overview } from "@/components/pages/overview";
import {
  EVOLUCAO_RESPOSTA,
  EVOLUCAO_VAZIA,
  INDICADORES,
  mockFetch,
} from "@/lib/testing/telas";

beforeEach(() => vi.clearAllMocks());
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Overview", () => {
  it("mostra patrimônio, aporte, aderência, check-ins e indicadores", async () => {
    mockFetch([
      { url: "/api/portfolio/evolution", body: EVOLUCAO_RESPOSTA },
      { url: "/api/indicators", body: INDICADORES },
    ]);
    render(<Overview />);

    const resumo = await screen.findByRole("region", { name: "Resumo da carteira" });
    expect(within(resumo).getByText("R$ 12.000,00")).toBeTruthy();
    expect(within(resumo).getByText("R$ 1.500,00")).toBeTruthy();
    expect(within(resumo).getByText("Base: check-in de NOV/2026")).toBeTruthy();
    expect(screen.getByText("13,75% a.a.")).toBeTruthy();
    expect(screen.getByText("4,63%")).toBeTruthy();
    // o check-in mais recente aparece primeiro e leva ao detalhe
    const links = screen.getAllByRole("link").filter((a) => a.getAttribute("href")?.startsWith("/check-ins/ci-"));
    expect(links.map((a) => a.getAttribute("href"))).toEqual(["/check-ins/ci-2", "/check-ins/ci-1"]);
  });

  it("estado vazio: usuário com perfil e sem check-in", async () => {
    mockFetch([
      { url: "/api/portfolio/evolution", body: EVOLUCAO_VAZIA },
      { url: "/api/indicators", body: INDICADORES },
    ]);
    render(<Overview />);

    expect(await screen.findByText("Registre o primeiro check-in")).toBeTruthy();
    expect(screen.getByText("Nenhum aporte registrado")).toBeTruthy();
    expect(screen.getByText("Seu histórico aparecerá aqui depois do primeiro check-in.")).toBeTruthy();
    expect(screen.getByText("Faça um check-in para comparar sua alocação com a meta.")).toBeTruthy();
    expect(screen.getByText("PENDENTE NESTE MÊS")).toBeTruthy();
  });

  it("mostra a mensagem de erro da API", async () => {
    mockFetch([
      {
        url: "/api/portfolio/evolution",
        status: 500,
        body: { error: "Histórico da carteira com dados inconsistentes." },
      },
      { url: "/api/indicators", body: INDICADORES },
    ]);
    render(<Overview />);

    expect(await screen.findByText("Histórico da carteira com dados inconsistentes.")).toBeTruthy();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("volta para o login quando a sessão expirou (401)", async () => {
    mockFetch([
      { url: "/api/portfolio/evolution", status: 401, body: { error: "Não autenticado." } },
      { url: "/api/indicators", body: INDICADORES },
    ]);
    render(<Overview />);

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/login"));
  });

  it("ação principal: 'Novo check-in' leva a /check-ins/new", async () => {
    mockFetch([
      { url: "/api/portfolio/evolution", body: EVOLUCAO_RESPOSTA },
      { url: "/api/indicators", body: INDICADORES },
    ]);
    render(<Overview />);

    await screen.findByRole("region", { name: "Resumo da carteira" });
    expect(screen.getByRole("button", { name: "Novo check-in" }).getAttribute("href")).toBe(
      "/check-ins/new",
    );
    expect(screen.getByRole("link", { name: "Ver todos" }).getAttribute("href")).toBe("/check-ins");
  });
});
