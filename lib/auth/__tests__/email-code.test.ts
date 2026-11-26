import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  isDatabaseConfigured: vi.fn<() => boolean>(),
  getPrisma: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({
  getPrisma: mocks.getPrisma,
  isDatabaseConfigured: mocks.isDatabaseConfigured,
}));

import { sendEmailLoginCode, verifyEmailLoginCode } from "@/lib/auth/email-code";

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
});
