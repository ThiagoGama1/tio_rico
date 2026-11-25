"use client";

import * as React from "react";
import { Input as InputPrimitive } from "@base-ui/react/input";
import { cva } from "class-variance-authority";
import { cn } from "cn";

const inputVariants = cva(
  "min-w-0 border border-(--green-1) font-k2d outline-none transition-colors file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground focus-visible:border-(--green-1) focus-visible:ring-2 focus-visible:ring-(--green-1)/30 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
  {
    variants: {
      variant: {
        default:
          "w-full rounded-[3px] bg-transparent px-2 py-1 text-sm md:text-sm",
        square: "size-[25px] rounded-[2px] bg-white p-0 text-center",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

type NativeInputProps = React.ComponentProps<"input">;

type SquareInputProps = Omit<NativeInputProps, "size"> & {
  variant: "square";
  size: number;
  onValueChange?: (value: string) => void;
};

type InputProps =
  | (NativeInputProps & {
      variant?: "default";
    })
  | SquareInputProps;

function toText(
  value: NativeInputProps["value"] | NativeInputProps["defaultValue"],
) {
  if (Array.isArray(value)) {
    return value.join("");
  }

  return value === undefined ? "" : String(value);
}

function SquareInput({
  className,
  defaultValue,
  id,
  name,
  onChange,
  onKeyDown,
  onPaste,
  onValueChange,
  placeholder,
  size,
  type,
  value,
  variant,
  ...props
}: SquareInputProps) {
  const inputRefs = React.useRef<Array<HTMLElement | null>>([]);
  const [uncontrolledValue, setUncontrolledValue] = React.useState(() =>
    toText(defaultValue),
  );
  const isControlled = value !== undefined;
  const currentValue = toText(isControlled ? value : uncontrolledValue).slice(
    0,
    size,
  );
  const characters = Array.from(
    { length: size },
    (_, index) => Array.from(currentValue)[index] ?? "",
  );

  const updateValue = (nextValue: string) => {
    if (!isControlled) {
      setUncontrolledValue(nextValue);
    }

    onValueChange?.(nextValue);
  };

  const focusInput = (index: number) => {
    inputRefs.current[index]?.focus();
  };

  return (
    <div className="flex w-fit flex-col items-start gap-[5px]">
      <h1 className="h-[18px] w-full font-k2d text-center text-sm font-medium leading-normal text-(--green-2)">
        {placeholder}
      </h1>
      <input type="hidden" name={name} value={currentValue} />
      <div className="flex gap-[5px]" data-slot="input-group">
        {characters.map((character, index) => (
          <InputPrimitive
            {...props}
            key={`${id ?? name ?? "square-input"}-${index}`}
            ref={(element) => {
              inputRefs.current[index] = element;
            }}
            id={id ? `${id}-${index + 1}` : undefined}
            type={type ?? "text"}
            value={character}
            maxLength={1}
            data-slot="input"
            aria-label={`${placeholder ?? "Character"} ${index + 1}`}
            className={cn(inputVariants({ variant, className }))}
            onChange={(event) => {
              onChange?.(event);

              const nextCharacters = [...characters];
              nextCharacters[index] =
                Array.from(event.target.value).at(-1) ?? "";
              updateValue(nextCharacters.join(""));

              if (nextCharacters[index] && index < size - 1) {
                focusInput(index + 1);
              }
            }}
            onKeyDown={(event) => {
              onKeyDown?.(event);

              if (event.defaultPrevented) {
                return;
              }

              if (
                event.key === "Backspace" &&
                !characters[index] &&
                index > 0
              ) {
                focusInput(index - 1);
              }

              if (event.key === "ArrowLeft" && index > 0) {
                event.preventDefault();
                focusInput(index - 1);
              }

              if (event.key === "ArrowRight" && index < size - 1) {
                event.preventDefault();
                focusInput(index + 1);
              }
            }}
            onPaste={(event) => {
              onPaste?.(event);

              if (event.defaultPrevented) {
                return;
              }

              const pastedCharacters = Array.from(
                event.clipboardData.getData("text"),
              ).slice(0, size - index);

              if (pastedCharacters.length === 0) {
                return;
              }

              event.preventDefault();

              const nextCharacters = [...characters];
              pastedCharacters.forEach((character, pastedIndex) => {
                nextCharacters[index + pastedIndex] = character;
              });
              updateValue(nextCharacters.join(""));
              focusInput(Math.min(index + pastedCharacters.length, size - 1));
            }}
          />
        ))}
      </div>
    </div>
  );
}

function Input(props: InputProps) {
  if (props.variant === "square") {
    return <SquareInput {...props} />;
  }

  const { className, placeholder, type, variant, ...inputProps } = props;

  return (
    <div className="flex flex-col items-center grid-cols-1 ">
      <h1 className="h4 h-6">{placeholder}</h1>
      <InputPrimitive
        type={type}
        data-slot="input"
        className={cn(inputVariants({ variant, className }))}
        {...inputProps}
      ></InputPrimitive>
    </div>
  );
}

export { Input };
