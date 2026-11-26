import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockIsDatabaseConfigured = vi.fn<() => boolean>();
const mockQueryRaw = vi.fn<(...args: unknown[]) => Promise<unknown>>();
const mockGetPrisma = vi.fn(() => ({
  $queryRaw: mockQueryRaw,
}));

vi.mock("@/lib/db/prisma", () => ({
  isDatabaseConfigured: () => mockIsDatabaseConfigured(),
  getPrisma: () => mockGetPrisma(),
}));

import { GET } from "@/app/api/health/route";

const ENV_KEYS = [
  "DATABASE_URL",
  "DATABASE_URL_POOLED",
  "AI_PROVIDER",
  "AI_MODEL",
  "ANTHROPIC_API_KEY",
  "GOOGLE_GENERATIVE_AI_API_KEY",
  "GEMINI_API_KEY",
  "FIRECRAWL_API_KEY",
  "AUTH_SECRET",
  "AUTH_RESEND_KEY",
  "AUTH_EMAIL_FROM",
] as const;

type EnvSnapshot = Partial<Record<(typeof ENV_KEYS)[number], string>>;

function clearTrackedEnv(): void {
  for (const key of ENV_KEYS) {
    delete process.env[key];
  }
}

describe("GET /api/health", () => {
  const originalEnv: EnvSnapshot = {};

  beforeEach(() => {
    for (const key of ENV_KEYS) {
      originalEnv[key] = process.env[key];
    }
    clearTrackedEnv();
    vi.clearAllMocks();
    mockIsDatabaseConfigured.mockReturnValue(false);
  });

  afterEach(() => {
    vi.useRealTimers();
    clearTrackedEnv();
    for (const key of ENV_KEYS) {
      const value = originalEnv[key];
      if (value !== undefined) {
        process.env[key] = value;
      }
    }
  });

  it("returns 200 degraded when environment variables are unconfigured", async () => {
    const request = new NextRequest("http://localhost:3000/api/health");
    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(body.status).toBe("degraded");
    expect(typeof body.timestamp).toBe("string");
    expect(body.checks).toEqual({
      database: {
        configured: false,
        connected: false,
      },
      ai: {
        configured: false,
        provider: null,
      },
      auth: {
        configured: false,
        emailLoginConfigured: false,
      },
      firecrawl: {
        configured: false,
      },
      bcb: {
        configured: true,
      },
    });
    expect(mockGetPrisma).not.toHaveBeenCalled();
  });

  it("returns 503 degraded when ?strict=true and environment is unconfigured", async () => {
    const request = new NextRequest(
      "http://localhost:3000/api/health?strict=true",
    );
    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(body.status).toBe("degraded");
    expect(body.checks.database.connected).toBe(false);
    expect(body.checks.ai.configured).toBe(false);
    expect(body.checks.auth.configured).toBe(false);
  });

  it("returns 200 ok when DB ping succeeds, Auth.js and Anthropic AI key are configured without leaking secrets", async () => {
    mockIsDatabaseConfigured.mockReturnValue(true);
    mockQueryRaw.mockResolvedValue([{ "?column?": 1 }]);
    process.env.DATABASE_URL =
      "postgresql://demo_user:top-secret-db-pass@db.example.com:5432/tio_rico";
    process.env.AI_PROVIDER = "anthropic";
    process.env.ANTHROPIC_API_KEY = "sk-ant-secret-key-12345";
    process.env.FIRECRAWL_API_KEY = "fc-secret-key-98765";
    process.env.AUTH_SECRET = "super-secret-auth-token-value";
    process.env.AUTH_RESEND_KEY = "re_secret_resend_token";

    const request = new NextRequest(
      "http://localhost:3000/api/health?strict=true",
    );
    const response = await GET(request);
    const rawText = await response.text();
    const body = JSON.parse(rawText);

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(body.status).toBe("ok");
    expect(body.checks.database).toMatchObject({
      configured: true,
      connected: true,
    });
    expect(typeof body.checks.database.latencyMs).toBe("number");
    expect(body.checks.database.latencyMs).toBeGreaterThanOrEqual(0);
    expect(body.checks.database.error).toBeUndefined();
    expect(body.checks.ai).toEqual({
      configured: true,
      provider: "anthropic",
    });
    expect(body.checks.auth).toEqual({
      configured: true,
      emailLoginConfigured: true,
    });
    expect(body.checks.firecrawl).toEqual({ configured: true });
    expect(body.checks.bcb).toEqual({ configured: true });
    expect(mockQueryRaw).toHaveBeenCalledTimes(1);

    // Ensure no secret value leaks anywhere in the payload
    expect(rawText).not.toContain("top-secret-db-pass");
    expect(rawText).not.toContain("sk-ant-secret-key-12345");
    expect(rawText).not.toContain("fc-secret-key-98765");
    expect(rawText).not.toContain("super-secret-auth-token-value");
    expect(rawText).not.toContain("re_secret_resend_token");
    expect(rawText).not.toContain("postgresql://");
  });

  it("auto-detects Google AI provider via GEMINI_API_KEY alias and treats Firecrawl and Resend as optional", async () => {
    mockIsDatabaseConfigured.mockReturnValue(true);
    mockQueryRaw.mockResolvedValue([{ "?column?": 1 }]);
    process.env.GEMINI_API_KEY = "gemini-secret-alias-key";
    process.env.AUTH_SECRET = "auth-secret-present";

    const request = new NextRequest("http://localhost:3000/api/health");
    const response = await GET(request);
    const rawText = await response.text();
    const body = JSON.parse(rawText);

    expect(response.status).toBe(200);
    expect(body.status).toBe("ok");
    expect(body.checks.ai).toEqual({
      configured: true,
      provider: "google",
    });
    expect(body.checks.auth).toEqual({
      configured: true,
      emailLoginConfigured: false,
    });
    expect(body.checks.firecrawl).toEqual({ configured: false });
    expect(rawText).not.toContain("gemini-secret-alias-key");
    expect(rawText).not.toContain("auth-secret-present");
  });

  it("reports degraded when AUTH_SECRET is missing even if DB and AI are ready", async () => {
    mockIsDatabaseConfigured.mockReturnValue(true);
    mockQueryRaw.mockResolvedValue([{ "?column?": 1 }]);
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = "AQ.valid-key";

    const softRes = await GET(
      new NextRequest("http://localhost:3000/api/health"),
    );
    const softBody = await softRes.json();

    expect(softRes.status).toBe(200);
    expect(softBody.status).toBe("degraded");
    expect(softBody.checks.auth).toEqual({
      configured: false,
      emailLoginConfigured: false,
    });

    const strictRes = await GET(
      new NextRequest("http://localhost:3000/api/health?strict=true"),
    );
    expect(strictRes.status).toBe(503);
  });

  it("reports degraded when explicit AI_PROVIDER lacks its matching key or is invalid", async () => {
    mockIsDatabaseConfigured.mockReturnValue(true);
    mockQueryRaw.mockResolvedValue([{ "?column?": 1 }]);
    process.env.AI_PROVIDER = "anthropic";
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = "google-key-only";

    const mismatchRes = await GET(
      new NextRequest("http://localhost:3000/api/health?strict=true"),
    );
    const mismatchBody = await mismatchRes.json();

    expect(mismatchRes.status).toBe(503);
    expect(mismatchBody.status).toBe("degraded");
    expect(mismatchBody.checks.ai).toEqual({
      configured: false,
      provider: "anthropic",
    });

    process.env.AI_PROVIDER = "secret-accidentally-pasted";
    const invalidRes = await GET(
      new NextRequest("http://localhost:3000/api/health"),
    );
    const invalidRaw = await invalidRes.text();
    const invalidBody = JSON.parse(invalidRaw);

    expect(invalidRes.status).toBe(200);
    expect(invalidBody.status).toBe("degraded");
    expect(invalidBody.checks.ai).toEqual({
      configured: false,
      provider: null,
    });
    expect(invalidRaw).not.toContain("secret-accidentally-pasted");
  });

  it("returns degraded (200) and 503 (?strict=true) on DB ping failure without leaking connection strings", async () => {
    mockIsDatabaseConfigured.mockReturnValue(true);
    process.env.ANTHROPIC_API_KEY = "sk-ant-valid-key";

    const sensitiveError = Object.assign(
      new Error(
        "password authentication failed for user \"admin\" at postgresql://admin:my-ultra-secret@ep-cool-123.us-east-1.aws.neon.tech:5432/neondb?sslmode=require",
      ),
      { code: "28P01" },
    );
    mockQueryRaw.mockRejectedValue(sensitiveError);

    const softRes = await GET(
      new NextRequest("http://localhost:3000/api/health"),
    );
    const softRaw = await softRes.text();
    const softBody = JSON.parse(softRaw);

    expect(softRes.status).toBe(200);
    expect(softBody.status).toBe("degraded");
    expect(softBody.checks.database).toMatchObject({
      configured: true,
      connected: false,
      error: "Database authentication failed",
    });
    expect(typeof softBody.checks.database.latencyMs).toBe("number");
    expect(softRaw).not.toContain("my-ultra-secret");
    expect(softRaw).not.toContain("postgresql://");
    expect(softRaw).not.toContain("neon.tech");
    expect(softRaw).not.toContain("admin");

    const strictRes = await GET(
      new NextRequest("http://localhost:3000/api/health?strict=true"),
    );
    const strictBody = await strictRes.json();

    expect(strictRes.status).toBe(503);
    expect(strictBody.status).toBe("degraded");
    expect(strictBody.checks.database.connected).toBe(false);
    expect(strictBody.checks.database.error).toBe(
      "Database authentication failed",
    );
  });

  it("aborts DB ping after 3 seconds and reports timeout error cleanly", async () => {
    vi.useFakeTimers();
    mockIsDatabaseConfigured.mockReturnValue(true);
    process.env.ANTHROPIC_API_KEY = "sk-ant-valid-key";

    // Never-resolving query to exercise the 3s timeout guard
    mockQueryRaw.mockImplementation(() => new Promise(() => undefined));

    const responsePromise = GET(
      new NextRequest("http://localhost:3000/api/health?strict=true"),
    );

    await vi.advanceTimersByTimeAsync(3_000);
    const response = await responsePromise;
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.status).toBe("degraded");
    expect(body.checks.database).toMatchObject({
      configured: true,
      connected: false,
      error: "Database ping timed out after 3000ms",
    });
  });
});
