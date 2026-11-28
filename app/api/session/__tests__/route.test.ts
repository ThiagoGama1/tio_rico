import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionUser } from "@/lib/auth/session";

const mocks = vi.hoisted(() => ({
  getSessionUser: vi.fn<() => Promise<SessionUser | null>>(),
  isDatabaseConfigured: vi.fn<() => boolean>(),
  getProfileIdForUser: vi.fn<(userId: string) => Promise<string | null>>(),
  ensureDemoUser: vi.fn(),
  signIn: vi.fn(),
  signOut: vi.fn(),
  sendEmailLoginCode: vi.fn<(email: string) => Promise<void>>(),
  consumirLimite: vi.fn(),
  limiteEsgotado: vi.fn(),
}));

vi.mock("@/lib/security/rate-limit", () => ({
  consumirLimite: mocks.consumirLimite,
  limiteEsgotado: mocks.limiteEsgotado,
  ipDaRequisicao: (headers: Headers) =>
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "desconhecido",
}));

function limite(permitido: boolean) {
  return { permitido, restante: permitido ? 1 : 0, reiniciaEm: new Date() };
}

vi.mock("@/lib/auth", () => ({
  DEMO_PROVIDER_ID: "demo",
  EMAIL_CODE_PROVIDER_ID: "email-code",
  signIn: mocks.signIn,
  signOut: mocks.signOut,
}));

vi.mock("@/lib/auth/email-code", () => ({
  sendEmailLoginCode: mocks.sendEmailLoginCode,
  chaveFalhasCodigo: (email: string) => `login-falha:${email}`,
  MAX_FALHAS_CODIGO: 5,
}));

vi.mock("@/lib/auth/session", () => ({
  getSessionUser: mocks.getSessionUser,
}));

vi.mock("@/lib/auth/demo", () => ({
  ensureDemoUser: mocks.ensureDemoUser,
}));

vi.mock("@/lib/db/prisma", () => ({
  isDatabaseConfigured: mocks.isDatabaseConfigured,
}));

vi.mock("@/lib/profile/repository", () => ({
  getProfileIdForUser: mocks.getProfileIdForUser,
}));

import { DELETE, GET } from "@/app/api/session/route";
import { POST as POST_DEMO } from "@/app/api/session/demo/route";
import { POST as POST_EMAIL } from "@/app/api/session/email/route";
import { POST as POST_VERIFY_EMAIL } from "@/app/api/session/email/verify/route";

const USER: SessionUser = { id: "user-1", email: "ana@example.com", name: "Ana" };

function makeJsonPostRequest(url: string, body: unknown): NextRequest {
  return new NextRequest(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.isDatabaseConfigured.mockReturnValue(true);
  mocks.consumirLimite.mockResolvedValue(limite(true));
  mocks.limiteEsgotado.mockResolvedValue(false);
});

describe("rate limits on e-mail login", () => {
  const originalResendKey = process.env.AUTH_RESEND_KEY;
  beforeEach(() => {
    process.env.AUTH_RESEND_KEY = "re_test";
  });
  afterEach(() => {
    process.env.AUTH_RESEND_KEY = originalResendKey;
  });

  it("limits code requests per IP and per e-mail", async () => {
    const request = new NextRequest("http://localhost:3000/api/session/email", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-forwarded-for": "9.9.9.9, 10.0.0.1" },
      body: JSON.stringify({ email: "Ana@Example.com" }),
    });

    const response = await POST_EMAIL(request);

    expect(response.status).toBe(200);
    expect(mocks.consumirLimite).toHaveBeenCalledWith(
      "envio-ip:9.9.9.9",
      expect.any(Number),
      expect.any(Number),
    );
    expect(mocks.consumirLimite).toHaveBeenCalledWith(
      "envio-email:ana@example.com",
      1,
      60_000,
    );
  });

  it("returns 429 and sends nothing when the IP is over the limit", async () => {
    mocks.consumirLimite.mockResolvedValueOnce(limite(false));

    const response = await POST_EMAIL(
      makeJsonPostRequest("http://localhost:3000/api/session/email", {
        email: "ana@example.com",
      }),
    );

    expect(response.status).toBe(429);
    expect(mocks.sendEmailLoginCode).not.toHaveBeenCalled();
  });

  it("returns 429 when a code was requested for the same e-mail less than a minute ago", async () => {
    mocks.consumirLimite
      .mockResolvedValueOnce(limite(true))
      .mockResolvedValueOnce(limite(false));

    const response = await POST_EMAIL(
      makeJsonPostRequest("http://localhost:3000/api/session/email", {
        email: "ana@example.com",
      }),
    );
    const json = await response.json();

    expect(response.status).toBe(429);
    expect(json.error).toContain("1 minuto");
    expect(mocks.sendEmailLoginCode).not.toHaveBeenCalled();
  });

  it("returns 429 on verify while the e-mail is locked by wrong codes", async () => {
    mocks.limiteEsgotado.mockResolvedValue(true);

    const response = await POST_VERIFY_EMAIL(
      makeJsonPostRequest("http://localhost:3000/api/session/email/verify", {
        email: "ana@example.com",
        code: "123456",
      }),
    );

    expect(response.status).toBe(429);
    expect(mocks.limiteEsgotado).toHaveBeenCalledWith("login-falha:ana@example.com", 5);
    expect(mocks.signIn).not.toHaveBeenCalled();
  });
});

describe("GET /api/session", () => {
  it("returns 200 with authenticated: false when logged out", async () => {
    mocks.getSessionUser.mockResolvedValue(null);

    const response = await GET();
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({ authenticated: false, user: null, profileId: null });
  });

  it("returns the session user and their profileId", async () => {
    mocks.getSessionUser.mockResolvedValue(USER);
    mocks.getProfileIdForUser.mockResolvedValue("profile-1");

    const response = await GET();
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(json).toEqual({ authenticated: true, user: USER, profileId: "profile-1" });
  });

  it("returns profileId null for a new user without profile", async () => {
    mocks.getSessionUser.mockResolvedValue(USER);
    mocks.getProfileIdForUser.mockResolvedValue(null);

    const response = await GET();
    const json = await response.json();

    expect(json.profileId).toBeNull();
  });
});

describe("DELETE /api/session", () => {
  it("signs out without redirect", async () => {
    mocks.signOut.mockResolvedValue(undefined);

    const response = await DELETE();

    expect(response.status).toBe(200);
    expect(mocks.signOut).toHaveBeenCalledWith({ redirect: false });
  });
});

describe("POST /api/session/email", () => {
  const URL = "http://localhost:3000/api/session/email";
  const originalKey = process.env.AUTH_RESEND_KEY;

  beforeEach(() => {
    process.env.AUTH_RESEND_KEY = "re_test";
    mocks.sendEmailLoginCode.mockResolvedValue(undefined);
  });

  afterEach(() => {
    process.env.AUTH_RESEND_KEY = originalKey;
  });

  it("returns 400 on malformed JSON", async () => {
    const response = await POST_EMAIL(makeJsonPostRequest(URL, "{"));

    expect(response.status).toBe(400);
  });

  it("returns 400 on invalid e-mail", async () => {
    const response = await POST_EMAIL(makeJsonPostRequest(URL, { email: "nao-e-email" }));
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.details.fieldErrors.email).toBeDefined();
    expect(mocks.signIn).not.toHaveBeenCalled();
  });

  it("rejects absolute callbackUrl (open redirect)", async () => {
    const response = await POST_EMAIL(
      makeJsonPostRequest(URL, {
        email: "ana@example.com",
        callbackUrl: "https://evil.example.com",
      }),
    );

    expect(response.status).toBe(400);
  });

  it("rejects protocol-relative callbackUrl", async () => {
    const response = await POST_EMAIL(
      makeJsonPostRequest(URL, { email: "ana@example.com", callbackUrl: "//evil.com" }),
    );

    expect(response.status).toBe(400);
  });

  it("returns 503 when Resend is not configured", async () => {
    process.env.AUTH_RESEND_KEY = "";

    const response = await POST_EMAIL(makeJsonPostRequest(URL, { email: "ana@example.com" }));
    const json = await response.json();

    expect(response.status).toBe(503);
    expect(json.error).toContain("AUTH_RESEND_KEY");
  });

  it("sends a verification code to the normalized e-mail", async () => {
    const response = await POST_EMAIL(
      makeJsonPostRequest(URL, { email: "  Ana@Example.com ", callbackUrl: "/carteira" }),
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(mocks.sendEmailLoginCode).toHaveBeenCalledWith("ana@example.com");
  });

  it("returns 502 when the e-mail provider rejects the request", async () => {
    mocks.sendEmailLoginCode.mockRejectedValue(new Error("Resend down"));

    const response = await POST_EMAIL(makeJsonPostRequest(URL, { email: "ana@example.com" }));

    expect(response.status).toBe(502);
  });
});

describe("POST /api/session/email/verify", () => {
  const URL = "http://localhost:3000/api/session/email/verify";

  beforeEach(() => {
    mocks.signIn.mockResolvedValue("http://localhost:3000/");
  });

  it("rejects malformed verification codes", async () => {
    const response = await POST_VERIFY_EMAIL(
      makeJsonPostRequest(URL, { email: "ana@example.com", code: "123" }),
    );

    expect(response.status).toBe(400);
    expect(mocks.signIn).not.toHaveBeenCalled();
  });

  it("creates the Auth.js session after a valid code", async () => {
    const response = await POST_VERIFY_EMAIL(
      makeJsonPostRequest(URL, { email: " Ana@Example.com ", code: "123456" }),
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({ ok: true });
    expect(mocks.signIn).toHaveBeenCalledWith("email-code", {
      email: "ana@example.com",
      code: "123456",
      redirect: false,
      redirectTo: "/",
    });
  });

  it("returns a generic error for an invalid or expired code", async () => {
    mocks.signIn.mockResolvedValue(
      "http://localhost:3000/login?error=CredentialsSignin",
    );

    const response = await POST_VERIFY_EMAIL(
      makeJsonPostRequest(URL, { email: "ana@example.com", code: "123456" }),
    );

    expect(response.status).toBe(400);
  });
});

describe("POST /api/session/demo", () => {
  const DEMO_USER = {
    id: "user-demo",
    email: "marina.costa@demo.tiorico.app",
    name: "Marina Costa (demonstração)",
  };

  it("returns 503 when database is not configured", async () => {
    mocks.isDatabaseConfigured.mockReturnValue(false);

    const response = await POST_DEMO();

    expect(response.status).toBe(503);
    expect(mocks.signIn).not.toHaveBeenCalled();
  });

  it("returns 503 when the seed has not been run", async () => {
    mocks.ensureDemoUser.mockResolvedValue(null);

    const response = await POST_DEMO();
    const json = await response.json();

    expect(response.status).toBe(503);
    expect(json.error).toContain("db:seed");
    expect(mocks.signIn).not.toHaveBeenCalled();
  });

  it("signs in with the demo provider and returns the demo profile", async () => {
    mocks.ensureDemoUser.mockResolvedValue(DEMO_USER);
    mocks.signIn.mockResolvedValue("http://localhost:3000/");

    const response = await POST_DEMO();
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({
      authenticated: true,
      user: DEMO_USER,
      profileId: "demo-marina-costa",
    });
    expect(mocks.signIn).toHaveBeenCalledWith("demo", {
      redirect: false,
      redirectTo: "/",
    });
  });

  it("returns 500 when Auth.js rejects the demo sign-in", async () => {
    mocks.ensureDemoUser.mockResolvedValue(DEMO_USER);
    mocks.signIn.mockResolvedValue("http://localhost:3000/api/auth/error?error=CredentialsSignin");

    const response = await POST_DEMO();

    expect(response.status).toBe(500);
  });
});
