import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  isDatabaseConfigured: vi.fn<() => boolean>(),
  getPrisma: vi.fn(),
  consumirLimite: vi.fn(),
  limiteEsgotado: vi.fn(),
  zerarLimite: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({
  getPrisma: mocks.getPrisma,
  isDatabaseConfigured: mocks.isDatabaseConfigured,
}));

vi.mock("@/lib/security/rate-limit", () => ({
  consumirLimite: mocks.consumirLimite,
  limiteEsgotado: mocks.limiteEsgotado,
  zerarLimite: mocks.zerarLimite,
}));

import {
  MAX_FALHAS_CODIGO,
  sendEmailLoginCode,
  verifyEmailLoginCode,
} from "@/lib/auth/email-code";

function limite(restante: number, permitido = true) {
  return { permitido, restante, reiniciaEm: new Date(Date.now() + 60_000) };
}

const prisma = {
  user: {
    findUnique: vi.fn(),
    upsert: vi.fn(),
  },
  verificationToken: {
    create: vi.fn(),
    deleteMany: vi.fn(),
  },
};

const originalResendKey = process.env.AUTH_RESEND_KEY;
const originalSecret = process.env.AUTH_SECRET;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.isDatabaseConfigured.mockReturnValue(true);
  mocks.getPrisma.mockReturnValue(prisma);
  prisma.user.findUnique.mockResolvedValue(null);
  prisma.user.upsert.mockResolvedValue({ id: "user-1", email: "ana@example.com" });
  prisma.verificationToken.create.mockResolvedValue({});
  prisma.verificationToken.deleteMany.mockResolvedValue({ count: 1 });
  mocks.limiteEsgotado.mockResolvedValue(false);
  mocks.consumirLimite.mockResolvedValue(limite(10));
  mocks.zerarLimite.mockResolvedValue(undefined);
  process.env.AUTH_RESEND_KEY = "re_test";
  process.env.AUTH_SECRET = "test-secret";
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 200 })));
});

afterEach(() => {
  process.env.AUTH_RESEND_KEY = originalResendKey;
  process.env.AUTH_SECRET = originalSecret;
  vi.unstubAllGlobals();
});

describe("sendEmailLoginCode", () => {
  it("stores a hashed, short-lived code and sends its plain value only by e-mail", async () => {
    await sendEmailLoginCode("ana@example.com");

    const created = prisma.verificationToken.create.mock.calls[0][0].data;
    const emailRequest = JSON.parse(
      (vi.mocked(fetch).mock.calls[0][1] as RequestInit).body as string,
    );

    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { email: "ana@example.com" },
      select: { id: true },
    });
    expect(created.identifier).toBe("email-code:ana@example.com");
    expect(created.token).toMatch(/^[a-f0-9]{64}$/);
    expect(created.expires.getTime()).toBeGreaterThan(Date.now());
    expect(emailRequest.to).toBe("ana@example.com");
    expect(emailRequest.text).toMatch(/\b\d{6}\b/);
  });

  it("removes the stored code when Resend cannot deliver it", async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error("Resend unavailable"));

    await expect(sendEmailLoginCode("ana@example.com")).rejects.toThrow(
      "Resend unavailable",
    );

    expect(prisma.verificationToken.deleteMany).toHaveBeenCalledTimes(2);
  });
});

describe("verifyEmailLoginCode", () => {
  it("atomically consumes a valid code before creating the Auth.js user", async () => {
    await expect(verifyEmailLoginCode("Ana@Example.com", "123456")).resolves.toEqual({
      id: "user-1",
      email: "ana@example.com",
    });

    expect(prisma.verificationToken.deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          identifier: "email-code:ana@example.com",
          expires: { gt: expect.any(Date) },
        }),
      }),
    );
    expect(prisma.user.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { email: "ana@example.com" },
      }),
    );
  });

  it("rejects malformed or already consumed codes", async () => {
    prisma.verificationToken.deleteMany.mockResolvedValue({ count: 0 });

    await expect(verifyEmailLoginCode("ana@example.com", "123")).resolves.toBeNull();
    await expect(verifyEmailLoginCode("ana@example.com", "123456")).resolves.toBeNull();
    expect(prisma.user.upsert).not.toHaveBeenCalled();
  });

  it("counts a wrong code as a failure for that e-mail", async () => {
    prisma.verificationToken.deleteMany.mockResolvedValue({ count: 0 });

    await verifyEmailLoginCode("ana@example.com", "111111", "1.2.3.4");

    expect(mocks.consumirLimite).toHaveBeenCalledWith(
      "login-ip:1.2.3.4",
      expect.any(Number),
      expect.any(Number),
    );
    expect(mocks.consumirLimite).toHaveBeenCalledWith(
      "login-falha:ana@example.com",
      MAX_FALHAS_CODIGO,
      expect.any(Number),
    );
  });

  it("discards the pending code on the last allowed wrong attempt", async () => {
    prisma.verificationToken.deleteMany.mockResolvedValue({ count: 0 });
    mocks.consumirLimite
      .mockResolvedValueOnce(limite(20)) // por IP
      .mockResolvedValueOnce(limite(0)); // 5a falha do e-mail

    await expect(verifyEmailLoginCode("ana@example.com", "111111")).resolves.toBeNull();

    // 1a chamada: o palpite errado; 2a: descarta o codigo pendente do e-mail
    expect(prisma.verificationToken.deleteMany).toHaveBeenCalledTimes(2);
    expect(prisma.verificationToken.deleteMany).toHaveBeenLastCalledWith({
      where: { identifier: "email-code:ana@example.com" },
    });
  });

  it("refuses even the right code while the e-mail is locked", async () => {
    mocks.limiteEsgotado.mockResolvedValue(true);

    await expect(verifyEmailLoginCode("ana@example.com", "123456")).resolves.toBeNull();

    expect(prisma.verificationToken.deleteMany).not.toHaveBeenCalled();
    expect(prisma.user.upsert).not.toHaveBeenCalled();
  });

  it("refuses when the IP ran out of attempts, without touching the code", async () => {
    mocks.consumirLimite.mockResolvedValueOnce(limite(0, false));

    await expect(verifyEmailLoginCode("ana@example.com", "123456")).resolves.toBeNull();

    expect(prisma.verificationToken.deleteMany).not.toHaveBeenCalled();
  });

  it("clears the failure counter after a successful login", async () => {
    await verifyEmailLoginCode("ana@example.com", "123456");

    expect(mocks.zerarLimite).toHaveBeenCalledWith("login-falha:ana@example.com");
  });
});
