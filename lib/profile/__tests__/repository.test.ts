import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  prisma: {
    investorProfile: {
      findUnique: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
    },
  },
  getProfileWithAssets: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({
  getPrisma: () => mocks.prisma,
  isDatabaseConfigured: () => true,
}));

vi.mock("@/lib/history/repository", () => ({
  getProfileWithAssets: mocks.getProfileWithAssets,
}));

import {
  ProfileAlreadyExistsError,
  createProfileForUser,
  getProfileForUser,
  updateProfileForUser,
} from "@/lib/profile/repository";

const { prisma } = mocks;

const INPUT = {
  name: "Ana",
  riskProfile: "moderado" as const,
  horizonMonths: 60,
  goals: [],
  targetAllocation: { acoes: 100 },
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getProfileWithAssets.mockResolvedValue({ id: "profile-1" });
});

describe("profile repository", () => {
  it("getProfileForUser looks up by userId, never by a client-provided id", async () => {
    prisma.investorProfile.findUnique.mockResolvedValue({ id: "profile-1" });

    await getProfileForUser("user-1");

    expect(prisma.investorProfile.findUnique).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      select: { id: true },
    });
    expect(mocks.getProfileWithAssets).toHaveBeenCalledWith("profile-1");
  });

  it("getProfileForUser returns null when the user has no profile", async () => {
    prisma.investorProfile.findUnique.mockResolvedValue(null);

    expect(await getProfileForUser("user-1")).toBeNull();
    expect(mocks.getProfileWithAssets).not.toHaveBeenCalled();
  });

  it("createProfileForUser links the profile to the user and falls back to the account e-mail", async () => {
    prisma.investorProfile.create.mockResolvedValue({ id: "profile-1" });

    await createProfileForUser("user-1", INPUT, "ana@example.com");

    expect(prisma.investorProfile.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: "user-1",
          email: "ana@example.com",
          preferences: Prisma.DbNull,
        }),
      }),
    );
  });

  it("createProfileForUser maps unique violation to ProfileAlreadyExistsError", async () => {
    prisma.investorProfile.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
        code: "P2002",
        clientVersion: "test",
      }),
    );

    await expect(
      createProfileForUser("user-1", INPUT, null),
    ).rejects.toBeInstanceOf(ProfileAlreadyExistsError);
  });

  it("updateProfileForUser only writes the fields that were sent", async () => {
    prisma.investorProfile.updateMany.mockResolvedValue({ count: 1 });
    prisma.investorProfile.findUnique.mockResolvedValue({ id: "profile-1" });

    await updateProfileForUser("user-1", { horizonMonths: 120 });

    expect(prisma.investorProfile.updateMany).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      data: { horizonMonths: 120 },
    });
  });

  it("updateProfileForUser returns null when the user has no profile", async () => {
    prisma.investorProfile.updateMany.mockResolvedValue({ count: 0 });

    expect(await updateProfileForUser("user-1", { name: "X" })).toBeNull();
  });
});
