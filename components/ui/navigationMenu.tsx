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
        <ul className="flex h-[60dvh] flex-col gap-10">
          {navigationItems.map((item) => {
            const isCurrentPage = pathname === item.href;

            return (
              <li key={item.href}>
                <Button
                  render={<Link href={item.href} />}
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
      </nav>
    </aside>
  );
}
