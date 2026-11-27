// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

import { OnboardingSecondStep } from "@/components/pages/onboardingSecondStep";
import { ONBOARDING_DRAFT_KEY } from "@/lib/onboarding/rascunho";

function draft() {
  return JSON.parse(sessionStorage.getItem(ONBOARDING_DRAFT_KEY) ?? "{}");
}

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  sessionStorage.setItem(ONBOARDING_DRAFT_KEY, JSON.stringify({ name: "Ana" }));
});

afterEach(cleanup);

describe("OnboardingSecondStep", () => {
  it("meta com valor e sem título: erro embaixo do campo, marcado e com foco (#50)", async () => {
    const user = userEvent.setup();
    render(<OnboardingSecondStep />);

    await user.type(screen.getByLabelText("Valor-alvo"), "30000");
    await user.click(screen.getByRole("button", { name: "Continuar para alocação" }));

    const title = screen.getByLabelText("Título");
    expect(screen.getByText("Informe um título para esta meta.")).toBeTruthy();
    expect(title.getAttribute("aria-invalid")).toBe("true");
    expect(document.activeElement).toBe(title);
    expect(router.push).not.toHaveBeenCalled();
  });

  it("o erro do título some assim que a pessoa edita (#50)", async () => {
    const user = userEvent.setup();
    render(<OnboardingSecondStep />);

    await user.type(screen.getByLabelText("Valor-alvo"), "30000");
    await user.click(screen.getByRole("button", { name: "Continuar para alocação" }));
    await user.type(screen.getByLabelText("Título"), "Reserva");

    expect(screen.queryByText("Informe um título para esta meta.")).toBeNull();
    expect(screen.getByLabelText("Título").getAttribute("aria-invalid")).toBeNull();
  });

  it("prazo no passado mostra erro e não avança (#52)", async () => {
    const user = userEvent.setup();
    render(<OnboardingSecondStep />);

    await user.type(screen.getByLabelText("Título"), "Viagem");
    fireEvent.change(screen.getByLabelText("Prazo"), { target: { value: "2020-01" } });
    await user.click(screen.getByRole("button", { name: "Continuar para alocação" }));

    expect(screen.getByText("O prazo não pode ser anterior ao mês atual.")).toBeTruthy();
    expect(router.push).not.toHaveBeenCalled();
  });

  it("o texto de ajuda do título é o mesmo em todas as metas (#51)", async () => {
    const user = userEvent.setup();
    render(<OnboardingSecondStep />);

    await user.click(screen.getByRole("button", { name: "Adicionar outra meta" }));

    expect(screen.getAllByText("Obrigatório quando a meta for preenchida")).toHaveLength(2);
    expect(screen.queryByText("Opcional", { selector: "[id$=-help][id^=goal-title]" })).toBeNull();
  });

  it("'30000' no valor-alvo é salvo como R$ 30.000,00 em centavos (#65)", async () => {
    const user = userEvent.setup();
    render(<OnboardingSecondStep />);

    await user.type(screen.getByLabelText("Título"), "Reserva");
    await user.type(screen.getByLabelText("Valor-alvo"), "30000");
    expect((screen.getByLabelText("Valor-alvo") as HTMLInputElement).value).toBe("30.000");
    await user.click(screen.getByRole("button", { name: "Continuar para alocação" }));

    expect(router.push).toHaveBeenCalledWith("/onboarding/alocacao");
    expect(draft().goals).toEqual([
      { title: "Reserva", targetAmountCents: 3_000_000, priority: "media" },
    ]);
  });

  it("'Terminar depois' guarda o rascunho e vai para o overview, sem chamar a API (#65)", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const user = userEvent.setup();
    render(<OnboardingSecondStep />);

    await user.type(screen.getByLabelText("Título"), "Reserva");
    await user.click(screen.getByRole("button", { name: "Terminar configuração depois" }));

    expect(router.push).toHaveBeenCalledWith("/overview");
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(draft()).toMatchObject({ name: "Ana", goals: [{ title: "Reserva" }] });
    fetchSpy.mockRestore();
  });

  it("'Voltar' guarda o que foi digitado mesmo incompleto e volta para a etapa 1 (#64)", async () => {
    const user = userEvent.setup();
    render(<OnboardingSecondStep />);

    await user.type(screen.getByLabelText("Valor-alvo"), "500");
    await user.click(screen.getByRole("button", { name: "Voltar" }));

    expect(router.push).toHaveBeenCalledWith("/onboarding");
    // clicar em Voltar tira o foco do valor, que é normalizado para 2 casas
    expect(draft().goalsForm[0]).toMatchObject({ title: "", targetAmount: "500,00" });
  });

  it("restaura as metas digitadas ao voltar para a etapa (#64)", async () => {
    sessionStorage.setItem(
      ONBOARDING_DRAFT_KEY,
      JSON.stringify({
        goalsForm: [
          { id: "goal-1", title: "Reserva", targetAmount: "30.000,00", targetDate: "", priority: "alta" },
          { id: "goal-4", title: "Viagem", targetAmount: "", targetDate: "", priority: "media" },
        ],
      }),
    );
    render(<OnboardingSecondStep />);

    expect(await screen.findByDisplayValue("Reserva")).toBeTruthy();
    expect(screen.getByDisplayValue("Viagem")).toBeTruthy();
    expect(screen.getByDisplayValue("30.000,00")).toBeTruthy();
  });
});
