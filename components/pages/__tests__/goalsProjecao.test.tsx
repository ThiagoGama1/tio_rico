// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => "/metas",
}));

import { Goals } from "@/components/pages/goals";
import { computePortfolioEvolution } from "@/lib/history/evolution";
import { CHECKINS, INDICADORES, PERFIL, chamadas, mockFetch } from "@/lib/testing/telas";
import type { InvestorProfile } from "@/lib/types/domain";

// Último check-in (ci-2, 2026-11): patrimônio R$ 12.000,00 e aporte R$ 1.500,00.
const PERFIL_PROJECAO: InvestorProfile = {
  ...PERFIL,
  goals: [
    // faltam R$ 3.000 → 2 meses de R$ 1.500 → jan/2027, antes do prazo
    { title: "Viagem", targetAmountCents: 1_500_000, targetDate: "2027-12", priority: "alta" },
    // faltam R$ 48.000 → 32 meses → jul/2029, depois do prazo (formato antigo "12/2026")
    { title: "Carro", targetAmountCents: 6_000_000, targetDate: "12/2026", priority: "media" },
    { title: "Sem valor", priority: "baixa" },
  ],
};

function evolucao(profile: InvestorProfile, checkIns = CHECKINS) {
  return {
    url: "/api/portfolio/evolution",
    body: { profile, evolution: computePortfolioEvolution(checkIns, profile) },
  };
}

/** Taxa zero deixa as contas exatas: só o aporte faz o patrimônio crescer. */
function detalhe(rendimentoAnualPct: number) {
  return {
    url: "/api/checkins/ci-2",
    body: { ...CHECKINS[1], motorResult: { ...CHECKINS[1].motorResult, rendimentoAnualPct } },
  };
}

function linhaDaMeta(titulo: string) {
  const item = screen.getByRole("heading", { name: titulo }).closest("article")!;
  return within(item as HTMLElement);
}

beforeEach(() => vi.clearAllMocks());
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Goals: projeção de quando cada meta é alcançada (#94)", () => {
  it("chega no prazo: mostra o mês com o aporte do último check-in", async () => {
    const fetchSpy = mockFetch([evolucao(PERFIL_PROJECAO), detalhe(0)]);
    render(<Goals />);

    const campo = (await screen.findByLabelText("Aporte mensal")) as HTMLInputElement;
    expect(campo.value).toBe("1.500,00");
    expect(
      linhaDaMeta("Viagem").getByText(/^Aportando R\$\s1\.500,00 por mês, você chega lá em jan\/2027\.$/),
    ).toBeTruthy();
    expect(screen.getByText("Estimativa com base no rendimento atual da carteira.")).toBeTruthy();
    // meta sem valor-alvo não ganha linha de projeção
    expect(linhaDaMeta("Sem valor").queryByText(/chega|alcançada\./)).toBeNull();
    expect(chamadas(fetchSpy, "GET", "/api/indicators")).toHaveLength(0);
  });

  it("passa do prazo: avisa, aceitando o prazo no formato 12/2026", async () => {
    mockFetch([evolucao(PERFIL_PROJECAO), detalhe(0)]);
    render(<Goals />);

    await screen.findByLabelText("Aporte mensal");
    expect(
      linhaDaMeta("Carro").getByText(
        "Nesse ritmo você chega em jul/2029, depois do prazo (dez/2026).",
      ),
    ).toBeTruthy();
  });

  it("nunca chega: sem aporte e sem rendimento", async () => {
    mockFetch([evolucao(PERFIL_PROJECAO), detalhe(0)]);
    const user = userEvent.setup();
    render(<Goals />);

    const campo = await screen.findByLabelText("Aporte mensal");
    await user.clear(campo);

    expect(linhaDaMeta("Viagem").getByText("Nesse ritmo a meta não é alcançada.")).toBeTruthy();
    expect(linhaDaMeta("Carro").getByText("Nesse ritmo a meta não é alcançada.")).toBeTruthy();
  });

  it("simular outro aporte atualiza as linhas na hora", async () => {
    mockFetch([evolucao(PERFIL_PROJECAO), detalhe(0)]);
    const user = userEvent.setup();
    render(<Goals />);

    const campo = await screen.findByLabelText("Aporte mensal");
    await user.clear(campo);
    await user.type(campo, "3.000");

    // R$ 3.000/mês: faltam R$ 3.000 → 1 mês (dez/2026)
    expect(
      linhaDaMeta("Viagem").getByText(/^Aportando R\$\s3\.000,00 por mês, você chega lá em dez\/2026\.$/),
    ).toBeTruthy();
    // R$ 48.000 / R$ 3.000 = 16 meses → mar/2028
    expect(
      linhaDaMeta("Carro").getByText("Nesse ritmo você chega em mar/2028, depois do prazo (dez/2026)."),
    ).toBeTruthy();
  });

  it("usa o rendimento do motor do último check-in", async () => {
    mockFetch([evolucao(PERFIL_PROJECAO), detalhe(12)]);
    render(<Goals />);

    await screen.findByLabelText("Aporte mensal");
    // com 12% a.a. o Carro chega antes do que só com aportes (jul/2029)
    const texto = linhaDaMeta("Carro").getByText(/^Nesse ritmo você chega em/).textContent!;
    expect(texto).not.toContain("jul/2029");
  });

  it("sem check-in: usa o CDI e o aporte começa vazio", async () => {
    const fetchSpy = mockFetch([
      evolucao(PERFIL_PROJECAO, []),
      { url: "/api/indicators", body: INDICADORES },
    ]);
    render(<Goals />);

    const campo = (await screen.findByLabelText("Aporte mensal")) as HTMLInputElement;
    expect(campo.value).toBe("");
    await waitFor(() => expect(chamadas(fetchSpy, "GET", "/api/indicators")).toHaveLength(1));
    expect(chamadas(fetchSpy, "GET", /\/api\/checkins\//)).toHaveLength(0);
    // patrimônio zero e só o CDI rendendo sobre zero: não chega
    expect(linhaDaMeta("Viagem").getByText("Nesse ritmo a meta não é alcançada.")).toBeTruthy();
  });

  it("sem taxa disponível, não mostra projeção", async () => {
    mockFetch([
      evolucao(PERFIL_PROJECAO),
      { url: "/api/checkins/ci-2", status: 500, body: { error: "x" } },
      { url: "/api/indicators", status: 502, body: { error: "x" } },
    ]);
    render(<Goals />);

    await screen.findByRole("heading", { name: "Viagem" });
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByLabelText("Aporte mensal")).toBeNull();
  });
});
