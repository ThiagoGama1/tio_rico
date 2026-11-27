import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionUser } from "@/lib/auth/session";

const mocks = vi.hoisted(() => ({
  getSessionUser: vi.fn<() => Promise<SessionUser | null>>(),
}));

vi.mock("@/lib/auth/session", () => ({
  getSessionUser: mocks.getSessionUser,
}));

import { POST } from "@/app/api/motor/projecao/route";

const USER: SessionUser = { id: "user-1", email: "ana@example.com", name: "Ana" };

function makeJsonPostRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost:3000/api/motor/projecao", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("POST /api/motor/projecao", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSessionUser.mockResolvedValue(USER);
  });

  it("returns 401 when no user is logged in", async () => {
    mocks.getSessionUser.mockResolvedValue(null);

    const response = await POST(
      makeJsonPostRequest({ aporteMensalCentavos: 1, taxaAnualPct: 10, meses: 12 }),
    );

    expect(response.status).toBe(401);
  });

  it("returns 400 on malformed JSON", async () => {
    const response = await POST(makeJsonPostRequest("{"));

    expect(response.status).toBe(400);
  });

  it("returns 400 when meses is out of range or cents are not integers", async () => {
    const response = await POST(
      makeJsonPostRequest({ aporteMensalCentavos: 10.5, taxaAnualPct: 10, meses: 5000 }),
    );
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.details.fieldErrors.meses).toBeDefined();
    expect(json.details.fieldErrors.aporteMensalCentavos).toBeDefined();
  });

  it("returns the projection with yearly points", async () => {
    const response = await POST(
      makeJsonPostRequest({
        valorInicialCentavos: 100_000,
        aporteMensalCentavos: 0,
        taxaAnualPct: 12,
        meses: 30,
      }),
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(json.pontos.map((p: { mes: number }) => p.mes)).toEqual([12, 24, 30]);
    expect(json.pontos[0].valorCentavos).toBe(112_000);
    expect(json.totalAportadoCentavos).toBe(100_000);
    expect(json.rendimentoCentavos).toBe(json.valorFinalCentavos - 100_000);
    expect(json.taxaMensalPct).toBeCloseTo(0.9489, 4);
    expect(json.meta).toBeNull();
  });

  it("reports months until the goal and whether it fits the horizon", async () => {
    const response = await POST(
      makeJsonPostRequest({
        aporteMensalCentavos: 1_000,
        taxaAnualPct: 0,
        meses: 6,
        metaCentavos: 12_000,
      }),
    );
    const json = await response.json();

    expect(json.meta).toEqual({ metaCentavos: 12_000, mesesAteMeta: 12, atingeNoPrazo: false });
  });

  it("returns mesesAteMeta null when the goal is never reached", async () => {
    const response = await POST(
      makeJsonPostRequest({
        valorInicialCentavos: 1_000,
        aporteMensalCentavos: 0,
        taxaAnualPct: 0,
        meses: 12,
        metaCentavos: 2_000,
      }),
    );
    const json = await response.json();

    expect(json.meta.mesesAteMeta).toBeNull();
    expect(json.meta.atingeNoPrazo).toBe(false);
  });
});
