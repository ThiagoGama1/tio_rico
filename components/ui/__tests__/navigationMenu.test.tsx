// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const nav = vi.hoisted(() => ({ pathname: "/metas" }));
vi.mock("next/navigation", () => ({ usePathname: () => nav.pathname }));

import { NavigationMenu } from "@/components/ui/navigationMenu";

const ITENS = ["Visão geral", "Carteira", "Check-ins", "Alocação alvo", "Metas", "Evolução", "Perfil"];

function sanduiche() {
  return screen.getByRole("button", { name: /menu$/ });
}

beforeEach(() => {
  nav.pathname = "/metas";
});
afterEach(() => cleanup());

describe("NavigationMenu", () => {
  it("desktop: menu lateral só a partir de lg; barra do sanduíche some em lg", () => {
    const { container } = render(<NavigationMenu />);

    const lateral = container.querySelector("aside")!;
    expect(lateral.className).toContain("hidden");
    expect(lateral.className).toContain("lg:flex");
    expect(lateral.className).toContain("w-72");
    const links = within(lateral).getAllByRole("button").map((b) => b.textContent);
    expect(links).toEqual(ITENS);

    expect(sanduiche().closest(".lg\\:hidden")).toBeTruthy();
  });

  it("celular: o sanduíche abre e fecha o menu, com aria-label e aria-expanded", async () => {
    const user = userEvent.setup();
    render(<NavigationMenu />);

    expect(sanduiche().getAttribute("aria-label")).toBe("Abrir menu");
    expect(sanduiche().getAttribute("aria-expanded")).toBe("false");
    expect(document.getElementById("menu-principal-celular")).toBeNull();

    await user.click(sanduiche());
    expect(sanduiche().getAttribute("aria-label")).toBe("Fechar menu");
    expect(sanduiche().getAttribute("aria-expanded")).toBe("true");
    const menu = document.getElementById("menu-principal-celular")!;
    expect(within(menu).getAllByRole("button").map((b) => b.textContent)).toEqual(ITENS);

    await user.click(sanduiche());
    expect(document.getElementById("menu-principal-celular")).toBeNull();
    expect(sanduiche().getAttribute("aria-label")).toBe("Abrir menu");
  });

  it("fecha com Esc, clique fora e clique num item", async () => {
    const user = userEvent.setup();
    render(
      <div>
        <NavigationMenu />
        <p>conteúdo da página</p>
      </div>,
    );

    await user.click(sanduiche());
    await user.keyboard("{Escape}");
    expect(document.getElementById("menu-principal-celular")).toBeNull();

    await user.click(sanduiche());
    fireEvent.pointerDown(screen.getByText("conteúdo da página"));
    expect(document.getElementById("menu-principal-celular")).toBeNull();

    await user.click(sanduiche());
    const menu = document.getElementById("menu-principal-celular")!;
    const carteira = within(menu).getByRole("button", { name: "Carteira" });
    carteira.addEventListener("click", (e) => e.preventDefault());
    await user.click(carteira);
    expect(document.getElementById("menu-principal-celular")).toBeNull();
  });

  it("item da página atual fica destacado nos dois menus, inclusive em subrotas", async () => {
    nav.pathname = "/check-ins/new";
    const user = userEvent.setup();
    const { container } = render(<NavigationMenu />);

    const atualLateral = within(container.querySelector("aside")!).getByRole("button", { name: "Check-ins" });
    expect(atualLateral.getAttribute("aria-current")).toBe("page");
    expect(atualLateral.className).toContain("text-primary");

    await user.click(sanduiche());
    const menu = document.getElementById("menu-principal-celular")!;
    const atual = within(menu).getByRole("button", { name: "Check-ins" });
    expect(atual.getAttribute("aria-current")).toBe("page");
    expect(atual.className).toContain("text-primary");
    expect(within(menu).getByRole("button", { name: "Metas" }).getAttribute("aria-current")).toBeNull();
  });
});
