"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

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

export function NavigationMenu() {
  const pathname = usePathname();

  return (
    <aside className="sticky top-0 flex h-dvh w-72 shrink-0 flex-col bg-background px-10 py-18">
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
        <ul className="flex h-[60dvh] flex-col justify-between">
          {navigationItems.map((item) => {
            // Subrotas também destacam o item (ex.: /check-ins/new e /check-ins/[id] em "Check-ins", #60).
            const isCurrentPage =
              pathname === item.href || pathname.startsWith(`${item.href}/`);

            return (
              <li key={item.href}>
                <Button
                  render={<Link href={item.href} />}
                  nativeButton={false}
                  variant="ghost"
                  aria-current={isCurrentPage ? "page" : undefined}
                  className={cn(
                    "h-12 w-full justify-start px-2 text-left text-2xl font-medium text-muted font-k2d",
                    "hover:bg-transparent hover:text-foreground",
                    isCurrentPage && "text-foreground",
                  )}
                >
                  {item.label}
                </Button>
              </li>
            );
          })}
        </ul>
      </nav>
    </aside>
  );
}
