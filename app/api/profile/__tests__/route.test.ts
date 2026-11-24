import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionUser } from "@/lib/auth/session";
import type { InvestorProfileWithAssets } from "@/lib/history/repository";

const mocks = vi.hoisted(() => ({
  getSessionUser: vi.fn<() => Promise<SessionUser | null>>(),
  isDatabaseConfigured: vi.fn<() => boolean>(),
  getProfileForUser: vi.fn(),
  createProfileForUser: vi.fn(),
  updateProfileForUser: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({
  getSessionUser: mocks.getSessionUser,
}));

vi.mock("@/lib/db/prisma", () => ({
  isDatabaseConfigured: mocks.isDatabaseConfigured,
}));

vi.mock("@/lib/profile/repository", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/profile/repository")
  >("@/lib/profile/repository");
  return {
    ...actual,
    getProfileForUser: mocks.getProfileForUser,
    createProfileForUser: mocks.createProfileForUser,
    updateProfileForUser: mocks.updateProfileForUser,
  };
});

import { ProfileAlreadyExistsError } from "@/lib/profile/repository";
import { GET, PATCH, POST } from "@/app/api/profile/route";

const USER: SessionUser = {
  id: "user-1",
  email: "ana@example.com",
  name: "Ana",
};

const SAMPLE_PROFILE: InvestorProfileWithAssets = {
  id: "profile-1",
  name: "Ana Souza",
  email: "ana@example.com",
  riskProfile: "moderado",
  horizonMonths: 60,
  monthlyIncomeCents: 800_000,
  goals: [{ title: "Reserva", targetAmountCents: 2_000_000, priority: "alta" }],
  targetAllocation: { renda_fixa_pos: 60, acoes: 40 },
  preferences: null,
  createdAt: "2026-11-01T10:00:00.000Z",
  updatedAt: "2026-11-01T10:00:00.000Z",
  assets: [],
};

const VALID_CREATE_BODY = {
  name: "Ana Souza",
  riskProfile: "moderado",
  horizonMonths: 60,
  monthlyIncomeCents: 800_000,
  goals: [{ title: "Reserva", targetAmountCents: 2_000_000, priority: "alta" }],
  targetAllocation: { renda_fixa_pos: 60, acoes: 40 },
};

function makeJsonRequest(method: string, body: unknown): NextRequest {
  return new NextRequest("http://localhost:3000/api/profile", {
    method,
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSessionUser.mockResolvedValue(USER);
  mocks.isDatabaseConfigured.mockReturnValue(true);
});

describe("GET /api/profile", () => {
  it("returns 401 when no user is logged in", async () => {
    mocks.getSessionUser.mockResolvedValue(null);

    const response = await GET();

    expect(response.status).toBe(401);
    expect(mocks.getProfileForUser).not.toHaveBeenCalled();
  });

  it("returns 503 when database is not configured", async () => {
    mocks.isDatabaseConfigured.mockReturnValue(false);

    const response = await GET();
    const json = await response.json();

    expect(response.status).toBe(503);
    expect(json.error).toContain("DATABASE_URL");
  });

  it("returns 404 when the user has no profile yet", async () => {
    mocks.getProfileForUser.mockResolvedValue(null);

    const response = await GET();
    const json = await response.json();

    expect(response.status).toBe(404);
    expect(json.error).toContain("POST /api/profile");
  });

  it("returns 200 with the logged user's profile", async () => {
    mocks.getProfileForUser.mockResolvedValue(SAMPLE_PROFILE);

    const response = await GET();
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(json.profile.id).toBe("profile-1");
    expect(mocks.getProfileForUser).toHaveBeenCalledWith("user-1");
  });
});

describe("POST /api/profile", () => {
  it("returns 401 when no user is logged in", async () => {
    mocks.getSessionUser.mockResolvedValue(null);

    const response = await POST(makeJsonRequest("POST", VALID_CREATE_BODY));

    expect(response.status).toBe(401);
    expect(mocks.createProfileForUser).not.toHaveBeenCalled();
  });

  it("returns 400 on malformed JSON", async () => {
    const response = await POST(makeJsonRequest("POST", "{invalido"));
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error).toContain("JSON válido");
  });

  it("returns 400 with details on schema validation error", async () => {
    const response = await POST(
      makeJsonRequest("POST", { ...VALID_CREATE_BODY, riskProfile: "agressivo" }),
    );
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.details.fieldErrors.riskProfile).toBeDefined();
    expect(mocks.createProfileForUser).not.toHaveBeenCalled();
  });

  it("returns 400 when target allocation exceeds 100%", async () => {
    const response = await POST(
      makeJsonRequest("POST", {
        ...VALID_CREATE_BODY,
        targetAllocation: { renda_fixa_pos: 70, acoes: 40 },
      }),
    );

    expect(response.status).toBe(400);
  });

  it("returns 201 and creates the profile tied to the session user", async () => {
    mocks.createProfileForUser.mockResolvedValue(SAMPLE_PROFILE);

    const response = await POST(makeJsonRequest("POST", VALID_CREATE_BODY));
    const json = await response.json();

    expect(response.status).toBe(201);
    expect(json.profile.id).toBe("profile-1");
    expect(mocks.createProfileForUser).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({ name: "Ana Souza", riskProfile: "moderado" }),
      "ana@example.com",
    );
  });

  it("returns 409 when the user already has a profile", async () => {
    mocks.createProfileForUser.mockRejectedValue(new ProfileAlreadyExistsError());

    const response = await POST(makeJsonRequest("POST", VALID_CREATE_BODY));

    expect(response.status).toBe(409);
  });

  it("returns 500 on unexpected database errors", async () => {
    mocks.createProfileForUser.mockRejectedValue(new Error("boom"));

    const response = await POST(makeJsonRequest("POST", VALID_CREATE_BODY));

    expect(response.status).toBe(500);
  });
});

describe("PATCH /api/profile", () => {
  it("returns 401 when no user is logged in", async () => {
    mocks.getSessionUser.mockResolvedValue(null);

    const response = await PATCH(makeJsonRequest("PATCH", { name: "Outra" }));

    expect(response.status).toBe(401);
  });

  it("returns 400 on empty body", async () => {
    const response = await PATCH(makeJsonRequest("PATCH", {}));

    expect(response.status).toBe(400);
    expect(mocks.updateProfileForUser).not.toHaveBeenCalled();
  });

  it("returns 400 on unknown fields (e.g. trying to change id or userId)", async () => {
    const response = await PATCH(
      makeJsonRequest("PATCH", { name: "Ana", userId: "outro-usuario" }),
    );

    expect(response.status).toBe(400);
    expect(mocks.updateProfileForUser).not.toHaveBeenCalled();
  });

  it("sends only the provided fields (no default goals) to the repository", async () => {
    mocks.updateProfileForUser.mockResolvedValue({
      ...SAMPLE_PROFILE,
      horizonMonths: 120,
    });

    const response = await PATCH(makeJsonRequest("PATCH", { horizonMonths: 120 }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.profile.horizonMonths).toBe(120);
    expect(mocks.updateProfileForUser).toHaveBeenCalledWith("user-1", {
      horizonMonths: 120,
    });
  });

  it("returns 404 when the user has no profile", async () => {
    mocks.updateProfileForUser.mockResolvedValue(null);

    const response = await PATCH(makeJsonRequest("PATCH", { name: "Ana" }));

    expect(response.status).toBe(404);
  });
});
