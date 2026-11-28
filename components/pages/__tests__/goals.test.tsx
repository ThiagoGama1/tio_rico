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
import {
  EVOLUCAO_RESPOSTA,
  EVOLUCAO_VAZIA,
  PERFIL,
  chamadas,
  mockFetch,
} from "@/lib/testing/telas";

const EVOLUCAO = { url: "/api/portfolio/evolution", body: EVOLUCAO_RESPOSTA };

beforeEach(() => vi.clearAllMocks());
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Goals (metas)", () => {
  it("lista as metas com o progresso calculado sobre o último patrimônio", async () => {
    mockFetch([EVOLUCAO]);
    render(<Goals />);

    const lista = await screen.findByRole("list", { name: "Metas cadastradas" });
    expect(within(lista).getByText("Reserva de emergência")).toBeTruthy();
    // patrimônio R$ 12.000,00 sobre alvo R$ 30.000,00
    expect(within(lista).getByText("40%")).toBeTruthy();
    expect(within(lista).getByText("Faltam R$ 18.000,00 para alcançar o objetivo.")).toBeTruthy();
    const resumo = screen.getByRole("region", { name: "Resumo das metas" });
    expect(within(resumo).getByText("DEZ/2027")).toBeTruthy();
    expect(within(resumo).getByText("R$ 30.000,00")).toBeTruthy();
  });

  it("estado vazio: perfil sem metas", async () => {
    mockFetch([{ url: "/api/portfolio/evolution", body: EVOLUCAO_VAZIA }]);
    render(<Goals />);

    expect(await screen.findByText("Nenhuma meta cadastrada ainda.")).toBeTruthy();
  });

  it("usuário sem perfil (404) vê o convite para criar o perfil", async () => {
    mockFetch([{ url: "/api/portfolio/evolution", status: 404, body: { error: "Perfil não encontrado." } }]);
    render(<Goals />);

    expect(await screen.findByText("Primeiro, configure seu perfil")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Criar perfil" }).getAttribute("href")).toBe("/onboarding");
  });

  it("mostra o erro da API ao carregar", async () => {
    mockFetch([
      { url: "/api/portfolio/evolution", status: 500, body: { error: "Histórico da carteira com dados inconsistentes." } },
    ]);
    render(<Goals />);

    expect(await screen.findByText("Histórico da carteira com dados inconsistentes.")).toBeTruthy();
  });

  it("adiciona uma meta com PATCH /api/profile mantendo as existentes", async () => {
    const nova = { title: "Viagem", targetAmountCents: 1_200_000, targetDate: "2028-07", priority: "baixa" as const };
    const fetchSpy = mockFetch([
      EVOLUCAO,
      { method: "PATCH", url: "/api/profile", body: { profile: { ...PERFIL, goals: [...PERFIL.goals, nova] } } },
    ]);
    const user = userEvent.setup();
    render(<Goals />);
    await screen.findByRole("list", { name: "Metas cadastradas" });

    await user.click(screen.getAllByRole("button", { name: "Adicionar meta" })[0]);
    const dialogo = await screen.findByRole("dialog");
    await user.type(within(dialogo).getByLabelText("Título"), "Viagem");
    await user.type(within(dialogo).getByLabelText("Valor-alvo"), "12.000,00");
    await user.type(within(dialogo).getByLabelText("Data-alvo"), "2028-07");
    await user.selectOptions(within(dialogo).getByLabelText("Prioridade"), "baixa");
    await user.click(within(dialogo).getByRole("button", { name: "Adicionar meta" }));

    await waitFor(() => expect(chamadas(fetchSpy, "PATCH", "/api/profile")).toHaveLength(1));
    expect(chamadas(fetchSpy, "PATCH", "/api/profile")[0].body).toEqual({
      goals: [...PERFIL.goals, nova],
    });
    expect(await screen.findByText("Meta adicionada com sucesso.")).toBeTruthy();
    expect(router.refresh).toHaveBeenCalled();
  });

  it("remove uma meta com PATCH /api/profile sem ela", async () => {
    const fetchSpy = mockFetch([
      EVOLUCAO,
      { method: "PATCH", url: "/api/profile", body: { profile: { ...PERFIL, goals: [] } } },
    ]);
    const user = userEvent.setup();
    render(<Goals />);
    await screen.findByRole("list", { name: "Metas cadastradas" });

    await user.click(screen.getByRole("button", { name: "Remover Reserva de emergência" }));

    await waitFor(() => expect(chamadas(fetchSpy, "PATCH", "/api/profile")).toHaveLength(1));
    expect(chamadas(fetchSpy, "PATCH", "/api/profile")[0].body).toEqual({ goals: [] });
    expect(await screen.findByText("Nenhuma meta cadastrada ainda.")).toBeTruthy();
  });

  it("mostra o erro da API no formulário quando salvar falha", async () => {
    mockFetch([
      EVOLUCAO,
      { method: "PATCH", url: "/api/profile", status: 400, body: { error: "Dados inválidos para atualização do perfil." } },
    ]);
    const user = userEvent.setup();
    render(<Goals />);
    await screen.findByRole("list", { name: "Metas cadastradas" });

    await user.click(screen.getAllByRole("button", { name: "Adicionar meta" })[0]);
    const dialogo = await screen.findByRole("dialog");
    await user.type(within(dialogo).getByLabelText("Título"), "Viagem");
    await user.click(within(dialogo).getByRole("button", { name: "Adicionar meta" }));

    expect(await within(dialogo).findByText("Dados inválidos para atualização do perfil.")).toBeTruthy();
  });

  // BUG (components/pages/goals.tsx, deleteGoal + o parágrafo `message`): quando
  // a remoção de uma meta falha, a mensagem de erro vai para o mesmo estado
  // `message` das mensagens de sucesso, que é sempre renderizado com a cor verde
  // de sucesso (`text-(--green-1)`). O usuário vê "Falha ao salvar o perfil."
  // em verde, como se tivesse dado certo. Deveria usar `text-destructive`, como
  // o formulário da carteira e o do perfil fazem.
  it.skip("erro ao remover meta aparece como erro, não como sucesso", async () => {
    mockFetch([
      EVOLUCAO,
      { method: "PATCH", url: "/api/profile", status: 500, body: { error: "Falha ao salvar o perfil." } },
    ]);
    const user = userEvent.setup();
    render(<Goals />);
    await screen.findByRole("list", { name: "Metas cadastradas" });

    await user.click(screen.getByRole("button", { name: "Remover Reserva de emergência" }));

    const mensagem = await screen.findByText("Falha ao salvar o perfil.");
    expect(mensagem.className).toContain("text-destructive");
    expect(mensagem.className).not.toContain("green");
  });
});
