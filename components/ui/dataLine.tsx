import type { ReactNode } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "cn";

import { Card } from "./card";

const dataLineVariants = cva("flex items-center justify-between gap-6", {
  variants: {
    variant: {
      default: "min-h-[3.75rem]",
      compact: "min-h-8",
    },
  },
  defaultVariants: {
    variant: "default",
  },
});

const cardVariants = cva("", {
  variants: {
    variant: {
      default: "p-8",
      compact: "rounded-lg p-4",
    },
  },
  defaultVariants: {
    variant: "default",
  },
});

type DataLineProps = VariantProps<typeof dataLineVariants> & {
  title: ReactNode;
  detail?: ReactNode;
  value: ReactNode;
  className?: string;
};

function DataLine({
  title,
  detail,
  value,
  variant,
  className,
}: DataLineProps) {
  const isCompact = variant === "compact";

  return (
    <Card className={cardVariants({ variant })}>
      <div className={cn(dataLineVariants({ variant }), className)}>
        <div className="min-w-0">
          <p
            className={cn(
              "font-k2d font-semibold leading-tight text-foreground",
              isCompact ? "text-base" : "text-3xl",
            )}
          >
            {title}
          </p>
          {detail ? (
            <p
              className={cn(
                "font-k2d leading-tight text-muted",
                isCompact ? "text-sm" : "mt-2 text-xl",
              )}
            >
              {detail}
            </p>
          ) : null}
        </div>
        <span
          className={cn(
            "shrink-0 font-k2d font-semibold leading-tight text-foreground",
            isCompact ? "text-base" : "text-3xl",
          )}
        >
          {value}
        </span>
      </div>
    </Card>
  );
}

export { DataLine };
