"use client";

import Link from "next/link";
import { FormEvent, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { signInWithGoogle } from "@/app/login/actions";
import { Button } from "../ui/button";
import { Input } from "../ui/input";

const CODE_LENGTH = 6;

type LoginStep = "email" | "code";

type ApiError = { error?: string };

const subscribeNoop = () => () => {};

function getSearchSnapshot() {
  return typeof window === "undefined" ? "" : window.location.search;
}

function getServerSearchSnapshot() {
  return "";
}

function mapOAuthError(code: string): string {
  if (code === "AccessDenied") {
    return "Acesso com Google cancelado.";
  }
  return "Não foi possível entrar com o Google. Tente novamente ou use a conta de demonstração.";
}

function GoogleIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4 shrink-0">
      <path
        fill="#4285F4"
        d="M23.49 12.27c0-.79-.07-1.54-.2-2.27H12v4.3h6.45a5.52 5.52 0 0 1-2.39 3.62v3.01h3.87c2.26-2.08 3.56-5.15 3.56-8.66Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.07 7.93-2.91l-3.87-3.01c-1.07.72-2.44 1.15-4.06 1.15-3.12 0-5.77-2.11-6.72-4.96H1.28v3.11A12 12 0 0 0 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.28 14.27A7.2 7.2 0 0 1 4.9 12c0-.79.14-1.56.38-2.27V6.62H1.28A12 12 0 0 0 0 12c0 1.94.46 3.77 1.28 5.38l4-3.11Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.77c1.76 0 3.34.61 4.58 1.8l3.44-3.44C17.95 1.19 15.24 0 12 0A12 12 0 0 0 1.28 6.62l4 3.11c.95-2.85 3.6-4.96 6.72-4.96Z"
      />
    </svg>
  );
}

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

export function FormLogin({ googleEnabled = false }: { googleEnabled?: boolean }) {
  const router = useRouter();
  const [step, setStep] = useState<LoginStep>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [dismissedOauthError, setDismissedOauthError] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isEnteringDemo, setIsEnteringDemo] = useState(false);
  // The demo error shares the error line but is not about the e-mail field.
  const [demoFailed, setDemoFailed] = useState(false);

  const search = useSyncExternalStore(
    subscribeNoop,
    getSearchSnapshot,
    getServerSearchSnapshot,
  );
  const oauthErrorCode = new URLSearchParams(search).get("error");
  const oauthErrorMessage =
    !dismissedOauthError && oauthErrorCode ? mapOAuthError(oauthErrorCode) : "";
  const displayError = error || oauthErrorMessage;

  async function sendCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    setDemoFailed(false);
    setDismissedOauthError(true);
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

  async function enterDemo() {
    setError("");
    setMessage("");
    setDemoFailed(false);
    setDismissedOauthError(true);
    setIsEnteringDemo(true);

    try {
      await requestJson("/api/session/demo", {});
      router.push("/overview");
      router.refresh();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Não foi possível entrar na conta de demonstração.",
      );
      setDemoFailed(true);
      setIsEnteringDemo(false);
    }
  }

  async function verifyCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setDismissedOauthError(true);
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

      router.replace(session.profileId ? "/overview" : "/onboarding");
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
        <div className="grid gap-4">
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
              aria-invalid={Boolean(displayError) && !demoFailed && !oauthErrorMessage}
            />
            <div className="grid justify-items-center gap-3">
              <Button
                className="w-62"
                size="lg"
                type="submit"
                disabled={isSubmitting || isEnteringDemo}
              >
                {isSubmitting ? "Enviando..." : "Gerar código de acesso"}
              </Button>
              <Button
                size="lg"
                type="button"
                className="w-62"
                variant="secondary"
                onClick={enterDemo}
                disabled={isSubmitting || isEnteringDemo}
              >
                {isEnteringDemo ? "Entrando…" : "Entrar com conta de demonstração"}
              </Button>
              <p className="text-center font-k2d text-sm">
                Explore o Tio Rico com uma carteira de exemplo, sem cadastro.
              </p>
            </div>
          </form>
          {googleEnabled ? (
            <form action={signInWithGoogle} className="grid justify-items-center">
              <Button
                size="lg"
                type="submit"
                variant="outline"
                className="w-62 justify-center border border-(--green-1) font-k2d text-sm text-foreground"
                disabled={isSubmitting || isEnteringDemo}
              >
                <GoogleIcon />
                Continuar com Google
              </Button>
            </form>
          ) : null}
          <p aria-live="polite" className="text-center text-sm text-red-600">
            {displayError}
          </p>
          <p className="text-center font-k2d text-xs text-muted-foreground">
            Ao continuar, consulte nossa{" "}
            <Link
              href="/privacidade"
              className="underline underline-offset-4 hover:text-foreground"
            >
              Política de Privacidade
            </Link>
            .
          </p>
        </div>
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
            aria-invalid={Boolean(displayError)}
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
            {displayError}
          </p>
        </form>
      )}
    </div>
  );
}
