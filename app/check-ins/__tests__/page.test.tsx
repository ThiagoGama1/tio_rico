// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSessionUser: vi.fn(),
  isDatabaseConfigured: vi.fn(() => true),
  getProfileForUser: vi.fn(),
  listCheckIns: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));

vi.mock("next/navigation", () => ({
  redirect: mocks.redirect,
  usePathname: () => "/check-ins",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("next/server", () => ({ connection: async () => undefined }));
vi.mock("@/lib/auth/session", () => ({ getSessionUser: mocks.getSessionUser }));
vi.mock("@/lib/db/prisma", () => ({ isDatabaseConfigured: mocks.isDatabaseConfigured }));
vi.mock("@/lib/profile/repository", () => ({ getProfileForUser: mocks.getProfileForUser }));
vi.mock("@/lib/history/repository", () => ({ listCheckIns: mocks.listCheckIns }));

import CheckInsPage from "@/app/check-ins/page";
import { CHECKINS, PERFIL_COM_ATIVOS } from "@/lib/testing/telas";

/** The repository returns the most recent check-in first ({ order: "desc" }). */
const RECENTES_PRIMEIRO = [...CHECKINS].reverse();

beforeEach(() => {
  vi.clearAllMocks();
  mocks.isDatabaseConfigured.mockReturnValue(true);
  mocks.getSessionUser.mockResolvedValue({ id: "user-1", email: "ana@example.com", name: null });
  mocks.getProfileForUser.mockResolvedValue(PERFIL_COM_ATIVOS);
  mocks.listCheckIns.mockResolvedValue(RECENTES_PRIMEIRO);
});
afterEach(() => cleanup());

describe("Página de check-ins (lista)", () => {
  it("lista os check-ins do mais recente para o mais antigo, com resumo", async () => {
    render(await CheckInsPage());

    const resumo = screen.getByRole("region", { name: "Resumo dos check-ins" });
    expect(within(resumo).getByText("2")).toBeTruthy();
    expect(within(resumo).getByText("R$ 12.000,00")).toBeTruthy();
    expect(within(resumo).getByText("R$ 2.500,00")).toBeTruthy();
    const itens = within(screen.getByRole("list", { name: "Lista de check-ins" })).getAllByRole("link");
    expect(itens.map((a) => a.getAttribute("href"))).toEqual(["/check-ins/ci-2", "/check-ins/ci-1"]);
    expect(mocks.listCheckIns).toHaveBeenCalledWith(PERFIL_COM_ATIVOS.id, { order: "desc" });
  });

  it("estado vazio: perfil sem check-in", async () => {
    mocks.listCheckIns.mockResolvedValue([]);
    render(await CheckInsPage());

    expect(screen.getByText("Seu histórico aparecerá aqui.")).toBeTruthy();
    expect(screen.getByText("Comece pelo seu primeiro registro")).toBeTruthy();
  });

  it("usuário sem perfil vê o pedido para concluir o perfil", async () => {
    mocks.getProfileForUser.mockResolvedValue(null);
    render(await CheckInsPage());

    expect(
      screen.getByText("Conclua seu perfil de investidor para começar a registrar seus check-ins."),
    ).toBeTruthy();
  });

  it("estado de erro: falha ao ler o histórico", async () => {
    mocks.listCheckIns.mockRejectedValue(new Error("db fora do ar"));
    render(await CheckInsPage());

    expect(
      screen.getByText("Não foi possível carregar seus check-ins agora. Tente novamente em alguns instantes."),
    ).toBeTruthy();
  });

  it("sem sessão, redireciona e não lê o banco", async () => {
    mocks.getSessionUser.mockResolvedValue(null);

    await expect(CheckInsPage()).rejects.toThrow("NEXT_REDIRECT:/");
    expect(mocks.listCheckIns).not.toHaveBeenCalled();
  });

  it("ação principal: 'Novo check-in' leva ao formulário", async () => {
    render(await CheckInsPage());

    const botoes = screen.getAllByRole("button", { name: "Novo check-in" });
    expect(botoes.map((b) => b.getAttribute("href"))).toEqual(["/check-ins/new", "/check-ins/new"]);
  });
});
