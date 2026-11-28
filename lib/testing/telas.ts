import { vi } from "vitest";
import { computePortfolioEvolution } from "@/lib/history/evolution";
import type {
  InvestorProfileWithAssets,
  PortfolioAssetRecord,
} from "@/lib/history/repository";
import { resultadoMotorFake } from "@/lib/testing/resultado-motor-fake";
import type {
  AssetClass,
  CheckInDetail,
  InvestorProfile,
  MacroIndicators,
} from "@/lib/types/domain";

/**
 * Sample data and helpers shared by the screen tests (Testing Library +
 * jsdom). Nothing here touches the database or the network: `mockFetch`
 * answers each route with a canned JSON response.
 */

export const INDICADORES: MacroIndicators = {
  selicMetaAnnual: 13.75,
  selicDate: "2026-11-14",
  cdiAnnual: 13.65,
  cdiDaily: 0.05,
  cdiDate: "2026-11-14",
  ipcaMonthly: 0.29,
  ipca12m: 4.63,
  ipcaDate: "2026-10-01",
  ipcaHistory: [{ date: "2026-10-01", value: 0.29 }],
  source: "bcb_sgs",
  fetchedAt: "2026-11-15T12:00:00.000Z",
  isStale: false,
};

export const PERFIL: InvestorProfile = {
  id: "perfil-1",
  name: "Ana Teste",
  email: "ana@example.com",
  riskProfile: "moderado",
  horizonMonths: 60,
  monthlyIncomeCents: 850_000,
  goals: [
    {
      title: "Reserva de emergência",
      targetAmountCents: 3_000_000,
      targetDate: "2027-12",
      priority: "alta",
    },
  ],
  targetAllocation: { renda_fixa_pos: 50, acoes: 30, fiis: 20 },
  preferences: null,
  createdAt: "2026-08-01T10:00:00.000Z",
  updatedAt: "2026-11-01T10:00:00.000Z",
};

export const PERFIL_SEM_METAS: InvestorProfile = { ...PERFIL, goals: [] };

type Posicao = { assetClass: AssetClass; label: string; amountCents: number };

function criarCheckIn(
  id: string,
  referenceMonth: string,
  contributionCents: number,
  posicoes: Posicao[],
): CheckInDetail {
  const motorResult = resultadoMotorFake({
    positions: posicoes,
    targetAllocation: PERFIL.targetAllocation,
    contributionCents,
  });
  const total = motorResult.totalCentavos;
  return {
    id,
    profileId: PERFIL.id,
    referenceMonth,
    userNotes: id === "ci-2" ? "Recebi o 13º e aportei mais." : "",
    contributionCents,
    totalValueCents: total,
    adherenceScore: motorResult.aderencia,
    macroSnapshot: INDICADORES,
    motorResult,
    aiAnalysis: null,
    newsSources: null,
    positions: posicoes.map((p, index) => ({
      id: `${id}-pos-${index + 1}`,
      assetClass: p.assetClass,
      assetLabel: p.label,
      amountCents: p.amountCents,
      allocationPct: Math.round((p.amountCents / total) * 10_000) / 100,
      targetPct: PERFIL.targetAllocation[p.assetClass] ?? 0,
    })),
    createdAt: `${referenceMonth}-15T12:00:00.000Z`,
  };
}

/** Two monthly check-ins, oldest first (the order the evolution route returns). */
export const CHECKINS: CheckInDetail[] = [
  criarCheckIn("ci-1", "2026-10", 100_000, [
    { assetClass: "renda_fixa_pos", label: "Tesouro Selic 2029", amountCents: 700_000 },
    { assetClass: "acoes", label: "ETF Ibovespa", amountCents: 200_000 },
    { assetClass: "fiis", label: "FII Logística", amountCents: 100_000 },
  ]),
  criarCheckIn("ci-2", "2026-11", 150_000, [
    { assetClass: "renda_fixa_pos", label: "Tesouro Selic 2029", amountCents: 720_000 },
    { assetClass: "acoes", label: "ETF Ibovespa", amountCents: 300_000 },
    { assetClass: "fiis", label: "FII Logística", amountCents: 180_000 },
  ]),
];

const CONTEXTO = {
  id: PERFIL.id,
  goals: PERFIL.goals,
  targetAllocation: PERFIL.targetAllocation,
};

/** Body of GET /api/portfolio/evolution with two check-ins. */
export const EVOLUCAO_RESPOSTA = {
  profile: PERFIL,
  evolution: computePortfolioEvolution(CHECKINS, CONTEXTO),
  checkIns: CHECKINS,
  checkInsCount: CHECKINS.length,
};

/** Body of GET /api/portfolio/evolution for a user with a profile and no check-in. */
export const EVOLUCAO_VAZIA = {
  profile: PERFIL_SEM_METAS,
  evolution: computePortfolioEvolution([], { ...CONTEXTO, goals: [] }),
  checkIns: [] as CheckInDetail[],
  checkInsCount: 0,
};

export const ATIVOS: PortfolioAssetRecord[] = [
  {
    id: "ativo-1",
    profileId: PERFIL.id,
    name: "Tesouro Selic 2029",
    assetClass: "renda_fixa_pos",
    amountCents: 720_000,
    indexer: "SELIC",
    indexerRate: 100,
    liquidity: "D+1",
    createdAt: "2026-08-01T10:00:00.000Z",
    updatedAt: "2026-11-01T10:00:00.000Z",
  },
  {
    id: "ativo-2",
    profileId: PERFIL.id,
    name: "ETF Ibovespa",
    assetClass: "acoes",
    amountCents: 300_000,
    indexer: null,
    indexerRate: null,
    liquidity: "D+2",
    createdAt: "2026-08-01T10:00:00.000Z",
    updatedAt: "2026-11-01T10:00:00.000Z",
  },
];

export const PERFIL_COM_ATIVOS: InvestorProfileWithAssets = { ...PERFIL, assets: ATIVOS };

export interface RotaFake {
  method?: string;
  url: string | RegExp;
  status?: number;
  body?: unknown;
}

function urlDe(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.pathname + input.search;
  return input.url;
}

/**
 * Replaces `fetch` with canned answers per method + URL. An unexpected call
 * gets a 599 so the test fails loudly instead of hitting the network.
 */
export function mockFetch(rotas: RotaFake[]) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = urlDe(input);
    const method = (init?.method ?? "GET").toUpperCase();
    const rota = rotas.find(
      (r) =>
        (r.method ?? "GET").toUpperCase() === method &&
        (typeof r.url === "string" ? r.url === url : r.url.test(url)),
    );
    if (!rota) {
      return new Response(JSON.stringify({ error: `sem mock para ${method} ${url}` }), {
        status: 599,
      });
    }
    return new Response(rota.body === undefined ? null : JSON.stringify(rota.body), {
      status: rota.status ?? 200,
      headers: { "Content-Type": "application/json" },
    });
  });
}

/** Calls made to `method url`, with the parsed JSON body of each. */
export function chamadas(
  spy: ReturnType<typeof mockFetch>,
  method: string,
  url: string | RegExp,
) {
  return spy.mock.calls
    .filter(([input, init]) => {
      const u = urlDe(input);
      return (
        (init?.method ?? "GET").toUpperCase() === method.toUpperCase() &&
        (typeof url === "string" ? u === url : url.test(u))
      );
    })
    .map(([input, init]) => ({
      url: urlDe(input),
      body: init?.body ? (JSON.parse(String(init.body)) as unknown) : undefined,
    }));
}
