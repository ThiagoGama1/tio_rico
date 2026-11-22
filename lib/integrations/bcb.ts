import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { getPrisma, isDatabaseConfigured } from "@/lib/db/prisma";
import {
  IpcaHistoryPointSchema,
  MacroIndicatorsSchema,
  type IpcaHistoryPoint,
  type MacroIndicators,
} from "@/lib/types/domain";

const BCB_SGS_BASE_URL = "https://api.bcb.gov.br/dados/serie/bcdata.sgs";

export const DEFAULT_BCB_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
export const DEFAULT_BCB_TIMEOUT_MS = 5_000;
export const DEFAULT_BCB_RETRY_DELAY_MS = 300;

/**
 * Official Banco Central do Brasil (BCB) SGS series identifiers.
 */
export const BCB_SERIES = {
  /** Meta Selic (% a.a.) */
  SELIC_META: 432,
  /** CDI anualizado (% a.a. base 252) */
  CDI_ANNUAL: 4389,
  /** CDI diário (% a.d.) */
  CDI_DAILY: 12,
  /** IPCA variação mensal (% a.m.) */
  IPCA_MONTHLY: 433,
  /** IPCA acumulado em 12 meses (% a.a.) */
  IPCA_12M: 13522,
} as const;

export type BcbSeriesId = (typeof BCB_SERIES)[keyof typeof BCB_SERIES];

export interface GetMacroIndicatorsOptions {
  forceRefresh?: boolean;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  retryDelayMs?: number;
  skipDb?: boolean;
  ttlMs?: number;
  now?: () => number;
}

interface BcbCacheEntry {
  data: MacroIndicators;
  expiresAt: number;
}

let inMemoryCache: BcbCacheEntry | null = null;

/**
 * Clears the in-memory BCB macro indicators TTL cache.
 */
export function clearBcbCache(): void {
  inMemoryCache = null;
}

/**
 * Builds the official BCB SGS JSON endpoint URL for the last N observations.
 */
export function buildBcbSeriesUrl(seriesId: number, count: number): string {
  return `${BCB_SGS_BASE_URL}.${seriesId}/dados/ultimos/${count}?formato=json`;
}

/**
 * Safely converts a BCB date string (`DD/MM/YYYY`) into an ISO calendar date (`YYYY-MM-DD`).
 * Returns `null` for malformed strings or invalid calendar dates (e.g. `31/02/2026`).
 */
export function parseBcbDateToIso(rawDate: string): string | null {
  const trimmed = rawDate.trim();
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(trimmed);
  if (!match) {
    return null;
  }

  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);

  if (year < 1900 || year > 2999 || month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }

  const utcDate = new Date(Date.UTC(year, month - 1, day));
  if (
    utcDate.getUTCFullYear() !== year ||
    utcDate.getUTCMonth() !== month - 1 ||
    utcDate.getUTCDate() !== day
  ) {
    return null;
  }

  return `${match[3]}-${match[2]}-${match[1]}`;
}

/**
 * Computes the compounded 12-month IPCA rate from monthly percentage variations:
 * `((prod(1 + m/100) - 1) * 100)`, rounded to 2 decimal places.
 */
export function computeCompound12mIpca(
  monthlyRates: ReadonlyArray<number | IpcaHistoryPoint>,
): number {
  if (monthlyRates.length === 0) {
    return 0;
  }

  let product = 1;
  for (const entry of monthlyRates) {
    const rate = typeof entry === "number" ? entry : entry.value;
    if (!Number.isFinite(rate)) {
      throw new Error(`Invalid monthly IPCA rate: ${String(rate)}`);
    }
    product *= 1 + rate / 100;
  }

  const pct = (product - 1) * 100;
  const rounded = Math.round(pct * 100) / 100;
  return Object.is(rounded, -0) ? 0 : rounded;
}

const BcbRawItemSchema = z.object({
  data: z.string().trim().min(1),
  valor: z.string().trim().min(1),
});

const NUMERIC_VALUE_REGEX = /^[+-]?\d+(?:\.\d+)?$/;

const BcbPointSchema = BcbRawItemSchema.transform(
  (item, ctx): IpcaHistoryPoint => {
    const isoDate = parseBcbDateToIso(item.data);
    if (!isoDate) {
      ctx.addIssue({
        code: "custom",
        path: ["data"],
        message: `Invalid BCB date: "${item.data}"`,
      });
      return z.NEVER;
    }

    if (!NUMERIC_VALUE_REGEX.test(item.valor)) {
      ctx.addIssue({
        code: "custom",
        path: ["valor"],
        message: `Invalid BCB numeric value: "${item.valor}"`,
      });
      return z.NEVER;
    }

    const numericValue = Number(item.valor);
    if (!Number.isFinite(numericValue)) {
      ctx.addIssue({
        code: "custom",
        path: ["valor"],
        message: `Non-finite BCB numeric value: "${item.valor}"`,
      });
      return z.NEVER;
    }

    return {
      date: isoDate,
      value: numericValue,
    };
  },
);

const BcbSeriesResponseSchema = z.array(BcbPointSchema).min(1);

const SnapshotRawPayloadSchema = z.object({
  ipcaHistory: z.array(IpcaHistoryPointSchema),
});

const FALLBACK_IPCA_HISTORY: ReadonlyArray<IpcaHistoryPoint> = [
  { date: "2024-05-01", value: 0.46 },
  { date: "2024-06-01", value: 0.21 },
  { date: "2024-07-01", value: 0.38 },
  { date: "2024-08-01", value: -0.02 },
  { date: "2024-09-01", value: 0.44 },
  { date: "2024-10-01", value: 0.56 },
  { date: "2024-11-01", value: 0.39 },
  { date: "2024-12-01", value: 0.52 },
  { date: "2025-01-01", value: 0.16 },
  { date: "2025-02-01", value: 1.31 },
  { date: "2025-03-01", value: 0.56 },
  { date: "2025-04-01", value: 0.43 },
];

const FALLBACK_IPCA_12M = computeCompound12mIpca(FALLBACK_IPCA_HISTORY);

function buildStaticFallback(nowMs: number): MacroIndicators {
  const latestIpca = FALLBACK_IPCA_HISTORY[FALLBACK_IPCA_HISTORY.length - 1];
  return MacroIndicatorsSchema.parse({
    selicMetaAnnual: 14.75,
    selicDate: "2025-05-08",
    cdiAnnual: 14.65,
    cdiDaily: 0.0542,
    cdiDate: "2025-05-08",
    ipcaMonthly: latestIpca.value,
    ipca12m: FALLBACK_IPCA_12M,
    ipcaDate: latestIpca.date,
    ipcaHistory: FALLBACK_IPCA_HISTORY.map((point) => ({ ...point })),
    source: "fallback",
    fetchedAt: new Date(nowMs).toISOString(),
    isStale: true,
  });
}

function cloneMacroIndicators(data: MacroIndicators): MacroIndicators {
  return {
    ...data,
    ipcaHistory: data.ipcaHistory.map((point) => ({ ...point })),
  };
}

function sleep(ms: number): Promise<void> {
  if (ms <= 0) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function isRetryableHttpStatus(status: number): boolean {
  return status >= 500 || status === 429;
}

class NonRetryableBcbError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NonRetryableBcbError";
  }
}

function normalizeSeriesPoints(
  points: ReadonlyArray<IpcaHistoryPoint>,
  maxItems?: number,
): IpcaHistoryPoint[] {
  const byDate = new Map<string, IpcaHistoryPoint>();
  for (const point of points) {
    byDate.set(point.date, point);
  }
  const sorted = Array.from(byDate.values()).sort((a, b) =>
    a.date.localeCompare(b.date),
  );
  if (maxItems !== undefined && sorted.length > maxItems) {
    return sorted.slice(sorted.length - maxItems);
  }
  return sorted;
}

async function fetchBcbSeries(
  seriesId: BcbSeriesId,
  count: number,
  options: {
    fetchImpl: typeof fetch;
    timeoutMs: number;
    retryDelayMs: number;
  },
): Promise<IpcaHistoryPoint[]> {
  const url = buildBcbSeriesUrl(seriesId, count);
  const safeTimeoutMs = Math.max(1, options.timeoutMs);
  const maxAttempts = 2;

  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await options.fetchImpl(url, {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(safeTimeoutMs),
      });

      if (!response.ok) {
        const message = `BCB SGS series ${seriesId} returned HTTP ${response.status}`;
        if (isRetryableHttpStatus(response.status) && attempt < maxAttempts) {
          lastError = new Error(message);
          await sleep(options.retryDelayMs);
          continue;
        }
        throw new NonRetryableBcbError(message);
      }

      let rawJson: unknown;
      try {
        rawJson = await response.json();
      } catch (parseErr) {
        throw new NonRetryableBcbError(
          `BCB SGS series ${seriesId} returned invalid JSON: ${
            parseErr instanceof Error ? parseErr.message : String(parseErr)
          }`,
        );
      }

      const parsed = BcbSeriesResponseSchema.safeParse(rawJson);
      if (!parsed.success) {
        throw new NonRetryableBcbError(
          `BCB SGS series ${seriesId} payload validation failed: ${parsed.error.message}`,
        );
      }

      return normalizeSeriesPoints(parsed.data, count);
    } catch (error) {
      if (error instanceof NonRetryableBcbError) {
        throw error;
      }

      lastError = error;
      if (attempt < maxAttempts) {
        await sleep(options.retryDelayMs);
        continue;
      }
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(`Failed to fetch BCB SGS series ${seriesId}`);
}

async function persistMacroSnapshotBestEffort(
  indicators: MacroIndicators,
  ipca12mComputedFromMonthly: boolean,
): Promise<void> {
  if (!isDatabaseConfigured()) {
    return;
  }

  try {
    const prisma = getPrisma();
    const rawPayload: Prisma.InputJsonObject = {
      ipcaHistory: indicators.ipcaHistory.map((point) => ({
        date: point.date,
        value: point.value,
      })),
      ipca12mComputedFromMonthly,
    };

    await prisma.macroSnapshot.create({
      data: {
        selicMetaAnnual: indicators.selicMetaAnnual,
        selicDate: indicators.selicDate,
        cdiAnnual: indicators.cdiAnnual,
        cdiDaily: indicators.cdiDaily,
        cdiDate: indicators.cdiDate,
        ipcaMonthly: indicators.ipcaMonthly,
        ipca12m: indicators.ipca12m,
        ipcaDate: indicators.ipcaDate,
        rawPayload,
        fetchedAt: new Date(indicators.fetchedAt),
      },
    });
  } catch (error) {
    console.warn(
      "[bcb] Failed to persist MacroSnapshot to PostgreSQL (best-effort):",
      error instanceof Error ? error.message : String(error),
    );
  }
}

async function loadLatestMacroSnapshotFromDb(): Promise<MacroIndicators | null> {
  if (!isDatabaseConfigured()) {
    return null;
  }

  try {
    const prisma = getPrisma();
    const snapshot = await prisma.macroSnapshot.findFirst({
      orderBy: { fetchedAt: "desc" },
    });

    if (!snapshot) {
      return null;
    }

    const parsedRaw = SnapshotRawPayloadSchema.safeParse(snapshot.rawPayload);
    const ipcaHistory = parsedRaw.success
      ? normalizeSeriesPoints(parsedRaw.data.ipcaHistory, 12)
      : [{ date: snapshot.ipcaDate, value: snapshot.ipcaMonthly }];

    const candidate = MacroIndicatorsSchema.safeParse({
      selicMetaAnnual: snapshot.selicMetaAnnual,
      selicDate: snapshot.selicDate,
      cdiAnnual: snapshot.cdiAnnual,
      cdiDaily: snapshot.cdiDaily ?? null,
      cdiDate: snapshot.cdiDate,
      ipcaMonthly: snapshot.ipcaMonthly,
      ipca12m: snapshot.ipca12m,
      ipcaDate: snapshot.ipcaDate,
      ipcaHistory,
      source: "database_cache",
      fetchedAt: snapshot.fetchedAt.toISOString(),
      isStale: true,
    });

    if (!candidate.success) {
      console.warn(
        "[bcb] Latest PostgreSQL MacroSnapshot failed schema validation:",
        candidate.error.message,
      );
      return null;
    }

    return candidate.data;
  } catch (error) {
    console.warn(
      "[bcb] Failed to load fallback MacroSnapshot from PostgreSQL:",
      error instanceof Error ? error.message : String(error),
    );
    return null;
  }
}

/**
 * Fetches current Brazilian macroeconomic indicators (Selic, CDI, IPCA) from the
 * official Banco Central do Brasil (BCB SGS) API with layered resilience:
 *
 * 1. In-memory TTL cache (default 1 hour, bypassable via `forceRefresh: true`).
 * 2. Live parallel BCB SGS fetch with timeout, 1 retry on transient/5xx errors,
 *    and automatic compounding of 12-month IPCA from series 433 if series 13522 fails.
 * 3. Latest persisted `MacroSnapshot` from PostgreSQL (`source: "database_cache"`, `isStale: true`).
 * 4. Clearly dated static fallback (`source: "fallback"`, `isStale: true`).
 */
export async function getMacroIndicators(
  options: GetMacroIndicatorsOptions = {},
): Promise<MacroIndicators> {
  const {
    forceRefresh = false,
    fetchImpl = globalThis.fetch,
    timeoutMs = DEFAULT_BCB_TIMEOUT_MS,
    retryDelayMs = DEFAULT_BCB_RETRY_DELAY_MS,
    skipDb = false,
    ttlMs = DEFAULT_BCB_CACHE_TTL_MS,
    now = Date.now,
  } = options;

  const currentTimeMs = now();

  if (!forceRefresh && inMemoryCache && currentTimeMs < inMemoryCache.expiresAt) {
    return cloneMacroIndicators(inMemoryCache.data);
  }

  const fetchOptions = {
    fetchImpl,
    timeoutMs,
    retryDelayMs,
  };

  const [
    selicResult,
    cdiAnnualResult,
    cdiDailyResult,
    ipcaMonthlyResult,
    ipca12mResult,
  ] = await Promise.allSettled([
    fetchBcbSeries(BCB_SERIES.SELIC_META, 1, fetchOptions),
    fetchBcbSeries(BCB_SERIES.CDI_ANNUAL, 1, fetchOptions),
    fetchBcbSeries(BCB_SERIES.CDI_DAILY, 1, fetchOptions),
    fetchBcbSeries(BCB_SERIES.IPCA_MONTHLY, 12, fetchOptions),
    fetchBcbSeries(BCB_SERIES.IPCA_12M, 1, fetchOptions),
  ]);

  const selicPoint =
    selicResult.status === "fulfilled"
      ? selicResult.value[selicResult.value.length - 1]
      : null;

  const cdiAnnualPoint =
    cdiAnnualResult.status === "fulfilled"
      ? cdiAnnualResult.value[cdiAnnualResult.value.length - 1]
      : null;

  const cdiDailyPoint =
    cdiDailyResult.status === "fulfilled"
      ? cdiDailyResult.value[cdiDailyResult.value.length - 1]
      : null;

  const ipcaHistory =
    ipcaMonthlyResult.status === "fulfilled" ? ipcaMonthlyResult.value : null;
  const latestIpcaMonthly =
    ipcaHistory && ipcaHistory.length > 0
      ? ipcaHistory[ipcaHistory.length - 1]
      : null;

  const ipca12mPoint =
    ipca12mResult.status === "fulfilled"
      ? ipca12mResult.value[ipca12mResult.value.length - 1]
      : null;

  let resolvedIpca12m: number | null = ipca12mPoint?.value ?? null;
  let ipca12mComputedFromMonthly = false;

  if (resolvedIpca12m === null && ipcaHistory && ipcaHistory.length === 12) {
    resolvedIpca12m = computeCompound12mIpca(ipcaHistory);
    ipca12mComputedFromMonthly = true;
  }

  if (
    selicPoint &&
    cdiAnnualPoint &&
    latestIpcaMonthly &&
    ipcaHistory &&
    resolvedIpca12m !== null
  ) {
    const liveIndicators = MacroIndicatorsSchema.parse({
      selicMetaAnnual: selicPoint.value,
      selicDate: selicPoint.date,
      cdiAnnual: cdiAnnualPoint.value,
      cdiDaily: cdiDailyPoint ? cdiDailyPoint.value : null,
      cdiDate: cdiAnnualPoint.date,
      ipcaMonthly: latestIpcaMonthly.value,
      ipca12m: resolvedIpca12m,
      ipcaDate: latestIpcaMonthly.date,
      ipcaHistory,
      source: "bcb_sgs",
      fetchedAt: new Date(currentTimeMs).toISOString(),
      isStale: false,
    });

    inMemoryCache = {
      data: cloneMacroIndicators(liveIndicators),
      expiresAt: currentTimeMs + Math.max(0, ttlMs),
    };

    if (!skipDb) {
      await persistMacroSnapshotBestEffort(
        liveIndicators,
        ipca12mComputedFromMonthly,
      );
    }

    return cloneMacroIndicators(liveIndicators);
  }

  const failures: string[] = [];
  if (!selicPoint) failures.push("SELIC(432)");
  if (!cdiAnnualPoint) failures.push("CDI_ANNUAL(4389)");
  if (!latestIpcaMonthly) failures.push("IPCA_MONTHLY(433)");
  if (resolvedIpca12m === null) failures.push("IPCA_12M(13522)");
  console.warn(
    `[bcb] Essential BCB SGS indicators unavailable (${failures.join(", ")}); falling back to cached/static data.`,
  );

  if (!skipDb) {
    const dbSnapshot = await loadLatestMacroSnapshotFromDb();
    if (dbSnapshot) {
      return cloneMacroIndicators(dbSnapshot);
    }
  }

  return buildStaticFallback(currentTimeMs);
}
