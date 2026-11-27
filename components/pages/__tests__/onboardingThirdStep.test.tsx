// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

import { OnboardingThirdStep } from "@/components/pages/onboardingThirdStep";
import { ONBOARDING_DRAFT_KEY } from "@/lib/onboarding/rascunho";

const VALID_DRAFT = {
  name: "Ana",
  email: "ana@example.com",
  riskProfile: "moderado",
  horizonMonths: 60,
  monthlyIncome: "1.500",
  goals: [{ title: "Reserva", targetAmountCents: 3_000_000, priority: "media" }],
};

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  sessionStorage.setItem(ONBOARDING_DRAFT_KEY, JSON.stringify(VALID_DRAFT));
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

async function fill(user: ReturnType<typeof userEvent.setup>, label: string, value: string) {
  const input = screen.getByLabelText(label);
  await user.clear(input);
  await user.type(input, value);
}

describe("OnboardingThirdStep", () => {
  it("total acima de 100% aparece em pt-BR, em vermelho e com aviso (#53/#54)", async () => {
    const user = userEvent.setup();
    render(<OnboardingThirdStep />);

    await fill(user, "Renda fixa pós-fixada", "33,3");
    await fill(user, "Renda fixa IPCA+", "33,3");
    await fill(user, "Ações (Brasil)", "33,4");
    await fill(user, "Fundos imobiliários", "0,2");

    const total = screen.getByText("100,2%");
    expect(total.className).toContain("text-destructive");
    expect(screen.getByText("Acima de 100%")).toBeTruthy();
  });

  it("percentual negativo fica marcado na hora e não entra no total (#53)", async () => {
    const user = userEvent.setup();
    render(<OnboardingThirdStep />);

    await fill(user, "Ações (Brasil)", "50");
    await fill(user, "Criptoativos", "-10");

    expect(screen.getByText("Não pode ser negativo")).toBeTruthy();
    expect(screen.getByLabelText("Criptoativos").getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByText("50%")).toBeTruthy();
  });

  it("concluir envia a renda '1.500' como 150000 centavos e vai para o overview (#65)", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(201, { profile: {} }));
    const user = userEvent.setup();
    render(<OnboardingThirdStep />);

    await fill(user, "Ações (Brasil)", "100");
    await user.click(screen.getByRole("button", { name: "Concluir configuração" }));

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/overview"));
    const [, init] = fetchSpy.mock.calls[0];
    const body = JSON.parse(String(init?.body));
    expect(body).toMatchObject({
      name: "Ana",
      monthlyIncomeCents: 150_000,
      targetAllocation: { acoes: 100 },
    });
    expect(sessionStorage.getItem(ONBOARDING_DRAFT_KEY)).toBeNull();
  });

  it("mostra a mensagem que a API devolve em { error: string } (#65)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse(400, { error: "Dados inválidos para criação do perfil." }),
    );
    const user = userEvent.setup();
    render(<OnboardingThirdStep />);

    await fill(user, "Ações (Brasil)", "100");
    await user.click(screen.getByRole("button", { name: "Concluir configuração" }));

    expect(await screen.findByText("Dados inválidos para criação do perfil.")).toBeTruthy();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("'Terminar depois' guarda os percentuais e sai sem gravar no banco (#65)", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const user = userEvent.setup();
    render(<OnboardingThirdStep />);

    await fill(user, "Ações (Brasil)", "40");
    await user.click(screen.getByRole("button", { name: "Terminar configuração depois" }));

    expect(router.push).toHaveBeenCalledWith("/overview");
    expect(fetchSpy).not.toHaveBeenCalled();
    const saved = JSON.parse(sessionStorage.getItem(ONBOARDING_DRAFT_KEY) ?? "{}");
    expect(saved.allocationForm.acoes).toBe("40");
  });

  it("restaura os percentuais digitados ao voltar para a etapa (#64)", async () => {
    sessionStorage.setItem(
      ONBOARDING_DRAFT_KEY,
      JSON.stringify({ ...VALID_DRAFT, allocationForm: { acoes: "60", fiis: "40" } }),
    );
    render(<OnboardingThirdStep />);

    expect(await screen.findByDisplayValue("60")).toBeTruthy();
    expect(screen.getByDisplayValue("40")).toBeTruthy();
    expect(screen.getByText("100%")).toBeTruthy();
  });
});
