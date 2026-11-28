// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => "/perfil",
}));

import { Profile } from "@/components/pages/profile";
import { PERFIL, chamadas, mockFetch } from "@/lib/testing/telas";

const CARREGAR = { url: "/api/profile", body: { profile: PERFIL } };

beforeEach(() => vi.clearAllMocks());
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Profile (perfil)", () => {
  it("preenche o formulário com os dados do perfil", async () => {
    mockFetch([CARREGAR]);
    render(<Profile />);

    expect(((await screen.findByLabelText("Nome")) as HTMLInputElement).value).toBe("Ana Teste");
    expect((screen.getByLabelText("Perfil de risco") as HTMLSelectElement).value).toBe("moderado");
    expect((screen.getByLabelText("Horizonte") as HTMLInputElement).value).toBe("60");
    expect((screen.getByLabelText("Renda mensal") as HTMLInputElement).value).toBe("8.500,00");
    expect(screen.getByText("ana@example.com")).toBeTruthy();
    expect(screen.getByText("Metas cadastradas").nextElementSibling?.textContent).toBe("1");
    expect(screen.getByText("Classes na alocação").nextElementSibling?.textContent).toBe("3");
  });

  it("estado vazio: usuário sem perfil (404) vê o convite para criar", async () => {
    mockFetch([{ url: "/api/profile", status: 404, body: { error: "Perfil não encontrado." } }]);
    render(<Profile />);

    expect(await screen.findByRole("heading", { name: "Configure seu perfil" })).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Criar perfil do investidor" }).getAttribute("href"),
    ).toBe("/onboarding");
  });

  it("mostra a mensagem de erro da API ao carregar", async () => {
    mockFetch([{ url: "/api/profile", status: 500, body: { error: "Falha ao consultar o perfil." } }]);
    render(<Profile />);

    expect(await screen.findByText("Falha ao consultar o perfil.")).toBeTruthy();
  });

  it("salva o perfil com PATCH /api/profile e os valores convertidos", async () => {
    const fetchSpy = mockFetch([
      CARREGAR,
      {
        method: "PATCH",
        url: "/api/profile",
        body: { profile: { ...PERFIL, name: "Ana Souza", riskProfile: "arrojado", horizonMonths: 120, monthlyIncomeCents: 1_000_050 } },
      },
    ]);
    const user = userEvent.setup();
    render(<Profile />);

    const nome = await screen.findByLabelText("Nome");
    await user.clear(nome);
    await user.type(nome, "Ana Souza");
    await user.selectOptions(screen.getByLabelText("Perfil de risco"), "arrojado");
    const horizonte = screen.getByLabelText("Horizonte");
    await user.clear(horizonte);
    await user.type(horizonte, "120");
    const renda = screen.getByLabelText("Renda mensal");
    await user.clear(renda);
    await user.type(renda, "10.000,50");
    await user.click(screen.getAllByRole("button", { name: "Salvar perfil" })[0]);

    await waitFor(() => expect(chamadas(fetchSpy, "PATCH", "/api/profile")).toHaveLength(1));
    expect(chamadas(fetchSpy, "PATCH", "/api/profile")[0].body).toEqual({
      name: "Ana Souza",
      riskProfile: "arrojado",
      horizonMonths: 120,
      monthlyIncomeCents: 1_000_050,
    });
    expect(await screen.findByText("Perfil salvo com sucesso.")).toBeTruthy();
    expect(router.refresh).toHaveBeenCalled();
  });

  it("mostra o erro da API quando salvar falha", async () => {
    mockFetch([
      CARREGAR,
      { method: "PATCH", url: "/api/profile", status: 400, body: { error: "Dados inválidos para atualização do perfil." } },
    ]);
    const user = userEvent.setup();
    render(<Profile />);
    await screen.findByLabelText("Nome");

    await user.click(screen.getAllByRole("button", { name: "Salvar perfil" })[0]);

    const erro = await screen.findByText("Dados inválidos para atualização do perfil.");
    expect(erro.className).toContain("text-destructive");
  });

  it("não envia e avisa quando a renda é inválida", async () => {
    const fetchSpy = mockFetch([CARREGAR]);
    const user = userEvent.setup();
    render(<Profile />);

    const renda = await screen.findByLabelText("Renda mensal");
    await user.clear(renda);
    await user.type(renda, "-5");
    await user.click(screen.getAllByRole("button", { name: "Salvar perfil" })[0]);

    expect(await screen.findByText("Informe uma renda mensal válida ou deixe o campo em branco.")).toBeTruthy();
    expect(chamadas(fetchSpy, "PATCH", "/api/profile")).toHaveLength(0);
  });

  it("'Sair da conta' chama DELETE /api/session e volta ao login", async () => {
    const fetchSpy = mockFetch([CARREGAR, { method: "DELETE", url: "/api/session", body: { ok: true } }]);
    const user = userEvent.setup();
    render(<Profile />);
    await screen.findByLabelText("Nome");

    await user.click(screen.getByRole("button", { name: "Sair da conta" }));

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/login"));
    expect(chamadas(fetchSpy, "DELETE", "/api/session")).toHaveLength(1);
    expect(chamadas(fetchSpy, "PATCH", "/api/profile")).toHaveLength(0);
  });
});
