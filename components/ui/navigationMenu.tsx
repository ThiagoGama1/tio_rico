"use client";

import { Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

import { Button } from "./button";

const navigationItems = [
  { href: "/overview", label: "Visão geral" },
  { href: "/carteira", label: "Carteira" },
  { href: "/check-ins", label: "Check-ins" },
  { href: "/alocacao-alvo", label: "Alocação alvo" },
  { href: "/metas", label: "Metas" },
  { href: "/evolucao", label: "Evolução" },
  { href: "/perfil", label: "Perfil" },
] as const;

function NavigationItems({
  pathname,
  className,
  onNavigate,
}: {
  pathname: string;
  className: string;
  onNavigate?: () => void;
}) {
  return (
    <ul className={className}>
      {navigationItems.map((item) => {
        // Subrotas também destacam o item (ex.: /check-ins/new e /check-ins/[id] em "Check-ins", #60).
        const isCurrentPage =
          pathname === item.href || pathname.startsWith(`${item.href}/`);

        return (
          <li key={item.href}>
            <Button
              render={<Link href={item.href} onClick={onNavigate} />}
              nativeButton={false}
              variant="outline"
              aria-current={isCurrentPage ? "page" : undefined}
              className={cn(
                "justify-start px-2 w-36 text-left h1 font-medium text-[1rem]",
                isCurrentPage && "text-primary",
              )}
            >
              {item.label}
            </Button>
          </li>
        );
      })}
    </ul>
  );
}

export function NavigationMenu() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const mobileRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    function closeOnOutsideClick(event: PointerEvent) {
      if (!mobileRef.current?.contains(event.target as Node)) setIsOpen(false);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setIsOpen(false);
    }

    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [isOpen]);

  return (
    <>
      {/* Abaixo de lg: barra no topo com o sanduíche (#60). */}
      <div ref={mobileRef} className="sticky top-0 z-40 bg-background lg:hidden">
        <div className="flex h-16 items-center justify-between px-6">
          <Link
            href="/overview"
            className="font-k2d text-2xl leading-none font-bold tracking-tight text-(--green-2)"
          >
            TIO RICO
          </Link>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={isOpen ? "Fechar menu" : "Abrir menu"}
            aria-expanded={isOpen}
            aria-controls="menu-principal-celular"
            onClick={() => setIsOpen((open) => !open)}
          >
            {isOpen ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
          </Button>
        </div>
        {isOpen ? (
          <nav
            id="menu-principal-celular"
            aria-label="Navegação principal"
            className="absolute inset-x-0 top-full border-b border-border bg-background px-6 pt-2 pb-6"
          >
            <NavigationItems
              pathname={pathname}
              className="flex flex-col gap-4"
              onNavigate={() => setIsOpen(false)}
            />
          </nav>
        ) : null}
      </div>

      <aside className="sticky top-0 hidden h-dvh w-72 shrink-0 flex-col bg-background px-10 py-18 lg:flex">
        <Link
          href="/overview"
          className="font-k2d text-[2rem] leading-none font-bold tracking-tight text-(--green-2)"
        >
          TIO RICO
          <span className="mt-4 block font-intel text-xl font-normal tracking-[0.08em] text-muted">
            INVESTIMENTOS
          </span>
        </Link>

        <nav aria-label="Navegação principal" className="mt-22">
          <NavigationItems pathname={pathname} className="flex h-[60dvh] flex-col gap-10" />
        </nav>
      </aside>
    </>
  );
}
