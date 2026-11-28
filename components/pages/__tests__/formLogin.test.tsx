// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

import { FormLogin } from "@/components/pages/formLogin";
import { chamadas, mockFetch } from "@/lib/testing/telas";

beforeEach(() => vi.clearAllMocks());
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function campoEmail() {
  return screen.getByRole("textbox");
}

async function digitarCodigo(user: ReturnType<typeof userEvent.setup>, codigo: string) {
  await user.click(screen.getByLabelText("Código de verificação 1"));
  await user.keyboard(codigo);
}

describe("FormLogin — código por e-mail", () => {
  it("renderiza o formulário de e-mail com os dois botões", () => {
    render(<FormLogin />);

    expect(screen.getByRole("heading", { name: /acesso/i })).toBeTruthy();
    expect(campoEmail()).toBeTruthy();
    expect(screen.getByRole("button", { name: "Gerar código de acesso" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Entrar com conta de demonstração" })).toBeTruthy();
  });

  it("pede o código com o e-mail normalizado e passa para a etapa do código", async () => {
    const fetchSpy = mockFetch([{ method: "POST", url: "/api/session/email", body: { ok: true } }]);
    const user = userEvent.setup();
    render(<FormLogin />);

    await user.type(campoEmail(), "  Ana@Example.com ");
    await user.click(screen.getByRole("button", { name: "Gerar código de acesso" }));

    expect(await screen.findByText("Enviamos um código de verificação para ana@example.com.")).toBeTruthy();
    expect(chamadas(fetchSpy, "POST", "/api/session/email")[0].body).toEqual({
      email: "ana@example.com",
    });
  });

  it("mostra o erro da API e marca o campo de e-mail como inválido", async () => {
    mockFetch([
      {
        method: "POST",
        url: "/api/session/email",
        status: 429,
        body: { error: "Aguarde 1 minuto antes de pedir outro código para este e-mail." },
      },
    ]);
    const user = userEvent.setup();
    render(<FormLogin />);

    await user.type(campoEmail(), "ana@example.com");
    await user.click(screen.getByRole("button", { name: "Gerar código de acesso" }));

    expect(await screen.findByText(/Aguarde 1 minuto/)).toBeTruthy();
    expect(campoEmail().getAttribute("aria-invalid")).toBe("true");
  });

  it("valida o código e manda quem já tem perfil para a visão geral", async () => {
    const fetchSpy = mockFetch([
      { method: "POST", url: "/api/session/email", body: { ok: true } },
      { method: "POST", url: "/api/session/email/verify", body: { ok: true } },
      { url: "/api/session", body: { authenticated: true, profileId: "perfil-1" } },
    ]);
    const user = userEvent.setup();
    render(<FormLogin />);

    await user.type(campoEmail(), "ana@example.com");
    await user.click(screen.getByRole("button", { name: "Gerar código de acesso" }));
    await screen.findByText(/Enviamos um código/);
    await digitarCodigo(user, "123456");
    await user.click(screen.getByRole("button", { name: "Enviar código" }));

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/overview"));
    expect(chamadas(fetchSpy, "POST", "/api/session/email/verify")[0].body).toEqual({
      email: "ana@example.com",
      code: "123456",
    });
  });

  it("manda para o onboarding quem ainda não tem perfil", async () => {
    mockFetch([
      { method: "POST", url: "/api/session/email", body: { ok: true } },
      { method: "POST", url: "/api/session/email/verify", body: { ok: true } },
      { url: "/api/session", body: { authenticated: true, profileId: null } },
    ]);
    const user = userEvent.setup();
    render(<FormLogin />);

    await user.type(campoEmail(), "ana@example.com");
    await user.click(screen.getByRole("button", { name: "Gerar código de acesso" }));
    await screen.findByText(/Enviamos um código/);
    await digitarCodigo(user, "123456");
    await user.click(screen.getByRole("button", { name: "Enviar código" }));

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/onboarding"));
  });

  it("mostra o erro de código inválido e não navega", async () => {
    mockFetch([
      { method: "POST", url: "/api/session/email", body: { ok: true } },
      {
        method: "POST",
        url: "/api/session/email/verify",
        status: 400,
        body: { error: "Código inválido ou expirado. Solicite um novo código." },
      },
    ]);
    const user = userEvent.setup();
    render(<FormLogin />);

    await user.type(campoEmail(), "ana@example.com");
    await user.click(screen.getByRole("button", { name: "Gerar código de acesso" }));
    await screen.findByText(/Enviamos um código/);
    await digitarCodigo(user, "000000");
    await user.click(screen.getByRole("button", { name: "Enviar código" }));

    expect(await screen.findByText(/Código inválido ou expirado/)).toBeTruthy();
    expect(router.replace).not.toHaveBeenCalled();
  });
});

describe("FormLogin — conta de demonstração", () => {
  it("chama POST /api/session/demo, mostra 'Entrando…' e vai para /overview", async () => {
    let liberar: (r: Response) => void = () => {};
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(() => new Promise<Response>((resolve) => (liberar = resolve)));
    const user = userEvent.setup();
    render(<FormLogin />);

    await user.click(screen.getByRole("button", { name: "Entrar com conta de demonstração" }));

    const botao = await screen.findByRole("button", { name: "Entrando…" });
    expect(botao.hasAttribute("disabled")).toBe(true);
    expect(
      screen.getByRole("button", { name: "Gerar código de acesso" }).hasAttribute("disabled"),
    ).toBe(true);
    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/session/demo",
      expect.objectContaining({ method: "POST" }),
    );

    liberar(new Response(JSON.stringify({ authenticated: true, demo: true }), { status: 200 }));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/overview"));
  });

  it("mostra o erro da demo sem marcar o campo de e-mail", async () => {
    mockFetch([
      {
        method: "POST",
        url: "/api/session/demo",
        status: 429,
        body: { error: "Muitas contas de demonstração criadas a partir desta rede. Tente novamente mais tarde." },
      },
    ]);
    const user = userEvent.setup();
    render(<FormLogin />);

    await user.click(screen.getByRole("button", { name: "Entrar com conta de demonstração" }));

    expect(await screen.findByText(/Muitas contas de demonstração/)).toBeTruthy();
    expect(campoEmail().getAttribute("aria-invalid")).toBe("false");
    expect(screen.getByRole("button", { name: "Entrar com conta de demonstração" })).toBeTruthy();
    expect(router.push).not.toHaveBeenCalled();
  });
});
