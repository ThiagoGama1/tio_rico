import { NextResponse, type NextRequest } from "next/server";
import { getPrisma, isDatabaseConfigured } from "@/lib/db/prisma";

const DB_PING_TIMEOUT_MS = 3_000;
const HEALTH_CACHE_CONTROL = "no-store";

type HealthStatus = "ok" | "degraded";
type AiProvider = "anthropic" | "google";

interface DatabaseHealthCheck {
  configured: boolean;
  connected: boolean;
  latencyMs?: number;
  error?: string;
}

interface AiHealthCheck {
  configured: boolean;
  provider: AiProvider | null;
}

interface HealthResponse {
  status: HealthStatus;
  timestamp: string;
  checks: {
    database: DatabaseHealthCheck;
    ai: AiHealthCheck;
    firecrawl: {
      configured: boolean;
    };
    bcb: {
      configured: true;
    };
  };
}

class DatabasePingTimeoutError extends Error {
  readonly code = "DB_PING_TIMEOUT";

  constructor(timeoutMs: number) {
    super(`Database ping timed out after ${timeoutMs}ms`);
    this.name = "DatabasePingTimeoutError";
  }
}

function readErrorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return undefined;
  }
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code.trim().toUpperCase() : undefined;
}

function readErrorMessageLower(error: unknown): string {
  if (error instanceof Error && typeof error.message === "string") {
    return error.message.toLowerCase();
  }
  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof (error as { message?: unknown }).message === "string"
  ) {
    return (error as { message: string }).message.toLowerCase();
  }
  return "";
}

/**
 * Maps database/driver errors to fixed, safe diagnostic messages.
 * Never returns raw error messages, stack traces, hostnames, or connection strings.
 */
function sanitizeDatabaseError(error: unknown): string {
  if (error instanceof DatabasePingTimeoutError) {
    return `Database ping timed out after ${DB_PING_TIMEOUT_MS}ms`;
  }

  const code = readErrorCode(error);
  const message = readErrorMessageLower(error);

  if (code === "ECONNREFUSED" || message.includes("econnrefused")) {
    return "Database connection refused";
  }

  if (
    code === "ENOTFOUND" ||
    code === "EAI_AGAIN" ||
    message.includes("enotfound") ||
    message.includes("eai_again")
  ) {
    return "Database host unreachable";
  }

  if (
    code === "ETIMEDOUT" ||
    code === "P1001" ||
    code === "P1002" ||
    code === "P1017" ||
    message.includes("timed out") ||
    message.includes("timeout")
  ) {
    return "Database connection unreachable or timed out";
  }

  if (
    code === "28P01" ||
    code === "28000" ||
    code === "P1000" ||
    message.includes("password authentication failed") ||
    message.includes("authentication failed")
  ) {
    return "Database authentication failed";
  }

  if (
    code === "3D000" ||
    code === "P1003" ||
    message.includes("does not exist")
  ) {
    return "Database not found";
  }

  if (
    code === "53300" ||
    code === "P2024" ||
    message.includes("too many clients") ||
    message.includes("connection pool")
  ) {
    return "Database connection pool exhausted";
  }

  if (
    code === "SELF_SIGNED_CERT_IN_CHAIN" ||
    code === "DEPTH_ZERO_SELF_SIGNED_CERT" ||
    code === "UNABLE_TO_VERIFY_LEAF_SIGNATURE" ||
    code === "ERR_TLS_CERT_ALTNAME_INVALID" ||
    message.includes("self-signed") ||
    message.includes("self_signed") ||
    message.includes("certificate") ||
    message.includes("tls handshake") ||
    message.includes("ssl handshake") ||
    message.includes("does not support ssl")
  ) {
    return "Database TLS/SSL handshake failed";
  }

  return "Database connection check failed";
}

async function checkDatabaseHealth(): Promise<DatabaseHealthCheck> {
  if (!isDatabaseConfigured()) {
    return {
      configured: false,
      connected: false,
    };
  }

  const startedAt = Date.now();
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  try {
    const pingPromise = Promise.resolve(getPrisma().$queryRaw`SELECT 1`);
    // Prevent unhandled rejection if the timeout settles first
    void pingPromise.catch(() => undefined);

    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new DatabasePingTimeoutError(DB_PING_TIMEOUT_MS));
      }, DB_PING_TIMEOUT_MS);
    });

    await Promise.race([pingPromise, timeoutPromise]);

    return {
      configured: true,
      connected: true,
      latencyMs: Math.max(0, Date.now() - startedAt),
    };
  } catch (error: unknown) {
    return {
      configured: true,
      connected: false,
      latencyMs: Math.max(0, Date.now() - startedAt),
      error: sanitizeDatabaseError(error),
    };
  } finally {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
  }
}

function checkAiHealth(): AiHealthCheck {
  const rawProvider = process.env.AI_PROVIDER?.trim().toLowerCase();
  const hasAnthropicKey = Boolean(process.env.ANTHROPIC_API_KEY?.trim());
  const hasGoogleKey = Boolean(
    process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim() ||
      process.env.GEMINI_API_KEY?.trim(),
  );

  if (rawProvider === "anthropic") {
    return {
      configured: hasAnthropicKey,
      provider: "anthropic",
    };
  }

  if (rawProvider === "google") {
    return {
      configured: hasGoogleKey,
      provider: "google",
    };
  }

  if (rawProvider) {
    return {
      configured: false,
      provider: null,
    };
  }

  if (hasAnthropicKey) {
    return {
      configured: true,
      provider: "anthropic",
    };
  }

  if (hasGoogleKey) {
    return {
      configured: true,
      provider: "google",
    };
  }

  return {
    configured: false,
    provider: null,
  };
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  // Read request searchParams before any try/catch so Next.js 16.4
  // (cacheComponents: true) cleanly marks this Route Handler as dynamic.
  const strictParam = request.nextUrl.searchParams
    .get("strict")
    ?.trim()
    .toLowerCase();
  const strict = strictParam === "true" || strictParam === "1";

  const database = await checkDatabaseHealth();
  const ai = checkAiHealth();
  const firecrawl = {
    configured: Boolean(process.env.FIRECRAWL_API_KEY?.trim()),
  };
  const bcb = {
    configured: true as const,
  };

  const status: HealthStatus =
    database.connected && ai.configured ? "ok" : "degraded";
  const httpStatus = strict && status !== "ok" ? 503 : 200;

  const payload: HealthResponse = {
    status,
    timestamp: new Date().toISOString(),
    checks: {
      database,
      ai,
      firecrawl,
      bcb,
    },
  };

  return NextResponse.json(payload, {
    status: httpStatus,
    headers: {
      "Cache-Control": HEALTH_CACHE_CONTROL,
    },
  });
}
