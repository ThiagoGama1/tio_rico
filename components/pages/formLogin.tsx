"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "../ui/button";
import { Input } from "../ui/input";

const CODE_LENGTH = 6;

type LoginStep = "email" | "code";

type ApiError = { error?: string };

async function requestJson(url: string, body: unknown) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = (await response.json().catch(() => ({}))) as ApiError;

  if (!response.ok) {
    throw new Error(payload.error ?? "Não foi possível concluir esta solicitação.");
  }
}

export function FormLogin() {
  const router = useRouter();
  const [step, setStep] = useState<LoginStep>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function sendCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    setIsSubmitting(true);

    try {
      const normalizedEmail = email.trim().toLowerCase();
      await requestJson("/api/session/email", { email: normalizedEmail });
      setEmail(normalizedEmail);
      setCode("");
      setStep("code");
      setMessage(`Enviamos um código de verificação para ${normalizedEmail}.`);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Não foi possível enviar o código.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function verifyCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      await requestJson("/api/session/email/verify", { email, code });
      const sessionResponse = await fetch("/api/session", { cache: "no-store" });
      const session = (await sessionResponse.json()) as {
        authenticated?: boolean;
        profileId?: string | null;
      };

      if (!sessionResponse.ok || !session.authenticated) {
        throw new Error("Não foi possível confirmar a sessão.");
      }

      router.push(session.profileId ? "/" : "/onboarding");
      router.refresh();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Não foi possível verificar o código.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="w-full max-w-md s px-4 grid gap-9 items-center">
      <h1 className="h1 text-center"> Acesso </h1>
      {step === "email" ? (
        <form className="grid gap-6" onSubmit={sendCode}>
          <Input
            placeholder="Email"
            type="email"
            name="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            disabled={isSubmitting}
            aria-invalid={Boolean(error)}
          />
          <div className="grid justify-items-center gap-3">
            <Button size="lg" type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Enviando..." : "Gerar código de acesso"}
            </Button>
            <p aria-live="polite" className="text-center text-sm text-red-600">
              {error}
            </p>
          </div>
        </form>
      ) : (
        <form className="grid justify-items-center gap-5" onSubmit={verifyCode}>
          <p aria-live="polite" className="text-center text-sm text-(--green-2)">
            {message}
          </p>
          <Input
            variant="square"
            placeholder="Código de verificação"
            name="code"
            size={CODE_LENGTH}
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            value={code}
            onValueChange={(value) => setCode(value.replace(/\D/g, ""))}
            disabled={isSubmitting}
            aria-invalid={Boolean(error)}
          />
          <Button
            size="lg"
            type="submit"
            disabled={isSubmitting || code.length !== CODE_LENGTH}
          >
            {isSubmitting ? "Verificando..." : "Enviar código"}
          </Button>
          <button
            className="font-k2d text-sm underline"
            type="button"
            onClick={() => {
              setStep("email");
              setCode("");
              setError("");
              setMessage("");
            }}
            disabled={isSubmitting}
          >
            Usar outro e-mail
          </button>
          <p aria-live="polite" className="text-center text-sm text-red-600">
            {error}
          </p>
        </form>
      )}
    </div>
  );
}
