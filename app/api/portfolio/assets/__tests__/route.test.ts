import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionUser } from "@/lib/auth/session";
import type { PortfolioAssetRecord } from "@/lib/history/repository";

const mocks = vi.hoisted(() => ({
  getSessionUser: vi.fn<() => Promise<SessionUser | null>>(),
  isDatabaseConfigured: vi.fn<() => boolean>(),
  listAssetsForUser: vi.fn(),
  getAssetForUser: vi.fn(),
  createAssetForUser: vi.fn(),
  updateAssetForUser: vi.fn(),
  deleteAssetForUser: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({
  getSessionUser: mocks.getSessionUser,
}));

vi.mock("@/lib/db/prisma", () => ({
  isDatabaseConfigured: mocks.isDatabaseConfigured,
}));

vi.mock("@/lib/portfolio/repository", () => ({
  listAssetsForUser: mocks.listAssetsForUser,
  getAssetForUser: mocks.getAssetForUser,
  createAssetForUser: mocks.createAssetForUser,
  updateAssetForUser: mocks.updateAssetForUser,
  deleteAssetForUser: mocks.deleteAssetForUser,
}));

import { GET as LIST, POST } from "@/app/api/portfolio/assets/route";
import {
  DELETE,
  GET as GET_ONE,
  PATCH,
} from "@/app/api/portfolio/assets/[id]/route";

const USER: SessionUser = { id: "user-1", email: "ana@example.com", name: "Ana" };

const ASSET: PortfolioAssetRecord = {
  id: "asset-1",
  profileId: "profile-1",
  name: "Tesouro Selic 2029",
  assetClass: "renda_fixa_pos",
  amountCents: 700_000,
  indexer: "SELIC",
  indexerRate: 100,
  liquidity: "D+0",
  createdAt: "2026-11-01T10:00:00.000Z",
  updatedAt: "2026-11-01T10:00:00.000Z",
};

const BASE_URL = "http://localhost:3000/api/portfolio/assets";

function makeJsonRequest(url: string, method: string, body: unknown): NextRequest {
  return new NextRequest(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function paramsFor(id: string) {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSessionUser.mockResolvedValue(USER);
  mocks.isDatabaseConfigured.mockReturnValue(true);
});

describe("GET /api/portfolio/assets", () => {
  it("returns 401 when no user is logged in", async () => {
    mocks.getSessionUser.mockResolvedValue(null);

    const response = await LIST();

    expect(response.status).toBe(401);
    expect(mocks.listAssetsForUser).not.toHaveBeenCalled();
  });

  it("returns 503 when database is not configured", async () => {
    mocks.isDatabaseConfigured.mockReturnValue(false);

    const response = await LIST();

    expect(response.status).toBe(503);
  });

  it("returns 404 when the user has no profile", async () => {
    mocks.listAssetsForUser.mockResolvedValue(null);

    const response = await LIST();

    expect(response.status).toBe(404);
  });

  it("returns 200 with assets and total, scoped to the session user", async () => {
    mocks.listAssetsForUser.mockResolvedValue([
      ASSET,
      { ...ASSET, id: "asset-2", amountCents: 300_000 },
    ]);

    const response = await LIST();
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(json.assets).toHaveLength(2);
    expect(json.totalCents).toBe(1_000_000);
    expect(mocks.listAssetsForUser).toHaveBeenCalledWith("user-1");
  });
});

describe("POST /api/portfolio/assets", () => {
  const body = {
    name: "CDB Banco X",
    assetClass: "renda_fixa_pos",
    amountCents: 250_000,
    indexer: "CDI",
    indexerRate: 110,
    liquidity: "D+1",
  };

  it("returns 401 when no user is logged in", async () => {
    mocks.getSessionUser.mockResolvedValue(null);

    const response = await POST(makeJsonRequest(BASE_URL, "POST", body));

    expect(response.status).toBe(401);
  });

  it("returns 400 on malformed JSON", async () => {
    const response = await POST(makeJsonRequest(BASE_URL, "POST", "{"));

    expect(response.status).toBe(400);
  });

  it("returns 400 on invalid asset class or negative amount", async () => {
    const response = await POST(
      makeJsonRequest(BASE_URL, "POST", {
        ...body,
        assetClass: "imoveis",
        amountCents: -1,
      }),
    );
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.details.fieldErrors.assetClass).toBeDefined();
    expect(json.details.fieldErrors.amountCents).toBeDefined();
  });

  it("returns 400 when the client tries to set id or profileId", async () => {
    const response = await POST(
      makeJsonRequest(BASE_URL, "POST", { ...body, profileId: "profile-alheio" }),
    );

    expect(response.status).toBe(400);
    expect(mocks.createAssetForUser).not.toHaveBeenCalled();
  });

  it("returns 201 with the created asset", async () => {
    mocks.createAssetForUser.mockResolvedValue({ ...ASSET, ...body, id: "asset-9" });

    const response = await POST(makeJsonRequest(BASE_URL, "POST", body));
    const json = await response.json();

    expect(response.status).toBe(201);
    expect(json.asset.id).toBe("asset-9");
    expect(mocks.createAssetForUser).toHaveBeenCalledWith("user-1", body);
  });

  it("returns 404 when the user has no profile", async () => {
    mocks.createAssetForUser.mockResolvedValue(null);

    const response = await POST(makeJsonRequest(BASE_URL, "POST", body));

    expect(response.status).toBe(404);
  });
});

describe("GET /api/portfolio/assets/:id", () => {
  it("returns 404 when the asset is missing or belongs to another user", async () => {
    mocks.getAssetForUser.mockResolvedValue(null);

    const response = await GET_ONE(
      new NextRequest(`${BASE_URL}/asset-alheio`),
      paramsFor("asset-alheio"),
    );

    expect(response.status).toBe(404);
    expect(mocks.getAssetForUser).toHaveBeenCalledWith("user-1", "asset-alheio");
  });

  it("returns 200 with the asset", async () => {
    mocks.getAssetForUser.mockResolvedValue(ASSET);

    const response = await GET_ONE(
      new NextRequest(`${BASE_URL}/asset-1`),
      paramsFor("asset-1"),
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.asset.id).toBe("asset-1");
  });

  it("returns 400 on blank id", async () => {
    const response = await GET_ONE(
      new NextRequest(`${BASE_URL}/%20`),
      paramsFor("  "),
    );

    expect(response.status).toBe(400);
  });
});

describe("PATCH /api/portfolio/assets/:id", () => {
  it("returns 401 when no user is logged in", async () => {
    mocks.getSessionUser.mockResolvedValue(null);

    const response = await PATCH(
      makeJsonRequest(`${BASE_URL}/asset-1`, "PATCH", { amountCents: 1 }),
      paramsFor("asset-1"),
    );

    expect(response.status).toBe(401);
  });

  it("returns 400 on empty body", async () => {
    const response = await PATCH(
      makeJsonRequest(`${BASE_URL}/asset-1`, "PATCH", {}),
      paramsFor("asset-1"),
    );

    expect(response.status).toBe(400);
    expect(mocks.updateAssetForUser).not.toHaveBeenCalled();
  });

  it("returns 200 and forwards only the changed fields", async () => {
    mocks.updateAssetForUser.mockResolvedValue({ ...ASSET, amountCents: 900_000 });

    const response = await PATCH(
      makeJsonRequest(`${BASE_URL}/asset-1`, "PATCH", { amountCents: 900_000 }),
      paramsFor("asset-1"),
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.asset.amountCents).toBe(900_000);
    expect(mocks.updateAssetForUser).toHaveBeenCalledWith("user-1", "asset-1", {
      amountCents: 900_000,
    });
  });

  it("returns 404 when the asset belongs to another user", async () => {
    mocks.updateAssetForUser.mockResolvedValue(null);

    const response = await PATCH(
      makeJsonRequest(`${BASE_URL}/asset-alheio`, "PATCH", { name: "X" }),
      paramsFor("asset-alheio"),
    );

    expect(response.status).toBe(404);
  });
});

describe("DELETE /api/portfolio/assets/:id", () => {
  it("returns 401 when no user is logged in", async () => {
    mocks.getSessionUser.mockResolvedValue(null);

    const response = await DELETE(
      new NextRequest(`${BASE_URL}/asset-1`, { method: "DELETE" }),
      paramsFor("asset-1"),
    );

    expect(response.status).toBe(401);
    expect(mocks.deleteAssetForUser).not.toHaveBeenCalled();
  });

  it("returns 200 when the asset is removed", async () => {
    mocks.deleteAssetForUser.mockResolvedValue(true);

    const response = await DELETE(
      new NextRequest(`${BASE_URL}/asset-1`, { method: "DELETE" }),
      paramsFor("asset-1"),
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({ ok: true, id: "asset-1" });
    expect(mocks.deleteAssetForUser).toHaveBeenCalledWith("user-1", "asset-1");
  });

  it("returns 404 when the asset is missing or belongs to another user", async () => {
    mocks.deleteAssetForUser.mockResolvedValue(false);

    const response = await DELETE(
      new NextRequest(`${BASE_URL}/asset-alheio`, { method: "DELETE" }),
      paramsFor("asset-alheio"),
    );

    expect(response.status).toBe(404);
  });
});
