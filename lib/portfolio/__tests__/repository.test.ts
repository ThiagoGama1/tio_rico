import { beforeEach, describe, expect, it, vi } from "vitest";

const prisma = vi.hoisted(() => ({
  investorProfile: {
    findUnique: vi.fn(),
  },
  portfolioAsset: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    count: vi.fn(),
    updateMany: vi.fn(),
    deleteMany: vi.fn(),
  },
}));

vi.mock("@/lib/db/prisma", () => ({
  getPrisma: () => prisma,
  isDatabaseConfigured: () => true,
}));

import {
  createAssetForUser,
  deleteAssetForUser,
  getAssetForUser,
  listAssetsForUser,
  PortfolioLimitError,
  updateAssetForUser,
} from "@/lib/portfolio/repository";

const ROW = {
  id: "asset-1",
  profileId: "profile-1",
  name: "Tesouro Selic",
  assetClass: "renda_fixa_pos",
  amountCents: 700_000,
  indexer: "SELIC",
  indexerRate: 100,
  liquidity: "D+0",
  createdAt: new Date("2026-11-01T10:00:00.000Z"),
  updatedAt: new Date("2026-11-02T10:00:00.000Z"),
};

const OWNED_BY_USER_1 = { profile: { userId: "user-1" } };

beforeEach(() => {
  vi.clearAllMocks();
  prisma.investorProfile.findUnique.mockResolvedValue({ id: "profile-1" });
  prisma.portfolioAsset.count.mockResolvedValue(0);
});

describe("portfolio repository — size limit", () => {
  it("refuses a new asset when the portfolio already has 100", async () => {
    prisma.portfolioAsset.count.mockResolvedValue(100);

    await expect(
      createAssetForUser("user-1", { name: "Mais um", assetClass: "acoes", amountCents: 1 }),
    ).rejects.toBeInstanceOf(PortfolioLimitError);
    expect(prisma.portfolioAsset.create).not.toHaveBeenCalled();
  });

  it("counts only the user's own portfolio", async () => {
    prisma.portfolioAsset.create.mockResolvedValue(ROW);

    await createAssetForUser("user-1", { name: "X", assetClass: "acoes", amountCents: 1 });

    expect(prisma.portfolioAsset.count).toHaveBeenCalledWith({
      where: { profileId: "profile-1" },
    });
  });
});

describe("portfolio repository — ownership", () => {
  it("listAssetsForUser filters by the user's profile and owner", async () => {
    prisma.portfolioAsset.findMany.mockResolvedValue([ROW]);

    const assets = await listAssetsForUser("user-1");

    expect(prisma.investorProfile.findUnique).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      select: { id: true },
    });
    expect(prisma.portfolioAsset.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { profileId: "profile-1", ...OWNED_BY_USER_1 },
      }),
    );
    expect(assets).toEqual([
      expect.objectContaining({
        id: "asset-1",
        createdAt: "2026-11-01T10:00:00.000Z",
      }),
    ]);
  });

  it("listAssetsForUser returns null when the user has no profile", async () => {
    prisma.investorProfile.findUnique.mockResolvedValue(null);

    expect(await listAssetsForUser("user-1")).toBeNull();
    expect(prisma.portfolioAsset.findMany).not.toHaveBeenCalled();
  });

  it("getAssetForUser never queries by id alone", async () => {
    prisma.portfolioAsset.findFirst.mockResolvedValue(null);

    expect(await getAssetForUser("user-1", "asset-alheio")).toBeNull();
    expect(prisma.portfolioAsset.findFirst).toHaveBeenCalledWith({
      where: { id: "asset-alheio", ...OWNED_BY_USER_1 },
    });
  });

  it("createAssetForUser writes into the user's own profile", async () => {
    prisma.portfolioAsset.create.mockResolvedValue(ROW);

    await createAssetForUser("user-1", {
      name: "Tesouro Selic",
      assetClass: "renda_fixa_pos",
      amountCents: 700_000,
    });

    expect(prisma.portfolioAsset.create).toHaveBeenCalledWith({
      data: {
        profileId: "profile-1",
        name: "Tesouro Selic",
        assetClass: "renda_fixa_pos",
        amountCents: 700_000,
        indexer: null,
        indexerRate: null,
        liquidity: null,
      },
    });
  });

  it("updateAssetForUser scopes the update and only sets sent fields", async () => {
    prisma.portfolioAsset.updateMany.mockResolvedValue({ count: 1 });
    prisma.portfolioAsset.findFirst.mockResolvedValue({ ...ROW, amountCents: 1 });

    const asset = await updateAssetForUser("user-1", "asset-1", { amountCents: 1 });

    expect(prisma.portfolioAsset.updateMany).toHaveBeenCalledWith({
      where: { id: "asset-1", ...OWNED_BY_USER_1 },
      data: { amountCents: 1 },
    });
    expect(asset?.amountCents).toBe(1);
  });

  it("updateAssetForUser returns null when nothing matched (other user's asset)", async () => {
    prisma.portfolioAsset.updateMany.mockResolvedValue({ count: 0 });

    expect(await updateAssetForUser("user-1", "asset-alheio", { name: "X" })).toBeNull();
    expect(prisma.portfolioAsset.findFirst).not.toHaveBeenCalled();
  });

  it("deleteAssetForUser scopes the delete to the owner", async () => {
    prisma.portfolioAsset.deleteMany.mockResolvedValue({ count: 0 });

    expect(await deleteAssetForUser("user-1", "asset-alheio")).toBe(false);
    expect(prisma.portfolioAsset.deleteMany).toHaveBeenCalledWith({
      where: { id: "asset-alheio", ...OWNED_BY_USER_1 },
    });
  });
});
