import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getPrisma: vi.fn() }));

vi.mock("@/lib/db/prisma", () => ({ getPrisma: mocks.getPrisma }));
vi.mock("@/lib/history/repository", () => ({ DEMO_PROFILE_ID: "demo-marina-costa" }));

import {
  aplicarValidadeDemo,
  apagarDemosAntigas,
  criarContaDemo,
  DEMO_TTL_MS,
  isDemoEmail,
} from "@/lib/auth/demo";

const TEMPLATE = {
  id: "demo-marina-costa",
  userId: "usuario-demo-antigo",
  name: "Marina Costa",
  riskProfile: "moderado",
  horizonMonths: 60,
  monthlyIncomeCents: 950_000,
  goals: [{ title: "Reserva" }],
  targetAllocation: { acoes: 50, renda_fixa_pos: 50 },
  preferences: { excludeCrypto: true },
  assets: [
    {
      id: "a1",
      profileId: "demo-marina-costa",
      name: "Tesouro Selic",
      assetClass: "renda_fixa_pos",
      amountCents: 100_000,
      indexer: "SELIC",
      indexerRate: 100,
      liquidity: "D+1",
    },
  ],
  checkIns: [
    {
      id: "c1",
      referenceMonth: "2026-11",
      userNotes: "nota",
      contributionCents: 1_000,
      totalValueCents: 100_000,
      adherenceScore: 90,
      macroSnapshot: { selicMetaAnnual: 13.75 },
      motorResult: { versao: "motor-v1" },
      aiAnalysis: null,
      newsSources: null,
      createdAt: new Date("2026-11-10T12:00:00.000Z"),
      positions: [
        {
          id: "p1",
          assetClass: "renda_fixa_pos",
          assetLabel: "Tesouro Selic",
          amountCents: 100_000,
          allocationPct: 100,
          targetPct: 50,
        },
      ],
    },
  ],
};

function criarPrisma() {
  const tx = {
    investorProfile: {
      update: vi.fn().mockResolvedValue({}),
      create: vi.fn().mockResolvedValue({ id: "perfil-copia" }),
      deleteMany: vi.fn().mockResolvedValue({ count: 2 }),
    },
    user: {
      create: vi.fn().mockImplementation(async ({ data }) => ({
        id: "usuario-novo",
        email: data.email,
        name: data.name,
      })),
      deleteMany: vi.fn().mockResolvedValue({ count: 2 }),
    },
    checkIn: { create: vi.fn().mockResolvedValue({}) },
  };
  const prisma = {
    investorProfile: { findUnique: vi.fn().mockResolvedValue(TEMPLATE) },
    user: { findMany: vi.fn().mockResolvedValue([{ id: "u1" }, { id: "u2" }]) },
    $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
  };
  return { prisma, tx };
}

let prisma: ReturnType<typeof criarPrisma>["prisma"];
let tx: ReturnType<typeof criarPrisma>["tx"];

beforeEach(() => {
  vi.clearAllMocks();
  ({ prisma, tx } = criarPrisma());
  mocks.getPrisma.mockReturnValue(prisma);
});

describe("criarContaDemo", () => {
  it("creates a new temporary user with a private copy of the template", async () => {
    const user = await criarContaDemo();

    expect(user?.id).toBe("usuario-novo");
    expect(user?.email).toMatch(/^demo-[0-9a-f-]{36}@demo\.tiorico\.app$/);

    const perfil = tx.investorProfile.create.mock.calls[0][0].data;
    expect(perfil.userId).toBe("usuario-novo");
    expect(perfil.name).toBe("Marina Costa");
    expect(perfil.goals).toEqual(TEMPLATE.goals);
    expect(perfil.assets.create).toEqual([
      expect.objectContaining({ name: "Tesouro Selic", amountCents: 100_000 }),
    ]);
    // the copy never reuses the template ids
    expect(JSON.stringify(perfil)).not.toContain("demo-marina-costa");

    const checkIn = tx.checkIn.create.mock.calls[0][0].data;
    expect(checkIn.profileId).toBe("perfil-copia");
    expect(checkIn.referenceMonth).toBe("2026-11");
    expect(checkIn.positions.create).toHaveLength(1);
  });

  it("gives every call a different user", async () => {
    const a = await criarContaDemo();
    const b = await criarContaDemo();
    expect(a?.email).not.toBe(b?.email);
  });

  it("detaches the template from the old shared demo user", async () => {
    await criarContaDemo();

    expect(tx.investorProfile.update).toHaveBeenCalledWith({
      where: { id: "demo-marina-costa" },
      data: { userId: null },
    });
  });

  it("returns null when the seed template does not exist", async () => {
    prisma.investorProfile.findUnique.mockResolvedValue(null);

    await expect(criarContaDemo()).resolves.toBeNull();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe("apagarDemosAntigas", () => {
  it("deletes demo users older than the TTL and their profiles, never the template", async () => {
    const agora = new Date("2026-11-28T06:00:00.000Z");

    const resultado = await apagarDemosAntigas(agora);

    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          email: { endsWith: "@demo.tiorico.app" },
          createdAt: { lt: new Date(agora.getTime() - DEMO_TTL_MS) },
        },
      }),
    );
    expect(tx.investorProfile.deleteMany).toHaveBeenCalledWith({
      where: { userId: { in: ["u1", "u2"] }, id: { not: "demo-marina-costa" } },
    });
    expect(tx.user.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ["u1", "u2"] } },
    });
    expect(resultado).toEqual({ usuarios: 2, perfis: 2 });
  });

  it("does nothing when there is nothing old", async () => {
    prisma.user.findMany.mockResolvedValue([]);

    await expect(apagarDemosAntigas()).resolves.toEqual({ usuarios: 0, perfis: 0 });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe("isDemoEmail", () => {
  it("recognizes demo accounts by domain", () => {
    expect(isDemoEmail("demo-1@demo.tiorico.app")).toBe(true);
    expect(isDemoEmail("ana@example.com")).toBe(false);
    expect(isDemoEmail(null)).toBe(false);
  });
});

describe("aplicarValidadeDemo", () => {
  const agora = 1_800_000_000_000;

  it("stamps an absolute deadline on the demo sign-in", () => {
    const token = aplicarValidadeDemo({ sub: "u1" }, "demo", agora);
    expect(token).toEqual({ sub: "u1", demoExpiraEm: agora + DEMO_TTL_MS });
  });

  it("keeps the demo session until the deadline, even on later requests", () => {
    const token = { sub: "u1", demoExpiraEm: agora + DEMO_TTL_MS };
    expect(aplicarValidadeDemo(token, undefined, agora + DEMO_TTL_MS - 1)).toEqual(token);
  });

  it("ends the demo session at the deadline (same age the cleanup deletes)", () => {
    const token = { sub: "u1", demoExpiraEm: agora + DEMO_TTL_MS };
    expect(aplicarValidadeDemo(token, undefined, agora + DEMO_TTL_MS)).toBeNull();
  });

  it("never touches regular sessions", () => {
    const token = { sub: "u2" };
    expect(aplicarValidadeDemo(token, "email-code", agora)).toEqual(token);
    expect(aplicarValidadeDemo(token, undefined, agora + 10 * DEMO_TTL_MS)).toEqual(token);
  });
});
