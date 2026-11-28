import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  apagarDemosAntigas: vi.fn(),
  apagarLimitesVencidos: vi.fn(),
  isDatabaseConfigured: vi.fn<() => boolean>(),
}));

vi.mock("@/lib/auth/demo", () => ({ apagarDemosAntigas: mocks.apagarDemosAntigas }));
vi.mock("@/lib/security/rate-limit", () => ({
  apagarLimitesVencidos: mocks.apagarLimitesVencidos,
}));
vi.mock("@/lib/db/prisma", () => ({ isDatabaseConfigured: mocks.isDatabaseConfigured }));

import { GET } from "@/app/api/cron/limpar-demo/route";

const original = process.env.CRON_SECRET;

function req(authorization?: string) {
  return new NextRequest("http://localhost:3000/api/cron/limpar-demo", {
    headers: authorization ? { authorization } : {},
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = "segredo-de-teste";
  mocks.isDatabaseConfigured.mockReturnValue(true);
  mocks.apagarDemosAntigas.mockResolvedValue({ usuarios: 3, perfis: 3 });
  mocks.apagarLimitesVencidos.mockResolvedValue(7);
});

afterEach(() => {
  process.env.CRON_SECRET = original;
});

describe("GET /api/cron/limpar-demo", () => {
  it("refuses everything when CRON_SECRET is not configured", async () => {
    delete process.env.CRON_SECRET;

    const response = await GET(req("Bearer qualquer"));

    expect(response.status).toBe(503);
    expect(mocks.apagarDemosAntigas).not.toHaveBeenCalled();
  });

  it("returns 401 without the right secret", async () => {
    expect((await GET(req())).status).toBe(401);
    expect((await GET(req("Bearer errado"))).status).toBe(401);
    expect(mocks.apagarDemosAntigas).not.toHaveBeenCalled();
  });

  it("cleans old demo accounts and expired rate limits with the right secret", async () => {
    const response = await GET(req("Bearer segredo-de-teste"));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({
      ok: true,
      demos: { usuarios: 3, perfis: 3 },
      limitesApagados: 7,
    });
  });
});
