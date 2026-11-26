import { beforeEach, describe, expect, it, vi } from "vitest";
import type { InvestorProfileWithAssets } from "@/lib/history/repository";
import type { CheckInDetail } from "@/lib/types/domain";

const mocks = vi.hoisted(() => ({
  getSessionUser: vi.fn(),
  isDatabaseConfigured: vi.fn<() => boolean>(),
  getProfileForUser:
    vi.fn<(userId: string) => Promise<InvestorProfileWithAssets | null>>(),
  listCheckIns: vi.fn<
    (
      profileId?: string,
      options?: { limit?: number; order?: "asc" | "desc" },
    ) => Promise<CheckInDetail[]>
  >(),
}));

vi.mock("@/lib/auth/session", () => ({
  getSessionUser: mocks.getSessionUser,
}));

vi.mock("@/lib/db/prisma", () => ({
  isDatabaseConfigured: mocks.isDatabaseConfigured,
}));

vi.mock("@/lib/profile/repository", () => ({
  getProfileForUser: mocks.getProfileForUser,
}));

vi.mock("@/lib/history/repository", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/history/repository")
  >("@/lib/history/repository");
  return {
    ...actual,
    listCheckIns: mocks.listCheckIns,
  };
});

import { RepositoryHydrationError } from "@/lib/history/repository";
import { GET } from "@/app/api/portfolio/evolution/route";

const SESSION_USER = {
  id: "user-1",
  email: "marina@example.com",
  name: "Marina Costa",
};

const SAMPLE_PROFILE: InvestorProfileWithAssets = {
  id: "profile-1",
  name: "Marina Costa",
  email: "marina@example.com",
  riskProfile: "moderado",
  horizonMonths: 60,
  monthlyIncomeCents: 1_200_000,
  goals: [],
  targetAllocation: {
    renda_fixa_pos: 60,
    acoes: 40,
  },
  preferences: null,
  createdAt: "2026-08-01T10:00:00.000Z",
  updatedAt: "2026-11-01T10:00:00.000Z",
  assets: [],
};

const SAMPLE_CHECKIN: CheckInDetail = {
  id: "chk-1",
  profileId: "profile-1",
  referenceMonth: "2026-11",
  userNotes: "Primeiro check-in.",
  contributionCents: 100_000,
  totalValueCents: 1_000_000,
  adherenceScore: 84,
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
    classes: [
      {
        classe: "renda_fixa_pos",
        valorCentavos: 680_000,
        atualPct: 68,
        alvoPct: 60,
        desvioPct: 8,
        aporteCentavos: 0,
        posAportePct: 61.82,
      },
      {
        classe: "acoes",
        valorCentavos: 320_000,
        atualPct: 32,
        alvoPct: 40,
        desvioPct: -8,
        aporteCentavos: 100_000,
        posAportePct: 38.18,
      },
    ],
    aderencia: 84,
    aderenciaPosAporte: 96.36,
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

describe("GET /api/portfolio/evolution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSessionUser.mockResolvedValue(SESSION_USER);
    mocks.isDatabaseConfigured.mockReturnValue(true);
    mocks.getProfileForUser.mockResolvedValue(SAMPLE_PROFILE);
    mocks.listCheckIns.mockResolvedValue([SAMPLE_CHECKIN]);
  });

  it("returns 401 when user is unauthenticated", async () => {
    mocks.getSessionUser.mockResolvedValue(null);

    const response = await GET();

    expect(response.status).toBe(401);
    expect(mocks.getProfileForUser).not.toHaveBeenCalled();
  });

  it("returns 503 when database is not configured", async () => {
    mocks.isDatabaseConfigured.mockReturnValue(false);

    const response = await GET();

    expect(response.status).toBe(503);
    expect(mocks.getProfileForUser).not.toHaveBeenCalled();
  });

  it("returns 404 when authenticated user has no profile", async () => {
    mocks.getProfileForUser.mockResolvedValue(null);

    const response = await GET();

    expect(response.status).toBe(404);
    expect(mocks.getProfileForUser).toHaveBeenCalledWith("user-1");
  });

  it("returns 200 with profile, evolution and checkInsCount scoped to session user", async () => {
    const response = await GET();
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(mocks.getProfileForUser).toHaveBeenCalledWith("user-1");
    expect(mocks.listCheckIns).toHaveBeenCalledWith("profile-1", {
      order: "asc",
    });
    expect(json.profile.id).toBe("profile-1");
    expect(json.checkInsCount).toBe(1);
    expect(json.evolution.totalCheckIns).toBe(1);
    expect(json.evolution.latestTotalCents).toBe(1_000_000);
  });

  it("returns 500 on RepositoryHydrationError", async () => {
    mocks.listCheckIns.mockRejectedValue(
      new RepositoryHydrationError("Corrupted check-in"),
    );

    const response = await GET();

    expect(response.status).toBe(500);
  });
});