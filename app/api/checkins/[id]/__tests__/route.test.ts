import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CheckInDetail } from "@/lib/types/domain";

const mocks = vi.hoisted(() => ({
  getSessionUser: vi.fn(),
  isDatabaseConfigured: vi.fn<() => boolean>(),
  getProfileIdForUser: vi.fn<(userId: string) => Promise<string | null>>(),
  getCheckInByIdForProfile:
    vi.fn<(id: string, profileId: string) => Promise<CheckInDetail | null>>(),
}));

vi.mock("@/lib/auth/session", () => ({
  getSessionUser: mocks.getSessionUser,
}));

vi.mock("@/lib/db/prisma", () => ({
  isDatabaseConfigured: mocks.isDatabaseConfigured,
}));

vi.mock("@/lib/profile/repository", () => ({
  getProfileIdForUser: mocks.getProfileIdForUser,
}));

vi.mock("@/lib/history/repository", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/history/repository")
  >("@/lib/history/repository");
  return {
    ...actual,
    getCheckInByIdForProfile: mocks.getCheckInByIdForProfile,
  };
});

import { RepositoryHydrationError } from "@/lib/history/repository";
import { GET } from "@/app/api/checkins/[id]/route";

const SESSION_USER = {
  id: "user-1",
  email: "marina@example.com",
  name: "Marina Costa",
};

const SAMPLE_CHECKIN: CheckInDetail = {
  id: "chk-1",
  profileId: "profile-1",
  referenceMonth: "2026-11",
  userNotes: "Mês de revisão.",
  contributionCents: 100_000,
  totalValueCents: 1_000_000,
  adherenceScore: 80,
  macroSnapshot: {
    selicMetaAnnual: 14.75,
    selicDate: "2026-11-01",
    cdiAnnual: 14.65,
    cdiDaily: 0.0542,
    cdiDate: "2026-11-01",
    ipcaMonthly: 0.42,
    ipca12m: 4.85,
    ipcaDate: "2026-10-01",
    ipcaHistory: [{ date: "2026-10-01", value: 0.42 }],
    source: "bcb_sgs",
    fetchedAt: "2026-11-21T12:00:00.000Z",
    isStale: false,
  },
  motorResult: {
    totalCentavos: 1_000_000,
    aporteCentavos: 100_000,
    totalPosAporteCentavos: 1_100_000,
    classes: [],
    aderencia: 80,
    aderenciaPosAporte: 85,
    rendimentoAnualPct: 14.8,
    rendimentoRealPct: 9.5,
    juroRealPct: 9.44,
    versao: "motor-v1",
  },
  aiAnalysis: null,
  newsSources: null,
  positions: [],
  createdAt: "2026-11-21T12:00:00.000Z",
};

function makeContext(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe("GET /api/checkins/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSessionUser.mockResolvedValue(SESSION_USER);
    mocks.isDatabaseConfigured.mockReturnValue(true);
    mocks.getProfileIdForUser.mockResolvedValue("profile-1");
    mocks.getCheckInByIdForProfile.mockResolvedValue(SAMPLE_CHECKIN);
  });

  it("returns 401 when user is unauthenticated", async () => {
    mocks.getSessionUser.mockResolvedValue(null);

    const request = new NextRequest("http://localhost:3000/api/checkins/chk-1");
    const response = await GET(request, makeContext("chk-1"));

    expect(response.status).toBe(401);
    expect(mocks.getCheckInByIdForProfile).not.toHaveBeenCalled();
  });

  it("returns 400 when check-in id is blank", async () => {
    const request = new NextRequest("http://localhost:3000/api/checkins/%20");
    const response = await GET(request, makeContext("   "));

    expect(response.status).toBe(400);
    expect(mocks.getCheckInByIdForProfile).not.toHaveBeenCalled();
  });

  it("returns 503 when database is not configured", async () => {
    mocks.isDatabaseConfigured.mockReturnValue(false);

    const request = new NextRequest("http://localhost:3000/api/checkins/chk-1");
    const response = await GET(request, makeContext("chk-1"));

    expect(response.status).toBe(503);
    expect(mocks.getCheckInByIdForProfile).not.toHaveBeenCalled();
  });

  it("returns 404 when authenticated user has no profile", async () => {
    mocks.getProfileIdForUser.mockResolvedValue(null);

    const request = new NextRequest("http://localhost:3000/api/checkins/chk-1");
    const response = await GET(request, makeContext("chk-1"));

    expect(response.status).toBe(404);
    expect(mocks.getCheckInByIdForProfile).not.toHaveBeenCalled();
  });

  it("returns 404 when check-in belongs to another profile (IDOR guard)", async () => {
    mocks.getCheckInByIdForProfile.mockResolvedValue(null);

    const request = new NextRequest(
      "http://localhost:3000/api/checkins/chk-other-user",
    );
    const response = await GET(request, makeContext("chk-other-user"));

    expect(response.status).toBe(404);
    expect(mocks.getCheckInByIdForProfile).toHaveBeenCalledWith(
      "chk-other-user",
      "profile-1",
    );
  });

  it("returns 200 with check-in detail when it belongs to the session profile", async () => {
    const request = new NextRequest("http://localhost:3000/api/checkins/chk-1");
    const response = await GET(request, makeContext("chk-1"));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(json.id).toBe("chk-1");
    expect(json.profileId).toBe("profile-1");
  });

  it("returns 500 on RepositoryHydrationError", async () => {
    mocks.getCheckInByIdForProfile.mockRejectedValue(
      new RepositoryHydrationError("Corrupted JSON"),
    );

    const request = new NextRequest("http://localhost:3000/api/checkins/chk-1");
    const response = await GET(request, makeContext("chk-1"));

    expect(response.status).toBe(500);
  });
});
