// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

import { NewCheckInForm } from "@/components/pages/newCheckInForm";

const POSITION = {
  id: "asset-1",
  name: "Tesouro Selic",
  assetClass: "renda_fixa_pos" as const,
  amountCents: 100_000,
  indexer: null,
  indexerRate: null,
  liquidity: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-15T12:00:00-03:00"));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function campoMes() {
  return document.getElementById("reference-month") as HTMLInputElement;
}

describe("NewCheckInForm: mês de referência", () => {
  it("começa no mês atual e não deixa escolher mês depois dele (max)", () => {
    render(<NewCheckInForm initialPositions={[POSITION]} />);

    expect(screen.getByText("Mês de referência").getAttribute("for")).toBe("reference-month");
    expect(campoMes().value).toBe("2026-11");
    expect(campoMes().max).toBe("2026-11");
  });

  it("não envia e mostra a mensagem quando o mês é futuro", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    render(<NewCheckInForm initialPositions={[POSITION]} />);

    fireEvent.change(campoMes(), { target: { value: "2026-12" } });
    // o navegador também barraria pelo max; o submit direto testa a validação da tela
    fireEvent.submit(campoMes().form!);

    expect(
      await screen.findByText("O mês de referência não pode ser depois do mês atual."),
    ).toBeTruthy();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("mês anterior continua sendo enviado normalmente", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({}), { status: 201 }));
    render(<NewCheckInForm initialPositions={[POSITION]} />);

    fireEvent.change(campoMes(), { target: { value: "2026-10" } });
    fireEvent.submit(campoMes().form!);

    await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
    const body = JSON.parse(String(fetchSpy.mock.calls[0][1]?.body));
    expect(body.referenceMonth).toBe("2026-10");
  });
});
