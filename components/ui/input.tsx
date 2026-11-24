import * as React from "react";
import { Input as InputPrimitive } from "@base-ui/react/input";
import { cn } from "cn";

function Input({
  className,
  type,
  placeholder,
  ...props
}: React.ComponentProps<"input">) {
  return (
    <div className="flex flex-col items-center grid-cols-1 m- 0">
      <h1 className="h4 h-6">{placeholder}</h1>
      <InputPrimitive
        type={type}
        data-slot="input"
        className={cn(
          "w-full min-w-0 px-2 py-1 text-sm font-k2d rounded-[3px] border border-(--green-1) bg-transparent transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground  focus-visible:border-(--green-1) focus-visible:ring-2 focus-visible:ring-(--green-1)/30 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
          className,
        )}
        {...props}
      ></InputPrimitive>
    </div>
  );
}

export { Input };
