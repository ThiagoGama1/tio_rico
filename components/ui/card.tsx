import type { ReactNode } from "react";
import { cn } from "cn";

type CardProps = {
  children: ReactNode;
  className?: string;
};

function Card({ children, className }: CardProps) {
  return (
    <div
      className={cn("rounded-2xl border border-border bg-card p-10", className)}
    >
      {children}
    </div>
  );
}

export { Card };
