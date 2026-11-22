import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MacroIndicatorsSchema } from "@/lib/types/domain";

const prismaMocks = vi.hoisted(() => ({
  isDatabaseConfigured: vi.fn<() => boolean>(() => false),
  createSnapshot: vi.fn(),
  findFirstSnapshot: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({
  isDatabaseConfigured: prismaMocks.isDatabaseConfigured,
  getPrisma: () => ({
    macroSnapshot: {
      create: prismaMocks.createSnapshot,
      findFirst: prismaMocks.findFirstSnapshot,
    },
  }),
}));

import { GET as getIndicatorsRoute } from "@/app/api/indicators/route";
import {
  BCB_SERIES,
  buildBcbSeriesUrl,
  clearBcbCache,
  computeCompound12mIpca,
  DEFAULT_BCB_CACHE_TTL_MS,
  getMacroIndicators,
  parseBcbDateToIso,
} from "@/lib/integrations/bcb";

interface BcbRow {
  data: string;
  valor: string;
}

const TWELVE_IPCA_MONTHLY_ROWS: BcbRow[] = [
  { data: "01/05/2025", valor: "0.40" },
  { data: "01/06/2025", valor: "0.25" },
  { data: "01/07/2025", valor: "0.35" },
  { data: "01/08/2025", valor: "-0.05" },
  { data: "01/09/2025", valor: "0.42" },
  { data: "01/10/2025", valor: "0.51" },
  { data: "01/11/2025", valor: "0.38" },
  { data: "01/12/2025", valor: "0.55" },
  { data: "01/01/2026", valor: "0.20" },
  { data: "01/02/2026", valor: "0.83" },
  { data: "01/03/2026", valor: "0.51" },
  { data: "01/04/2026", valor: "0.45" },
];

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function createStandardBcbFetch(
  overrides: Partial<
    Record<number, (url: string, init?: RequestInit) => Response | Promise<Response>>
  > = {},
) {
  const defaultHandlers: Record<number, () => Response> = {
    [BCB_SERIES.SELIC_META]: () =>
      jsonResponse([{ data: "07/05/2026", valor: "14.75" }]),
    [BCB_SERIES.CDI_ANNUAL]: () =>
      jsonResponse([{ data: "08/05/2026", valor: "14.65" }]),
    [BCB_SERIES.CDI_DAILY]: () =>
      jsonResponse([{ data: "08/05/2026", valor: "0.0542" }]),
    // Intentionally return out of order to prove sorting ascending by ISO date
    [BCB_SERIES.IPCA_MONTHLY]: () =>
      jsonResponse([...TWELVE_IPCA_MONTHLY_ROWS].reverse()),
    [BCB_SERIES.IPCA_12M]: () =>
      jsonResponse([{ data: "01/04/2026", valor: "4.91" }]),
  };

  return vi.fn<typeof fetch>(async (input, init) => {
    const url = typeof input === "string" ? input : input.toString();
    const match = /bcdata\.sgs\.(\d+)\/dados\/ultimos\/(\d+)/.exec(url);
    if (!match) {
      return jsonResponse({ error: "Unknown URL" }, 404);
    }

    const seriesId = Number(match[1]);
    const override = overrides[seriesId];
    if (override) {
      return override(url, init);
    }

    const handler = defaultHandlers[seriesId];
    return handler ? handler() : jsonResponse({ error: "Not mocked" }, 404);
  });
}

describe("parseBcbDateToIso", () => {
  it("converts valid DD/MM/YYYY dates including leap days and trims whitespace", () => {
    expect(parseBcbDateToIso("01/04/2026")).toBe("2026-04-01");
    expect(parseBcbDateToIso("29/02/2024")).toBe("2024-02-29");
    expect(parseBcbDateToIso("  31/12/2025  ")).toBe("2025-12-31");
  });

  it("returns null for malformed strings and impossible calendar dates", () => {
    expect(parseBcbDateToIso("2026-04-01")).toBeNull();
    expect(parseBcbDateToIso("1/4/2026")).toBeNull();
    expect(parseBcbDateToIso("")).toBeNull();
    expect(parseBcbDateToIso("invalid")).toBeNull();
    expect(parseBcbDateToIso("31/02/2026")).toBeNull();
    expect(parseBcbDateToIso("29/02/2025")).toBeNull();
    expect(parseBcbDateToIso("31/04/2026")).toBeNull();
    expect(parseBcbDateToIso("00/01/2026")).toBeNull();
    expect(parseBcbDateToIso("15/13/2026")).toBeNull();
  });
});

describe("computeCompound12mIpca", () => {
  it("compounds monthly percentage variations accurately", () => {
    // (1.01^12 - 1) * 100 = 12.6825... -> 12.68
    expect(computeCompound12mIpca(Array<number>(12).fill(1))).toBe(12.68);
    expect(computeCompound12mIpca([])).toBe(0);
    expect(computeCompound12mIpca([0, 0, 0])).toBe(0);
  });

  it("accepts IpcaHistoryPoint arrays including deflationary months", () => {
    const points = TWELVE_IPCA_MONTHLY_ROWS.map((row) => ({
      date: parseBcbDateToIso(row.data)!,
      value: Number(row.valor),
    }));
    const expected =
      Math.round(
        (points.reduce((acc, p) => acc * (1 + p.value / 100), 1) - 1) * 10000,
      ) / 100;

    expect(computeCompound12mIpca(points)).toBe(expected);
    expect(computeCompound12mIpca(points)).toBe(4.9);
  });

  it("throws on non-finite monthly rates", () => {
    expect(() => computeCompound12mIpca([0.5, Number.NaN])).toThrow();
    expect(() => computeCompound12mIpca([Number.POSITIVE_INFINITY])).toThrow();
  });
});

describe("getMacroIndicators", () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    clearBcbCache();
    prismaMocks.isDatabaseConfigured.mockReset().mockReturnValue(false);
    prismaMocks.createSnapshot.mockReset();
    prismaMocks.findFirstSnapshot.mockReset();
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    warnSpy.mockRestore();
    vi.restoreAllMocks();
  });

  it("fetches all BCB SGS series in parallel and returns validated live indicators", async () => {
    const fetchMock = createStandardBcbFetch();
    const fixedNow = Date.parse("2026-05-09T15:00:00.000Z");

    const result = await getMacroIndicators({
      fetchImpl: fetchMock,
      retryDelayMs: 0,
      skipDb: true,
      now: () => fixedNow,
    });

    expect(() => MacroIndicatorsSchema.parse(result)).not.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(5);

    const calledUrls = fetchMock.mock.calls.map(([url]) => String(url));
    expect(calledUrls).toContain(buildBcbSeriesUrl(BCB_SERIES.SELIC_META, 1));
    expect(calledUrls).toContain(buildBcbSeriesUrl(BCB_SERIES.CDI_ANNUAL, 1));
    expect(calledUrls).toContain(buildBcbSeriesUrl(BCB_SERIES.CDI_DAILY, 1));
    expect(calledUrls).toContain(buildBcbSeriesUrl(BCB_SERIES.IPCA_MONTHLY, 12));
    expect(calledUrls).toContain(buildBcbSeriesUrl(BCB_SERIES.IPCA_12M, 1));

    for (const [, init] of fetchMock.mock.calls) {
      expect(init?.headers).toEqual({ Accept: "application/json" });
      expect(init?.signal).toBeInstanceOf(AbortSignal);
    }

    expect(result.selicMetaAnnual).toBe(14.75);
    expect(result.selicDate).toBe("2026-05-07");
    expect(result.cdiAnnual).toBe(14.65);
    expect(result.cdiDaily).toBe(0.0542);
    expect(result.cdiDate).toBe("2026-05-08");
    expect(result.ipcaMonthly).toBe(0.45);
    expect(result.ipca12m).toBe(4.91);
    expect(result.ipcaDate).toBe("2026-04-01");
    expect(result.ipcaHistory).toHaveLength(12);
    expect(result.ipcaHistory[0]).toEqual({ date: "2025-05-01", value: 0.4 });
    expect(result.ipcaHistory[11]).toEqual({ date: "2026-04-01", value: 0.45 });
    expect(result.source).toBe("bcb_sgs");
    expect(result.isStale).toBe(false);
    expect(result.fetchedAt).toBe("2026-05-09T15:00:00.000Z");
  });

  it("still returns live bcb_sgs with cdiDaily=null when optional series 12 fails", async () => {
    const fetchMock = createStandardBcbFetch({
      [BCB_SERIES.CDI_DAILY]: () => jsonResponse({ error: "Not found" }, 404),
    });

    const result = await getMacroIndicators({
      fetchImpl: fetchMock,
      retryDelayMs: 0,
      skipDb: true,
    });

    expect(result.source).toBe("bcb_sgs");
    expect(result.isStale).toBe(false);
    expect(result.cdiAnnual).toBe(14.65);
    expect(result.cdiDaily).toBeNull();
  });

  it("computes compound 12m IPCA from series 433 automatically when series 13522 fails", async () => {
    const fetchMock = createStandardBcbFetch({
      [BCB_SERIES.IPCA_12M]: () => jsonResponse({ error: "Service down" }, 503),
    });

    const result = await getMacroIndicators({
      fetchImpl: fetchMock,
      retryDelayMs: 0,
      skipDb: true,
    });

    expect(result.source).toBe("bcb_sgs");
    expect(result.isStale).toBe(false);
    expect(result.ipcaHistory).toHaveLength(12);
    expect(result.ipca12m).toBe(computeCompound12mIpca(result.ipcaHistory));
    expect(result.ipca12m).toBe(4.9);
  });

  it("falls back when series 13522 fails and series 433 has fewer than 12 points", async () => {
    const fetchMock = createStandardBcbFetch({
      [BCB_SERIES.IPCA_12M]: () => jsonResponse({ error: "Service down" }, 503),
      [BCB_SERIES.IPCA_MONTHLY]: () =>
        jsonResponse(TWELVE_IPCA_MONTHLY_ROWS.slice(-6)),
    });

    const result = await getMacroIndicators({
      fetchImpl: fetchMock,
      retryDelayMs: 0,
      skipDb: true,
    });

    expect(result.source).toBe("fallback");
    expect(result.isStale).toBe(true);
  });

  it("rejects payloads with NaN values or invalid BCB dates and falls back safely", async () => {
    const nanFetch = createStandardBcbFetch({
      [BCB_SERIES.SELIC_META]: () =>
        jsonResponse([{ data: "07/05/2026", valor: "NaN" }]),
    });

    const nanResult = await getMacroIndicators({
      fetchImpl: nanFetch,
      retryDelayMs: 0,
      skipDb: true,
    });

    expect(nanResult.source).toBe("fallback");
    expect(nanResult.isStale).toBe(true);
    // Validation errors are non-retryable: 5 calls total, no retry on Selic
    expect(nanFetch).toHaveBeenCalledTimes(5);

    clearBcbCache();

    const invalidDateFetch = createStandardBcbFetch({
      [BCB_SERIES.CDI_ANNUAL]: () =>
        jsonResponse([{ data: "31/02/2026", valor: "14.65" }]),
    });

    const invalidDateResult = await getMacroIndicators({
      fetchImpl: invalidDateFetch,
      retryDelayMs: 0,
      skipDb: true,
    });

    expect(invalidDateResult.source).toBe("fallback");
    expect(invalidDateResult.isStale).toBe(true);
  });

  it("retries once on transient 500 and network errors and succeeds on attempt 2", async () => {
    let selicAttempts = 0;
    let cdiAttempts = 0;

    const fetchMock = createStandardBcbFetch({
      [BCB_SERIES.SELIC_META]: () => {
        selicAttempts += 1;
        if (selicAttempts === 1) {
          return jsonResponse({ error: "Internal Server Error" }, 500);
        }
        return jsonResponse([{ data: "07/05/2026", valor: "14.75" }]);
      },
      [BCB_SERIES.CDI_ANNUAL]: () => {
        cdiAttempts += 1;
        if (cdiAttempts === 1) {
          return Promise.reject(new TypeError("network socket hang up"));
        }
        return jsonResponse([{ data: "08/05/2026", valor: "14.65" }]);
      },
    });

    const result = await getMacroIndicators({
      fetchImpl: fetchMock,
      retryDelayMs: 0,
      skipDb: true,
    });

    expect(selicAttempts).toBe(2);
    expect(cdiAttempts).toBe(2);
    expect(fetchMock).toHaveBeenCalledTimes(7); // 5 initial + 2 retries
    expect(result.source).toBe("bcb_sgs");
    expect(result.isStale).toBe(false);
    expect(result.selicMetaAnnual).toBe(14.75);
    expect(result.cdiAnnual).toBe(14.65);
  });

  it("returns validated static fallback with isStale=true on total BCB failure", async () => {
    const failingFetch = vi.fn<typeof fetch>(() =>
      Promise.reject(new TypeError("ECONNREFUSED")),
    );

    const result = await getMacroIndicators({
      fetchImpl: failingFetch,
      retryDelayMs: 0,
      skipDb: true,
    });

    expect(() => MacroIndicatorsSchema.parse(result)).not.toThrow();
    expect(result.source).toBe("fallback");
    expect(result.isStale).toBe(true);
    expect(result.selicMetaAnnual).toBeGreaterThan(0);
    expect(result.cdiAnnual).toBeGreaterThan(0);
    expect(result.ipcaHistory).toHaveLength(12);
    expect(result.selicDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(result.ipcaDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // 5 series * 2 attempts (1 initial + 1 retry)
    expect(failingFetch).toHaveBeenCalledTimes(10);
  });

  it("serves from in-memory TTL cache until expired or bypassed with forceRefresh", async () => {
    let currentSelic = "14.75";
    const fetchMock = createStandardBcbFetch({
      [BCB_SERIES.SELIC_META]: () =>
        jsonResponse([{ data: "07/05/2026", valor: currentSelic }]),
    });

    let clock = Date.parse("2026-05-09T10:00:00.000Z");

    const first = await getMacroIndicators({
      fetchImpl: fetchMock,
      retryDelayMs: 0,
      skipDb: true,
      now: () => clock,
    });
    expect(first.selicMetaAnnual).toBe(14.75);
    expect(fetchMock).toHaveBeenCalledTimes(5);

    // Mutating returned object must not corrupt cached snapshot
    first.ipcaHistory[0].value = 999;

    // 30 minutes later: cache hit, no extra fetch
    clock += 30 * 60 * 1000;
    currentSelic = "15.00";
    const cached = await getMacroIndicators({
      fetchImpl: fetchMock,
      retryDelayMs: 0,
      skipDb: true,
      now: () => clock,
    });
    expect(fetchMock).toHaveBeenCalledTimes(5);
    expect(cached.selicMetaAnnual).toBe(14.75);
    expect(cached.ipcaHistory[0].value).toBe(0.4);

    // Explicit forceRefresh bypasses TTL cache
    const refreshed = await getMacroIndicators({
      forceRefresh: true,
      fetchImpl: fetchMock,
      retryDelayMs: 0,
      skipDb: true,
      now: () => clock,
    });
    expect(fetchMock).toHaveBeenCalledTimes(10);
    expect(refreshed.selicMetaAnnual).toBe(15);

    // Advance past 1-hour TTL: cache expires and triggers fresh fetch
    clock += DEFAULT_BCB_CACHE_TTL_MS + 1;
    currentSelic = "15.25";
    const afterExpiry = await getMacroIndicators({
      fetchImpl: fetchMock,
      retryDelayMs: 0,
      skipDb: true,
      now: () => clock,
    });
    expect(fetchMock).toHaveBeenCalledTimes(15);
    expect(afterExpiry.selicMetaAnnual).toBe(15.25);
  });

  it("persists MacroSnapshot best-effort when DB is configured without failing live response", async () => {
    prismaMocks.isDatabaseConfigured.mockReturnValue(true);
    prismaMocks.createSnapshot.mockRejectedValueOnce(new Error("DB write timeout"));

    const fetchMock = createStandardBcbFetch();
    const result = await getMacroIndicators({
      fetchImpl: fetchMock,
      retryDelayMs: 0,
    });

    expect(result.source).toBe("bcb_sgs");
    expect(result.isStale).toBe(false);
    expect(prismaMocks.createSnapshot).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalled();
  });

  it("loads latest MacroSnapshot from PostgreSQL as database_cache when live BCB fails", async () => {
    prismaMocks.isDatabaseConfigured.mockReturnValue(true);
    prismaMocks.findFirstSnapshot.mockResolvedValueOnce({
      id: "snap_1",
      selicMetaAnnual: 14.25,
      selicDate: "2026-03-19",
      cdiAnnual: 14.15,
      cdiDaily: 0.0525,
      cdiDate: "2026-03-20",
      ipcaMonthly: 0.56,
      ipca12m: 5.48,
      ipcaDate: "2026-03-01",
      rawPayload: {
        ipcaHistory: [
          { date: "2026-02-01", value: 1.31 },
          { date: "2026-03-01", value: 0.56 },
        ],
      },
      fetchedAt: new Date("2026-03-21T12:00:00.000Z"),
    });

    const failingFetch = vi.fn<typeof fetch>(() =>
      Promise.reject(new TypeError("BCB offline")),
    );

    const result = await getMacroIndicators({
      fetchImpl: failingFetch,
      retryDelayMs: 0,
    });

    expect(() => MacroIndicatorsSchema.parse(result)).not.toThrow();
    expect(result.source).toBe("database_cache");
    expect(result.isStale).toBe(true);
    expect(result.selicMetaAnnual).toBe(14.25);
    expect(result.ipcaHistory).toEqual([
      { date: "2026-02-01", value: 1.31 },
      { date: "2026-03-01", value: 0.56 },
    ]);
    expect(result.fetchedAt).toBe("2026-03-21T12:00:00.000Z");
  });

  it("handles GET /api/indicators with Cache-Control header and ?refresh=true", async () => {
    const fetchMock = createStandardBcbFetch();
    vi.stubGlobal("fetch", fetchMock);

    try {
      const req1 = new NextRequest("http://localhost:3000/api/indicators");
      const res1 = await getIndicatorsRoute(req1);
      expect(res1.status).toBe(200);
      expect(res1.headers.get("Cache-Control")).toBe(
        "public, s-maxage=3600, stale-while-revalidate=86400",
      );

      const body1 = MacroIndicatorsSchema.parse(await res1.json());
      expect(body1.source).toBe("bcb_sgs");
      expect(fetchMock).toHaveBeenCalledTimes(5);

      const req2 = new NextRequest(
        "http://localhost:3000/api/indicators?refresh=true",
      );
      const res2 = await getIndicatorsRoute(req2);
      expect(res2.status).toBe(200);
      expect(fetchMock).toHaveBeenCalledTimes(10);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
