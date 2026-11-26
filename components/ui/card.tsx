import type { ReactNode } from "react";

type CardProps = {
  children: ReactNode;
};

function Card({ children }: CardProps) {
  return (
    <div className="rounded-2xl border border-border bg-card p-10">
      {children}
    </div>
  );
}

export { Card };
