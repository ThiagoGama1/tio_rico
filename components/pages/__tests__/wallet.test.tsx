// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => "/carteira",
}));

import { Wallet } from "@/components/pages/wallet";
import { ATIVOS, chamadas, mockFetch } from "@/lib/testing/telas";

const LISTA = { url: "/api/portfolio/assets", body: { assets: ATIVOS, totalCents: 1_020_000 } };

beforeEach(() => vi.clearAllMocks());
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Wallet (carteira)", () => {
  it("lista os investimentos com total, classes e maior exposição", async () => {
    mockFetch([LISTA]);
    render(<Wallet />);

    const lista = await screen.findByRole("list", { name: "Investimentos atuais" });
    expect(within(lista).getByText("Tesouro Selic 2029")).toBeTruthy();
    expect(within(lista).getByText("ETF Ibovespa")).toBeTruthy();
    const resumo = screen.getByRole("region", { name: "Resumo da carteira" });
    expect(within(resumo).getByText("R$ 10.200,00")).toBeTruthy();
    expect(within(resumo).getByText("2")).toBeTruthy();
    expect(within(resumo).getByText("71%")).toBeTruthy();
  });

  it("estado vazio: carteira sem investimentos", async () => {
    mockFetch([{ url: "/api/portfolio/assets", body: { assets: [], totalCents: 0 } }]);
    render(<Wallet />);

    expect(await screen.findByText("Sua carteira ainda está vazia.")).toBeTruthy();
  });

  it("mostra o erro da API ao carregar", async () => {
    mockFetch([
      {
        url: "/api/portfolio/assets",
        status: 404,
        body: { error: "Perfil de investidor não encontrado. Crie o perfil em POST /api/profile." },
      },
    ]);
    render(<Wallet />);

    expect(await screen.findByText(/Perfil de investidor não encontrado/)).toBeTruthy();
  });

  it("volta para o login quando a sessão expirou (401)", async () => {
    mockFetch([{ url: "/api/portfolio/assets", status: 401, body: { error: "Não autenticado." } }]);
    render(<Wallet />);

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/login"));
  });

  it("adiciona um investimento com POST e os dados convertidos", async () => {
    const novo = { ...ATIVOS[1], id: "ativo-3", name: "CDB 110% CDI", assetClass: "renda_fixa_pos" as const, amountCents: 150_050, indexer: "CDI", indexerRate: 110, liquidity: "Diária" };
    const fetchSpy = mockFetch([
      LISTA,
      { method: "POST", url: "/api/portfolio/assets", status: 201, body: { asset: novo } },
    ]);
    const user = userEvent.setup();
    render(<Wallet />);
    await screen.findByRole("list", { name: "Investimentos atuais" });

    await user.click(screen.getAllByRole("button", { name: "Adicionar investimento" })[0]);
    await user.type(await screen.findByLabelText("Nome do investimento"), "CDB 110% CDI");
    await user.type(screen.getByLabelText("Valor atual"), "1.500,50");
    await user.type(screen.getByLabelText("Indexador"), "CDI");
    await user.type(screen.getByLabelText("Taxa (% a.a.)"), "110");
    await user.type(screen.getByLabelText("Liquidez"), "Diária");
    const dialogo = screen.getByRole("dialog");
    await user.click(within(dialogo).getByRole("button", { name: "Adicionar investimento" }));

    await waitFor(() => expect(chamadas(fetchSpy, "POST", "/api/portfolio/assets")).toHaveLength(1));
    expect(chamadas(fetchSpy, "POST", "/api/portfolio/assets")[0].body).toEqual({
      name: "CDB 110% CDI",
      assetClass: "renda_fixa_pos",
      amountCents: 150_050,
      indexer: "CDI",
      indexerRate: 110,
      liquidity: "Diária",
    });
    expect(await screen.findByText("CDB 110% CDI")).toBeTruthy();
  });

  it("edita um investimento com PATCH na rota dele", async () => {
    const fetchSpy = mockFetch([
      LISTA,
      {
        method: "PATCH",
        url: "/api/portfolio/assets/ativo-2",
        body: { asset: { ...ATIVOS[1], amountCents: 350_000 } },
      },
    ]);
    const user = userEvent.setup();
    render(<Wallet />);
    await screen.findByRole("list", { name: "Investimentos atuais" });

    await user.click(screen.getByRole("button", { name: "Editar ETF Ibovespa" }));
    const valor = await screen.findByLabelText("Valor atual");
    await user.clear(valor);
    await user.type(valor, "3500");
    await user.click(screen.getByRole("button", { name: "Salvar alterações" }));

    await waitFor(() =>
      expect(chamadas(fetchSpy, "PATCH", "/api/portfolio/assets/ativo-2")).toHaveLength(1),
    );
    expect(chamadas(fetchSpy, "PATCH", "/api/portfolio/assets/ativo-2")[0].body).toMatchObject({
      name: "ETF Ibovespa",
      assetClass: "acoes",
      amountCents: 350_000,
    });
  });

  it("remove um investimento com DELETE e tira da lista", async () => {
    const fetchSpy = mockFetch([
      LISTA,
      { method: "DELETE", url: "/api/portfolio/assets/ativo-2", body: { ok: true, id: "ativo-2" } },
    ]);
    const user = userEvent.setup();
    render(<Wallet />);
    await screen.findByRole("list", { name: "Investimentos atuais" });

    await user.click(screen.getByRole("button", { name: "Remover ETF Ibovespa" }));

    await waitFor(() => expect(screen.queryByText("ETF Ibovespa")).toBeNull());
    expect(chamadas(fetchSpy, "DELETE", "/api/portfolio/assets/ativo-2")).toHaveLength(1);
  });

  it("mostra o erro da API quando a remoção falha e mantém o item", async () => {
    mockFetch([
      LISTA,
      {
        method: "DELETE",
        url: "/api/portfolio/assets/ativo-2",
        status: 500,
        body: { error: "Falha ao remover o investimento no banco de dados." },
      },
    ]);
    const user = userEvent.setup();
    render(<Wallet />);
    await screen.findByRole("list", { name: "Investimentos atuais" });

    await user.click(screen.getByRole("button", { name: "Remover ETF Ibovespa" }));

    expect(await screen.findByText("Falha ao remover o investimento no banco de dados.")).toBeTruthy();
    expect(screen.getByText("ETF Ibovespa")).toBeTruthy();
  });

  it("não envia nada e avisa quando o valor é inválido", async () => {
    const fetchSpy = mockFetch([LISTA]);
    const user = userEvent.setup();
    render(<Wallet />);
    await screen.findByRole("list", { name: "Investimentos atuais" });

    await user.click(screen.getAllByRole("button", { name: "Adicionar investimento" })[0]);
    await user.type(await screen.findByLabelText("Nome do investimento"), "Teste");
    await user.type(screen.getByLabelText("Valor atual"), "-10");
    const dialogo = screen.getByRole("dialog");
    await user.click(within(dialogo).getByRole("button", { name: "Adicionar investimento" }));

    expect(await screen.findByText("Informe um valor válido para o investimento.")).toBeTruthy();
    expect(chamadas(fetchSpy, "POST", "/api/portfolio/assets")).toHaveLength(0);
  });
});
