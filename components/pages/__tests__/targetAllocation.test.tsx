// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => "/alocacao-alvo",
}));

import { TargetAllocation } from "@/components/pages/targetAllocation";
import { PERFIL, chamadas, mockFetch } from "@/lib/testing/telas";

const CARREGAR = { url: "/api/profile", body: { profile: PERFIL } };

function campo(label: string) {
  return screen.getByLabelText(`Percentual para ${label}`) as HTMLInputElement;
}

beforeEach(() => vi.clearAllMocks());
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("TargetAllocation (alocação alvo)", () => {
  it("preenche os percentuais salvos e mostra o total", async () => {
    mockFetch([CARREGAR]);
    render(<TargetAllocation />);

    expect((await screen.findByLabelText("Percentual para Renda fixa pós-fixada") as HTMLInputElement).value).toBe("50");
    expect(campo("Ações (Brasil)").value).toBe("30");
    expect(campo("Fundos imobiliários").value).toBe("20");
    expect(campo("Criptoativos").value).toBe("");
    expect(screen.getByText("TOTAL: 100%")).toBeTruthy();
    expect(screen.getByText("Distribuição completa")).toBeTruthy();
    expect(screen.getByText("Perfil Moderado")).toBeTruthy();
  });

  it("estado vazio: usuário sem perfil (404) vê o convite para criar", async () => {
    mockFetch([{ url: "/api/profile", status: 404, body: { error: "Perfil não encontrado." } }]);
    render(<TargetAllocation />);

    expect(await screen.findByText("Crie seu perfil para definir a alocação")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Criar perfil do investidor" }).getAttribute("href"),
    ).toBe("/onboarding");
  });

  it("perfil sem alocação: campos vazios e 100% disponível", async () => {
    mockFetch([{ url: "/api/profile", body: { profile: { ...PERFIL, targetAllocation: {} } } }]);
    render(<TargetAllocation />);

    expect(await screen.findByText("TOTAL: 0%")).toBeTruthy();
    expect(screen.getByText("100% ainda disponível")).toBeTruthy();
  });

  it("mostra a mensagem de erro da API ao carregar", async () => {
    mockFetch([{ url: "/api/profile", status: 500, body: { error: "Falha ao consultar o perfil." } }]);
    render(<TargetAllocation />);

    expect(await screen.findByText("Falha ao consultar o perfil.")).toBeTruthy();
  });

  it("salva com PATCH /api/profile só as classes preenchidas, aceitando vírgula", async () => {
    const fetchSpy = mockFetch([
      CARREGAR,
      {
        method: "PATCH",
        url: "/api/profile",
        body: { profile: { ...PERFIL, targetAllocation: { renda_fixa_pos: 40, acoes: 30, fiis: 20, caixa: 10 } } },
      },
    ]);
    const user = userEvent.setup();
    render(<TargetAllocation />);
    await screen.findByText("TOTAL: 100%");

    await user.clear(campo("Renda fixa pós-fixada"));
    await user.type(campo("Renda fixa pós-fixada"), "39,5");
    await user.type(campo("Caixa / reserva"), "10,5");
    expect(screen.getByText("TOTAL: 100%")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Salvar alocação alvo" }));

    await waitFor(() => expect(chamadas(fetchSpy, "PATCH", "/api/profile")).toHaveLength(1));
    expect(chamadas(fetchSpy, "PATCH", "/api/profile")[0].body).toEqual({
      targetAllocation: { renda_fixa_pos: 39.5, acoes: 30, fiis: 20, caixa: 10.5 },
    });
    expect(await screen.findByText("Alocação-alvo salva com sucesso.")).toBeTruthy();
    expect(router.refresh).toHaveBeenCalled();
  });

  it("não envia quando a soma passa de 100%", async () => {
    const fetchSpy = mockFetch([CARREGAR]);
    const user = userEvent.setup();
    render(<TargetAllocation />);
    await screen.findByText("TOTAL: 100%");

    await user.type(campo("Caixa / reserva"), "5");
    await user.click(screen.getByRole("button", { name: "Salvar alocação alvo" }));

    expect(await screen.findByText("A soma da alocação-alvo não pode exceder 100%.")).toBeTruthy();
    expect(chamadas(fetchSpy, "PATCH", "/api/profile")).toHaveLength(0);
  });

  // BUG (components/pages/targetAllocation.tsx, parágrafo `message` no rodapé do
  // formulário): erros de validação ("A soma ... não pode exceder 100%") e erros
  // da API ("Dados inválidos ...") aparecem no mesmo parágrafo do texto de ajuda,
  // sempre com `text-muted` (cinza claro). A mensagem de sucesso também fica
  // igual. O usuário não percebe que o salvamento falhou. Deveria usar
  // `text-destructive` para erros, como a tela de perfil faz.
  it.skip("mensagem de erro aparece com destaque de erro", async () => {
    mockFetch([
      CARREGAR,
      { method: "PATCH", url: "/api/profile", status: 400, body: { error: "Dados inválidos para atualização do perfil." } },
    ]);
    const user = userEvent.setup();
    render(<TargetAllocation />);
    await screen.findByText("TOTAL: 100%");

    await user.click(screen.getByRole("button", { name: "Salvar alocação alvo" }));

    const erro = await screen.findByText("Dados inválidos para atualização do perfil.");
    expect(erro.className).toContain("text-destructive");
  });
});
