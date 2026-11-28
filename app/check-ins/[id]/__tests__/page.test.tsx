// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSessionUser: vi.fn(),
  isDatabaseConfigured: vi.fn(() => true),
  getProfileForUser: vi.fn(),
  getCheckInByIdForProfile: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

vi.mock("next/navigation", () => ({
  redirect: mocks.redirect,
  notFound: mocks.notFound,
  usePathname: () => "/check-ins/ci-2",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("next/server", () => ({ connection: async () => undefined }));
vi.mock("@/lib/auth/session", () => ({ getSessionUser: mocks.getSessionUser }));
vi.mock("@/lib/db/prisma", () => ({ isDatabaseConfigured: mocks.isDatabaseConfigured }));
vi.mock("@/lib/profile/repository", () => ({ getProfileForUser: mocks.getProfileForUser }));
vi.mock("@/lib/history/repository", () => {
  class RepositoryHydrationError extends Error {}
  return {
    RepositoryHydrationError,
    getCheckInByIdForProfile: mocks.getCheckInByIdForProfile,
  };
});

import CheckInDetailPage from "@/app/check-ins/[id]/page";
import { RepositoryHydrationError } from "@/lib/history/repository";
import { CHECKINS, PERFIL_COM_ATIVOS } from "@/lib/testing/telas";
import type { CheckInDetail } from "@/lib/types/domain";

const CHECKIN = CHECKINS[1];

const COM_IA: CheckInDetail = {
  ...CHECKIN,
  aiAnalysis: {
    resumoExecutivo: "Sua carteira cresceu e ficou mais perto do alvo.",
    diagnosticoAlocacao: "Renda fixa pós segue acima do alvo.",
    evolucaoDesdeUltimoCheckin: "Patrimônio subiu R$ 2.000,00.",
    impactoMacroENoticias: "Selic estável.",
    opcoesDeAjuste: [
      {
        classeAtivo: "acoes",
        acaoSugerida: "Direcionar aportes",
        valorSugeridoCentavos: 100_000,
        justificativa: "Ações estão abaixo do alvo.",
      },
    ],
    alertas: [],
    fontesConsultadas: [],
    disclaimer: "Conteúdo educacional; não é recomendação de investimento.",
  },
};

function pagina(id = "ci-2") {
  return CheckInDetailPage({
    params: Promise.resolve({ id }),
  } as Parameters<typeof CheckInDetailPage>[0]);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.isDatabaseConfigured.mockReturnValue(true);
  mocks.getSessionUser.mockResolvedValue({ id: "user-1", email: "ana@example.com", name: null });
  mocks.getProfileForUser.mockResolvedValue(PERFIL_COM_ATIVOS);
  mocks.getCheckInByIdForProfile.mockResolvedValue(COM_IA);
});
afterEach(() => cleanup());

describe("Página de detalhe do check-in", () => {
  it("mostra resumo, análise da IA, contexto e posições do check-in", async () => {
    render(await pagina());

    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Check-in de novembro de 2026");
    const resumo = screen.getByRole("region", { name: "Resumo do check-in" });
    expect(within(resumo).getByText("R$ 12.000,00")).toBeTruthy();
    expect(within(resumo).getByText("R$ 1.500,00")).toBeTruthy();
    expect(screen.getByText("Sua carteira cresceu e ficou mais perto do alvo.")).toBeTruthy();
    expect(screen.getByText("Direcionar aportes")).toBeTruthy();
    expect(screen.getByText("Conteúdo educacional; não é recomendação de investimento.")).toBeTruthy();
    expect(screen.getByText("Recebi o 13º e aportei mais.")).toBeTruthy();
    const tabela = screen.getByRole("table");
    expect(within(tabela).getByText("FII Logística")).toBeTruthy();
    expect(within(tabela).getAllByRole("row")).toHaveLength(4);
    expect(mocks.getCheckInByIdForProfile).toHaveBeenCalledWith("ci-2", PERFIL_COM_ATIVOS.id);
  });

  it("sem análise da IA, usa as diferenças do motor e o aviso padrão", async () => {
    mocks.getCheckInByIdForProfile.mockResolvedValue({ ...CHECKIN, aiAnalysis: null, userNotes: "" });
    render(await pagina());

    expect(screen.getAllByText("Acompanhar alocação").length).toBeGreaterThan(0);
    expect(screen.getByText("Nenhuma nota pessoal foi registrada")).toBeTruthy();
    expect(
      screen.getByText("Conteúdo educacional e informativo; não constitui recomendação de investimento."),
    ).toBeTruthy();
  });

  it("estado vazio: check-in sem posições salvas", async () => {
    mocks.getCheckInByIdForProfile.mockResolvedValue({ ...COM_IA, positions: [] });
    render(await pagina());

    expect(screen.getByText("Não há posições salvas para este check-in.")).toBeTruthy();
  });

  it("estado de erro: dados inconsistentes no banco", async () => {
    mocks.getCheckInByIdForProfile.mockRejectedValue(new RepositoryHydrationError("ruim"));
    render(await pagina());

    expect(
      screen.getByText("Os dados deste check-in estão inconsistentes e não puderam ser exibidos."),
    ).toBeTruthy();
  });

  it("check-in de outro usuário ou inexistente dá 404", async () => {
    mocks.getCheckInByIdForProfile.mockResolvedValue(null);

    await expect(pagina("ci-de-outro")).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("sem sessão, redireciona e não lê o banco", async () => {
    mocks.getSessionUser.mockResolvedValue(null);

    await expect(pagina()).rejects.toThrow("NEXT_REDIRECT:/");
    expect(mocks.getCheckInByIdForProfile).not.toHaveBeenCalled();
  });

  it("ação principal: 'Voltar aos check-ins' leva à lista", async () => {
    render(await pagina());

    expect(screen.getByRole("button", { name: "Voltar aos check-ins" }).getAttribute("href")).toBe(
      "/check-ins",
    );
  });
});
