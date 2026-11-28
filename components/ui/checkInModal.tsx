"use client";

import { Dialog } from "@base-ui/react/dialog";
import { X } from "lucide-react";
import { FormEvent, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type CheckInFormValues = {
  referenceMonth: string;
  contributionCents: number;
  userNotes: string;
};

type CheckInModalProps = {
  onCreateCheckIn?: (
    values: CheckInFormValues,
  ) => void | Promise<void>;
  className?: string;
};

const MONTH_FORMATTER = new Intl.DateTimeFormat("pt-BR", {
  month: "long",
  year: "numeric",
});

function formatReferenceMonth(referenceMonth: string) {
  const [year, month] = referenceMonth.split("-").map(Number);

  return MONTH_FORMATTER.format(new Date(year, month - 1))
    .toLocaleUpperCase("pt-BR")
    .replace(" DE ", " / ");
}

function formatCurrency(cents: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(cents / 100);
}

function currentMonthValue() {
  const currentDate = new Date();
  return `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, "0")}`;
}

function getMonthOptions() {
  const currentDate = new Date();

  return Array.from({ length: 13 }, (_, index) => {
    const date = new Date(currentDate.getFullYear(), currentDate.getMonth() - 6 + index);
    const value = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

    return { value, label: formatReferenceMonth(value) };
  });
}

export function CheckInModal({
  onCreateCheckIn,
  className,
}: CheckInModalProps) {
  const monthOptions = useMemo(() => getMonthOptions(), []);
  const [open, setOpen] = useState(false);
  // A lista vai de 6 meses antes a 6 depois; o padrão é o mês atual, não o último da lista (#68).
  const [referenceMonth, setReferenceMonth] = useState(currentMonthValue);
  const [contributionCents, setContributionCents] = useState(250000);
  const [userNotes, setUserNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      await onCreateCheckIn?.({
        referenceMonth,
        contributionCents,
        userNotes: userNotes.trim(),
      });
      setOpen(false);
    } catch {
      setError("Não foi possível criar o check-in. Tente novamente.");
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleContributionChange(value: string) {
    const digits = value.replace(/\D/g, "");
    setContributionCents(digits ? Number(digits) : 0);
  }

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Button
        type="button"
        size="lg"
        className={cn("w-auto px-5", className)}
        onClick={() => setOpen(true)}
      >
        Adicionar check-in
      </Button>

      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-(--green-3)/30 backdrop-blur-[1px]" />
        <Dialog.Viewport className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto p-4 sm:p-9">
          <Dialog.Popup className="relative my-auto w-full max-w-[38rem] rounded-2xl border border-border bg-card px-6 py-9 shadow-[4px_4px_16px_rgba(0,0,0,0.08)] outline-none sm:px-9">
            <div className="flex items-start justify-between gap-6">
              <div>
                <p className="font-intel text-xs tracking-[0.1em] text-(--green-1) uppercase">
                  Check-in mensal
                </p>
                <Dialog.Title className="mt-2 font-k2d text-2xl font-semibold tracking-tight text-foreground sm:text-[1.65rem]">
                  Criar check-in
                </Dialog.Title>
                <Dialog.Description className="mt-2 font-k2d text-sm leading-relaxed text-muted sm:text-base">
                  Registre o aporte e atualize o acompanhamento da sua carteira.
                </Dialog.Description>
              </div>

              <Dialog.Close
                type="button"
                aria-label="Fechar modal"
                disabled={isSubmitting}
                className="mt-1 grid size-8 shrink-0 place-items-center rounded-sm text-foreground transition hover:bg-muted/15 focus-visible:ring-2 focus-visible:ring-(--green-1)/30 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
              >
                <X className="size-5" aria-hidden="true" />
              </Dialog.Close>
            </div>

            <form className="mt-8 grid gap-5" onSubmit={handleSubmit}>
              <label className="grid gap-2">
                <span className="font-intel text-xs tracking-[0.1em] text-muted uppercase">
                  Mês de referência
                </span>
                <select
                  name="referenceMonth"
                  value={referenceMonth}
                  onChange={(event) => setReferenceMonth(event.target.value)}
                  disabled={isSubmitting}
                  className="h-11 w-full rounded-md border border-(--green-1) bg-transparent px-4 font-k2d text-base text-foreground outline-none transition focus:ring-2 focus:ring-(--green-1)/20 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {monthOptions.map((month) => (
                    <option key={month.value} value={month.value}>
                      {month.label}
                    </option>
                  ))}
                </select>
                <span className="font-k2d text-sm text-muted">
                  O período que será registrado.
                </span>
              </label>

              <label className="grid gap-2">
                <span className="font-intel text-xs tracking-[0.1em] text-muted uppercase">
                  Aporte do mês
                </span>
                <input
                  name="contribution"
                  inputMode="numeric"
                  value={formatCurrency(contributionCents)}
                  onChange={(event) => handleContributionChange(event.target.value)}
                  disabled={isSubmitting}
                  className="h-11 w-full rounded-md border border-(--green-1) bg-transparent px-4 font-k2d text-base text-foreground outline-none transition focus:ring-2 focus:ring-(--green-1)/20 disabled:cursor-not-allowed disabled:opacity-50"
                  aria-describedby="contribution-hint"
                />
                <span id="contribution-hint" className="font-k2d text-sm text-muted">
                  Informe zero se não houve aporte.
                </span>
              </label>

              <label className="grid gap-2">
                <span className="font-intel text-xs tracking-[0.1em] text-muted uppercase">
                  Notas (opcional)
                </span>
                <textarea
                  name="userNotes"
                  value={userNotes}
                  onChange={(event) => setUserNotes(event.target.value)}
                  disabled={isSubmitting}
                  maxLength={4000}
                  placeholder="Algo que você quer registrar?"
                  className="min-h-24 w-full resize-y rounded-md border border-(--green-1) bg-transparent px-4 py-3 font-k2d text-base text-foreground outline-none transition placeholder:text-muted focus:ring-2 focus:ring-(--green-1)/20 disabled:cursor-not-allowed disabled:opacity-50"
                  aria-describedby="notes-hint"
                />
                <span id="notes-hint" className="font-k2d text-sm text-muted">
                  Opcional · até 4.000 caracteres
                </span>
              </label>

              <p className="rounded-md bg-background px-4 py-3 font-k2d text-sm leading-relaxed text-muted">
                A carteira atual será usada para calcular a aderência e a evolução.
              </p>

              {error ? (
                <p aria-live="polite" className="font-k2d text-sm text-destructive">
                  {error}
                </p>
              ) : null}

              <div className="mt-1 grid gap-3 sm:grid-cols-2">
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  className="w-full justify-center"
                  disabled={isSubmitting}
                  onClick={() => setOpen(false)}
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  size="lg"
                  className="w-full"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? "Criando..." : "Criar check-in"}
                </Button>
              </div>
            </form>
          </Dialog.Popup>
        </Dialog.Viewport>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export type { CheckInFormValues, CheckInModalProps };
