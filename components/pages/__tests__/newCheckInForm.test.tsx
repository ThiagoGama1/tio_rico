// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

import { NewCheckInForm } from "@/components/pages/newCheckInForm";

const POSITION = {
  id: "asset-1",
  name: "Tesouro Selic",
  assetClass: "renda_fixa_pos" as const,
  amountCents: 0,
  indexer: null,
  indexerRate: null,
  liquidity: null,
};

beforeEach(() => vi.clearAllMocks());

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("NewCheckInForm", () => {
  it("'1.500' no valor e no aporte vai para a API como R$ 1.500,00 (#65)", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({}), { status: 201 }));
    const user = userEvent.setup();
    render(<NewCheckInForm initialPositions={[POSITION]} />);

    const amount = screen.getByLabelText("Valor atual");
    await user.clear(amount);
    await user.type(amount, "1.500");
    const contribution = screen.getByLabelText("Aporte do mês");
    await user.clear(contribution);
    await user.type(contribution, "1.500");
    await user.click(screen.getByRole("button", { name: /salvar check-in/i }));

    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    const body = JSON.parse(String(fetchSpy.mock.calls[0][1]?.body));
    expect(body.contributionCents).toBe(150_000);
    expect(body.positions[0].amountCents).toBe(150_000);
  });

  it("mostra o erro que a API devolve", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "Perfil de investidor não encontrado." }), { status: 404 }),
    );
    const user = userEvent.setup();
    render(<NewCheckInForm initialPositions={[POSITION]} />);

    await user.click(screen.getByRole("button", { name: /salvar check-in/i }));

    expect(await screen.findByText("Perfil de investidor não encontrado.")).toBeTruthy();
    expect(router.push).not.toHaveBeenCalled();
  });
});
