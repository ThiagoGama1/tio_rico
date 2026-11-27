// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

import { OnboardingFirstStep } from "@/components/pages/onboardingFirstStep";
import { ONBOARDING_DRAFT_KEY } from "@/lib/onboarding/rascunho";

function draft() {
  return JSON.parse(sessionStorage.getItem(ONBOARDING_DRAFT_KEY) ?? "{}");
}

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
});

afterEach(cleanup);

describe("OnboardingFirstStep", () => {
  it("nome só com espaços mostra 'Informe seu nome', marca e foca o campo (#47)", async () => {
    const user = userEvent.setup();
    render(<OnboardingFirstStep email="ana@example.com" />);

    const name = screen.getByLabelText("Nome");
    await user.type(name, "   ");
    await user.click(screen.getByRole("button", { name: "Continuar para Metas" }));

    expect(screen.getByText("Informe seu nome")).toBeTruthy();
    expect(name.getAttribute("aria-invalid")).toBe("true");
    expect(document.activeElement).toBe(name);
    expect(router.push).not.toHaveBeenCalled();
  });

  it("renda: '1500' vira '1.500' ao digitar e '1.500,00' ao sair do campo (#37/#65)", async () => {
    const user = userEvent.setup();
    render(<OnboardingFirstStep email="ana@example.com" />);

    const income = screen.getByLabelText("Renda mensal") as HTMLInputElement;
    await user.type(income, "1500");
    expect(income.value).toBe("1.500");

    await user.tab();
    expect(income.value).toBe("1.500,00");
  });

  it("letras e sinais somem da renda enquanto digita", async () => {
    const user = userEvent.setup();
    render(<OnboardingFirstStep email="ana@example.com" />);

    const income = screen.getByLabelText("Renda mensal") as HTMLInputElement;
    await user.type(income, "abc-500");
    expect(income.value).toBe("500");
  });

  it("com dados válidos grava o rascunho e vai para as metas", async () => {
    const user = userEvent.setup();
    render(<OnboardingFirstStep email="ana@example.com" />);

    await user.type(screen.getByLabelText("Nome"), "  Ana  ");
    await user.type(screen.getByLabelText("Renda mensal"), "1500");
    await user.click(screen.getByRole("button", { name: "Continuar para Metas" }));

    expect(router.push).toHaveBeenCalledWith("/onboarding/metas");
    expect(draft()).toMatchObject({
      name: "Ana",
      email: "ana@example.com",
      riskProfile: "moderado",
      horizonMonths: 60,
      // clicar no botão tira o foco da renda, que é normalizada para 2 casas
      monthlyIncome: "1.500,00",
    });
  });

  it("restaura o rascunho ao voltar para a etapa (#64)", async () => {
    sessionStorage.setItem(
      ONBOARDING_DRAFT_KEY,
      JSON.stringify({ name: "Ana", riskProfile: "arrojado", horizonMonths: 120, monthlyIncome: "2.000,00" }),
    );
    render(<OnboardingFirstStep email="ana@example.com" />);

    expect(await screen.findByDisplayValue("Ana")).toBeTruthy();
    expect((screen.getByLabelText("Horizonte de investimento") as HTMLInputElement).value).toBe("120");
    expect((screen.getByLabelText("Renda mensal") as HTMLInputElement).value).toBe("2.000,00");
    expect((screen.getByDisplayValue("arrojado") as HTMLInputElement).checked).toBe(true);
  });

  it("os rótulos estão ligados aos campos (#48)", () => {
    render(<OnboardingFirstStep email="ana@example.com" />);

    expect(screen.getByLabelText("Nome").tagName).toBe("INPUT");
    expect(screen.getByLabelText("Horizonte de investimento").tagName).toBe("INPUT");
    expect(screen.getByLabelText("Renda mensal").tagName).toBe("INPUT");
  });
});
