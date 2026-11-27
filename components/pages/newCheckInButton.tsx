"use client";

import { useRouter } from "next/navigation";

import {
  CheckInModal,
  type CheckInFormValues,
} from "@/components/ui/checkInModal";

type NewCheckInButtonProps = {
  className?: string;
  label?: string;
};

type ApiError = { error?: string };

export function NewCheckInButton({
  className,
  label = "Novo check-in",
}: NewCheckInButtonProps) {
  const router = useRouter();

  async function createCheckIn(values: CheckInFormValues) {
    const response = await fetch("/api/checkins", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    const payload = (await response.json().catch(() => ({}))) as ApiError;

    if (!response.ok) {
      throw new Error(payload.error ?? "Não foi possível criar o check-in.");
    }

    router.refresh();
  }

  return (
    <CheckInModal
      className={className}
      triggerLabel={label}
      onCreateCheckIn={createCheckIn}
    />
  );
}
