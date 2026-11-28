import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AiConfigurationError } from "@/lib/ai/provider";
import type {
  AiAnalysisOutput,
  CheckInDetail,
  MacroIndicators,
  NewsFetchResult,
} from "@/lib/types/domain";
import type {
  InvestorProfileWithAssets,
  SaveCheckInInput,
} from "@/lib/history/repository";
import type { EntradaMotor, ResultadoMotor } from "@/motor/tipos";

const mocks = vi.hoisted(() => ({
  getSessionUser: vi.fn(),
  isDatabaseConfigured: vi.fn<() => boolean>(),
  getProfileForUser: vi.fn<
    (userId: string) => Promise<InvestorProfileWithAssets | null>
  >(),
  getProfileIdForUser: vi.fn<(userId: string) => Promise<string | null>>(),
  listCheckIns: vi.fn<
    (
      profileId?: string,
      options?: { limit?: number; order?: "asc" | "desc" },
    ) => Promise<CheckInDetail[]>
  >(),
  saveCheckIn: vi.fn<(params: SaveCheckInInput) => Promise<CheckInDetail>>(),
  getMacroIndicators: vi.fn<() => Promise<MacroIndicators>>(),
  fetchEconomicNews: vi.fn<
    (options: { assetClasses: string[] }) => Promise<NewsFetchResult>
  >(),
  generateInvestmentAnalysis: vi.fn(),
  gerarDiagnostico: vi.fn<(entrada: EntradaMotor) => ResultadoMotor>(),
}));


vi.mock("@/motor", async () => {
  const actual = await vi.importActual<typeof import("@/motor")>("@/motor");
  return {
    ...actual,
    gerarDiagnostico: mocks.gerarDiagnostico,
  };
});
vi.mock("@/lib/auth/session", () => ({
  getSessionUser: mocks.getSessionUser,
}));

vi.mock("@/lib/db/prisma", () => ({
  isDatabaseConfigured: mocks.isDatabaseConfigured,
}));

vi.mock("@/lib/profile/repository", () => ({
  getProfileForUser: mocks.getProfileForUser,
  getProfileIdForUser: mocks.getProfileIdForUser,
}));

vi.mock("@/lib/history/repository", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/history/repository")
  >("@/lib/history/repository");
  return {
    ...actual,
    listCheckIns: mocks.listCheckIns,
    saveCheckIn: mocks.saveCheckIn,
  };
});

vi.mock("@/lib/integrations/bcb", () => ({
  getMacroIndicators: mocks.getMacroIndicators,
}));

vi.mock("@/lib/integrations/firecrawl", () => ({
  fetchEconomicNews: mocks.fetchEconomicNews,
}));

vi.mock("@/lib/ai/advisor", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/ai/advisor")>("@/lib/ai/advisor");
  return {
    ...actual,
    generateInvestmentAnalysis: mocks.generateInvestmentAnalysis,
  };
});

import { AiGenerationError } from "@/lib/ai/advisor";
import { GET, POST } from "@/app/api/checkins/route";

const SAMPLE_MACRO: MacroIndicators = {
  selicMetaAnnual: 14.75,
  selicDate: "2026-11-01",
  cdiAnnual: 14.65,
  cdiDaily: 0.0542,
  cdiDate: "2026-11-01",
  ipcaMonthly: 0.42,
  ipca12m: 4.85,
  ipcaDate: "2026-10-01",
  ipcaHistory: [
    { date: "2026-09-01", value: 0.38 },
    { date: "2026-10-01", value: 0.42 },
  ],
  source: "bcb_sgs",
  fetchedAt: "2026-11-21T12:00:00.000Z",
  isStale: false,
};

const SAMPLE_PROFILE: InvestorProfileWithAssets = {
  id: "demo-marina-costa",
  name: "Marina Costa",
  email: "marina@example.com",
  riskProfile: "moderado",
  horizonMonths: 60,
  monthlyIncomeCents: 1_200_000,
  goals: [
    {
      title: "Reserva de independência",
      targetAmountCents: 20_000_000,
      targetDate: "2031-11",
      priority: "alta",
    },
  ],
  targetAllocation: {
    renda_fixa_pos: 50,
    acoes: 30,
    fiis: 20,
  },
  preferences: null,
  createdAt: "2026-08-01T10:00:00.000Z",
  updatedAt: "2026-11-01T10:00:00.000Z",
  assets: [
    {
      id: "asset-1",
      profileId: "demo-marina-costa",
      name: "Tesouro Selic 2029",
      assetClass: "renda_fixa_pos",
      amountCents: 700_000,
      indexer: "SELIC",
      indexerRate: 100,
      liquidity: "D+0",
      createdAt: "2026-08-01T10:00:00.000Z",
      updatedAt: "2026-11-01T10:00:00.000Z",
    },
    {
      id: "asset-2",
      profileId: "demo-marina-costa",
      name: "ETF Ibovespa",
      assetClass: "acoes",
      amountCents: 200_000,
      indexer: null,
      indexerRate: null,
      liquidity: "D+2",
      createdAt: "2026-08-01T10:00:00.000Z",
      updatedAt: "2026-11-01T10:00:00.000Z",
    },
    {
      id: "asset-3",
      profileId: "demo-marina-costa",
      name: "FII Logística",
      assetClass: "fiis",
      amountCents: 100_000,
      indexer: null,
      indexerRate: null,
      liquidity: "D+2",
      createdAt: "2026-08-01T10:00:00.000Z",
      updatedAt: "2026-11-01T10:00:00.000Z",
    },
  ],
};

// Motor result for SAMPLE_PROFILE (R$ 7.000 / 2.000 / 1.000) with a R$ 1.000
// contribution. The motor is mocked so these route tests do not depend on it.
const CURRENT_MOTOR_RESULT: ResultadoMotor = {
  totalCentavos: 1_000_000,
  aporteCentavos: 100_000,
  totalPosAporteCentavos: 1_100_000,
  classes: [
    {
      classe: "renda_fixa_pos",
      valorCentavos: 700_000,
      atualPct: 70,
      alvoPct: 50,
      desvioPct: 20,
      aporteCentavos: 0,
      posAportePct: 63.64,
    },
    {
      classe: "acoes",
      valorCentavos: 200_000,
      atualPct: 20,
      alvoPct: 30,
      desvioPct: -10,
      aporteCentavos: 54_167,
      posAportePct: 23.11,
    },
    {
      classe: "fiis",
      valorCentavos: 100_000,
      atualPct: 10,
      alvoPct: 20,
      desvioPct: -10,
      aporteCentavos: 45_833,
      posAportePct: 13.26,
    },
  ],
  aderencia: 80,
  aderenciaPosAporte: 86.36,
  rendimentoAnualPct: 15.1,
  rendimentoRealPct: 9.77,
  juroRealPct: 9.44,
  versao: "motor-v1",
};

const PREVIOUS_CHECKIN: CheckInDetail = {
  id: "chk-prev-1",
  profileId: "demo-marina-costa",
  referenceMonth: "2026-10",
  userNotes: "Mês estável.",
  contributionCents: 80_000,
  totalValueCents: 900_000,
  adherenceScore: 76,
  macroSnapshot: SAMPLE_MACRO,
  motorResult: {
    totalCentavos: 900_000,
    aporteCentavos: 80_000,
    totalPosAporteCentavos: 980_000,
    classes: [
      {
        classe: "renda_fixa_pos",
        valorCentavos: 666_000,
        atualPct: 74,
        alvoPct: 50,
        desvioPct: 24,
        aporteCentavos: 0,
        posAportePct: 67.96,
      },
      {
        classe: "acoes",
        valorCentavos: 144_000,
        atualPct: 16,
        alvoPct: 30,
        desvioPct: -14,
        aporteCentavos: 50_000,
        posAportePct: 19.8,
      },
      {
        classe: "fiis",
        valorCentavos: 90_000,
        atualPct: 10,
        alvoPct: 20,
        desvioPct: -10,
        aporteCentavos: 30_000,
        posAportePct: 12.24,
      },
    ],
    aderencia: 76,
    aderenciaPosAporte: 82.04,
    rendimentoAnualPct: 15.2,
    rendimentoRealPct: 9.87,
    juroRealPct: 9.44,
    versao: "motor-v1",
  },
  aiAnalysis: null,
  newsSources: null,
  positions: [
    {
      id: "pos-prev-1",
      assetClass: "renda_fixa_pos",
      assetLabel: "Tesouro Selic 2029",
      amountCents: 666_000,
      allocationPct: 74,
      targetPct: 50,
    },
    {
      id: "pos-prev-2",
      assetClass: "acoes",
      assetLabel: "ETF Ibovespa",
      amountCents: 144_000,
      allocationPct: 16,
      targetPct: 30,
    },
    {
      id: "pos-prev-3",
      assetClass: "fiis",
      assetLabel: "FII Logística",
      amountCents: 90_000,
      allocationPct: 10,
      targetPct: 20,
    },
  ],
  createdAt: "2026-10-20T12:00:00.000Z",
};

const SAMPLE_NEWS: NewsFetchResult = {
  items: [
    {
      title: "Copom mantém Selic em 14,75% ao ano",
      url: "https://www.bcb.gov.br/noticias/selic",
      source: "bcb.gov.br",
      publishedAt: "2026-11-18",
      snippet: "Comitê avalia cenário inflacionário e atividade econômica.",
      topic: "Macroeconomia",
    },
  ],
  newsAvailable: true,
  fetchedAt: "2026-11-21T12:00:00.000Z",
  queriesUsed: ["Selic Copom IPCA economia Brasil"],
};

const SAMPLE_ANALYSIS: AiAnalysisOutput = {
  resumoExecutivo:
    "Patrimônio cresceu de R$ 9.000,00 para R$ 10.000,00 com melhora de aderência.",
  diagnosticoAlocacao:
    "Renda fixa pós-fixada está 20 p.p. acima do alvo enquanto ações e FIIs seguem abaixo.",
  evolucaoDesdeUltimoCheckin:
    "Evolução positiva de R$ 1.000,00 em relação ao check-in de 2026-10.",
  impactoMacroENoticias:
    "Selic em 14,75% mantém juro real elevado para a parcela pós-fixada.",
  opcoesDeAjuste: [
    {
      classeAtivo: "acoes",
      acaoSugerida: "Direcionar parte do novo aporte para ações",
      valorSugeridoCentavos: 54_167,
      justificativa: "Reduz o desvio negativo em ações sem necessidade de resgates.",
    },
  ],
  alertas: ["Concentração de 70% em renda fixa pós-fixada."],
  fontesConsultadas: [
    {
      titulo: "Copom mantém Selic em 14,75% ao ano",
      url: "https://www.bcb.gov.br/noticias/selic",
      fonte: "bcb.gov.br",
    },
  ],
  disclaimer:
    "Análise exclusivamente educacional; não constitui recomendação de investimento.",
};

const SESSION_USER = {
  id: "user-session-1",
  email: "marina@example.com",
  name: "Marina Costa",
};

function makeJsonPostRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost:3000/api/checkins", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("GET /api/checkins", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSessionUser.mockResolvedValue(SESSION_USER);
    mocks.isDatabaseConfigured.mockReturnValue(true);
    mocks.getProfileIdForUser.mockResolvedValue(SAMPLE_PROFILE.id);
    mocks.listCheckIns.mockResolvedValue([PREVIOUS_CHECKIN]);
  });

  it("returns 401 when user is unauthenticated", async () => {
    mocks.getSessionUser.mockResolvedValue(null);

    const request = new NextRequest("http://localhost:3000/api/checkins");
    const response = await GET(request);

    expect(response.status).toBe(401);
    expect(mocks.getProfileIdForUser).not.toHaveBeenCalled();
  });

  it("returns 503 when database is not configured", async () => {
    mocks.isDatabaseConfigured.mockReturnValue(false);

    const request = new NextRequest("http://localhost:3000/api/checkins");
    const response = await GET(request);
    const json = await response.json();

    expect(response.status).toBe(503);
    expect(json.error).toContain("DATABASE_URL");
    expect(mocks.getProfileIdForUser).not.toHaveBeenCalled();
  });

  it("returns 404 when authenticated user has no investor profile", async () => {
    mocks.getProfileIdForUser.mockResolvedValue(null);

    const request = new NextRequest("http://localhost:3000/api/checkins");
    const response = await GET(request);

    expect(response.status).toBe(404);
    expect(mocks.getProfileIdForUser).toHaveBeenCalledWith(SESSION_USER.id);
  });

  it("returns 400 when limit query parameter is invalid", async () => {
    const request = new NextRequest(
      "http://localhost:3000/api/checkins?limit=abc",
    );
    const response = await GET(request);

    expect(response.status).toBe(400);
    expect(mocks.getProfileIdForUser).not.toHaveBeenCalled();
  });

  it("ignores ?profileId query param and returns 200 scoped to session profile", async () => {
    const request = new NextRequest(
      "http://localhost:3000/api/checkins?profileId=other-user-profile&limit=5",
    );
    const response = await GET(request);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(mocks.getProfileIdForUser).toHaveBeenCalledWith(SESSION_USER.id);
    expect(json.profileId).toBe("demo-marina-costa");
    expect(json.checkIns).toHaveLength(1);
    expect(mocks.listCheckIns).toHaveBeenCalledWith("demo-marina-costa", {
      limit: 5,
    });
  });
});

describe("POST /api/checkins", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSessionUser.mockResolvedValue(SESSION_USER);
    mocks.isDatabaseConfigured.mockReturnValue(true);
    mocks.getProfileForUser.mockResolvedValue(SAMPLE_PROFILE);
    mocks.listCheckIns.mockResolvedValue([PREVIOUS_CHECKIN]);
    mocks.getMacroIndicators.mockResolvedValue(SAMPLE_MACRO);
    mocks.gerarDiagnostico.mockReturnValue(CURRENT_MOTOR_RESULT);
    mocks.fetchEconomicNews.mockResolvedValue(SAMPLE_NEWS);
    mocks.generateInvestmentAnalysis.mockResolvedValue({
      analysis: SAMPLE_ANALYSIS,
      provider: "anthropic",
      modelId: "claude-sonnet-4-5",
    });
    mocks.saveCheckIn.mockImplementation(async (params: SaveCheckInInput) => ({
      id: "chk-new-2",
      profileId: params.profileId,
      referenceMonth: params.referenceMonth,
      userNotes: params.userNotes,
      contributionCents: params.contributionCents,
      totalValueCents: params.totalValueCents,
      adherenceScore: params.adherenceScore,
      macroSnapshot: params.macroSnapshot,
      motorResult: params.motorResult,
      aiAnalysis: params.aiAnalysis ?? null,
      newsSources: params.newsSources ?? null,
      positions: params.positions.map((pos, idx) => ({
        id: `pos-new-${idx + 1}`,
        ...pos,
      })),
      createdAt: "2026-11-21T15:00:00.000Z",
    }));
  });

  it("returns 401 when user is unauthenticated", async () => {
    mocks.getSessionUser.mockResolvedValue(null);

    const response = await POST(
      makeJsonPostRequest({
        referenceMonth: "2026-11",
        contributionCents: 100_000,
      }),
    );

    expect(response.status).toBe(401);
    expect(mocks.getProfileForUser).not.toHaveBeenCalled();
  });

  it("returns 400 on malformed JSON", async () => {
    const request = new NextRequest("http://localhost:3000/api/checkins", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{ invalid json",
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
  });

  it("returns 400 on schema validation error", async () => {
    const response = await POST(
      makeJsonPostRequest({
        referenceMonth: "2026/11",
        contributionCents: -50,
      }),
    );
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.details).toBeDefined();
  });

  it("returns 400 with a clear message when the reference month is after the current month", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-15T12:00:00-03:00"));
    try {
      const response = await POST(
        makeJsonPostRequest({
          referenceMonth: "2026-12",
          contributionCents: 0,
          positions: [{ name: "Tesouro Selic", assetClass: "renda_fixa_pos", amountCents: 100_000 }],
        }),
      );
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.error).toBe("O mês de referência não pode ser depois do mês atual.");
      expect(mocks.saveCheckIn).not.toHaveBeenCalled();
      expect(mocks.gerarDiagnostico).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("accepts the current month and uses Brasília time at the turn of the month", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    // 30/11 às 22h em Brasília já é 01/12 em UTC
    vi.setSystemTime(new Date("2026-12-01T01:00:00Z"));
    try {
      const futuro = await POST(
        makeJsonPostRequest({ referenceMonth: "2026-12", contributionCents: 0 }),
      );
      expect(futuro.status).toBe(400);

      mocks.isDatabaseConfigured.mockReturnValue(false);
      const atual = await POST(
        makeJsonPostRequest({ referenceMonth: "2026-11", contributionCents: 0 }),
      );
      // passou da validação do mês e parou na checagem seguinte (banco)
      expect(atual.status).toBe(503);
    } finally {
      vi.useRealTimers();
    }
  });

  it("ignores client-supplied profileId in body and scopes check-in to session profile", async () => {
    const response = await POST(
      makeJsonPostRequest({
        profileId: "other-user-profile",
        referenceMonth: "2026-11",
        contributionCents: 100_000,
        skipAi: true,
        skipNews: true,
      }),
    );

    expect(response.status).toBe(201);
    expect(mocks.getProfileForUser).toHaveBeenCalledWith(SESSION_USER.id);
    expect(mocks.saveCheckIn.mock.calls[0][0].profileId).toBe(SAMPLE_PROFILE.id);
  });

  it("returns 503 when database is unconfigured", async () => {
    mocks.isDatabaseConfigured.mockReturnValue(false);

    const response = await POST(
      makeJsonPostRequest({
        referenceMonth: "2026-11",
        userNotes: "Recebi bônus este mês.",
        contributionCents: 100_000,
      }),
    );
    const json = await response.json();

    expect(response.status).toBe(503);
    expect(json.error).toContain("DATABASE_URL");
    expect(mocks.saveCheckIn).not.toHaveBeenCalled();
  });

  it("returns 404 when authenticated user has no investor profile", async () => {
    mocks.getProfileForUser.mockResolvedValue(null);

    const response = await POST(
      makeJsonPostRequest({
        referenceMonth: "2026-11",
        contributionCents: 100_000,
      }),
    );

    expect(response.status).toBe(404);
    expect(mocks.getProfileForUser).toHaveBeenCalledWith(SESSION_USER.id);
  });

  it("returns 400 when neither request nor profile has portfolio positions", async () => {
    mocks.getProfileForUser.mockResolvedValue({
      ...SAMPLE_PROFILE,
      assets: [],
    });

    const response = await POST(
      makeJsonPostRequest({
        referenceMonth: "2026-11",
        contributionCents: 100_000,
      }),
    );

    expect(response.status).toBe(400);
  });

  it("orchestrates BCB, Motor, History, Firecrawl, LLM, saveCheckIn and returns 201 with updated evolution", async () => {
    const response = await POST(
      makeJsonPostRequest({
        referenceMonth: "2026-11",
        userNotes: "Mantive aportes regulares em novembro.",
        contributionCents: 100_000,
      }),
    );
    const json = await response.json();

    expect(response.status).toBe(201);
    expect(response.headers.get("Cache-Control")).toBe("no-store");

    // Verify BCB, Firecrawl, LLM, and saveCheckIn were all called
    expect(mocks.getMacroIndicators).toHaveBeenCalledTimes(1);
    expect(mocks.fetchEconomicNews).toHaveBeenCalledWith({
      assetClasses: expect.arrayContaining(["renda_fixa_pos", "acoes", "fiis"]),
    });
    expect(mocks.generateInvestmentAnalysis).toHaveBeenCalledTimes(1);

    const advisorCallArg = mocks.generateInvestmentAnalysis.mock.calls[0][0];
    expect(advisorCallArg.motorResult.totalCentavos).toBe(1_000_000);
    expect(advisorCallArg.motorResult.aporteCentavos).toBe(100_000);
    expect(advisorCallArg.motorResult.aderencia).toBe(80);
    // Evolution passed to AI includes the provisional current check-in so N-1 -> N deltas are visible
    expect(advisorCallArg.evolutionSummary.totalCheckIns).toBe(2);
    expect(advisorCallArg.evolutionSummary.deltaFromPreviousCents).toBe(100_000);
    expect(advisorCallArg.evolutionSummary.adherenceDeltaFromPrevious).toBe(4);

    expect(mocks.saveCheckIn).toHaveBeenCalledTimes(1);
    const saveArg = mocks.saveCheckIn.mock.calls[0][0];
    expect(saveArg.syncPortfolioAssets).toBe(true);
    expect(saveArg.totalValueCents).toBe(1_000_000);
    expect(saveArg.aiAnalysis).toEqual(SAMPLE_ANALYSIS);

    // Verify returned payload and updated evolution (now 2 check-ins!)
    expect(json.checkIn.id).toBe("chk-new-2");
    expect(json.evolution.totalCheckIns).toBe(2);
    expect(json.evolution.latestTotalCents).toBe(1_000_000);
    expect(json.evolution.deltaFromPreviousCents).toBe(100_000);
    expect(json.meta).toEqual({
      aiProvider: "anthropic",
      aiModelId: "claude-sonnet-4-5",
      macroSource: "bcb_sgs",
      macroIsStale: false,
      newsAvailable: true,
    });
  });

  it("supports skipAi: true and saves check-in without invoking LLM", async () => {
    const response = await POST(
      makeJsonPostRequest({
        profileId: "demo-marina-costa",
        referenceMonth: "2026-11",
        userNotes: "Check-in rápido sem IA.",
        contributionCents: 50_000,
        skipAi: true,
        skipNews: true,
        syncPortfolioAssets: false,
      }),
    );
    const json = await response.json();

    expect(response.status).toBe(201);
    expect(mocks.fetchEconomicNews).not.toHaveBeenCalled();
    expect(mocks.generateInvestmentAnalysis).not.toHaveBeenCalled();
    expect(mocks.saveCheckIn).toHaveBeenCalledTimes(1);
    expect(mocks.saveCheckIn.mock.calls[0][0].syncPortfolioAssets).toBe(false);
    expect(json.checkIn.aiAnalysis).toBeNull();
    expect(json.meta).toEqual({
      aiProvider: null,
      aiModelId: null,
      macroSource: "bcb_sgs",
      macroIsStale: false,
      newsAvailable: false,
    });
  });

  it("sends the profile portfolio to the motor in the motor's input shape", async () => {
    mocks.getProfileForUser.mockResolvedValue({
      ...SAMPLE_PROFILE,
      preferences: { excludeCrypto: true },
    });

    await POST(
      makeJsonPostRequest({
        profileId: "demo-marina-costa",
        referenceMonth: "2026-11",
        contributionCents: 100_000,
        skipAi: true,
        skipNews: true,
      }),
    );

    expect(mocks.gerarDiagnostico).toHaveBeenCalledTimes(1);
    const entrada = mocks.gerarDiagnostico.mock.calls[0][0];
    expect(entrada.perfil).toEqual({ tipo: "moderado", excluir: ["cripto"] });
    expect(entrada.alvo).toEqual({ renda_fixa_pos: 50, acoes: 30, fiis: 20 });
    expect(entrada.aporteCentavos).toBe(100_000);
    expect(entrada.horizonteMeses).toBe(60);
    expect(entrada.indicadores).toEqual({
      selicPct: 14.75,
      cdiPct: 14.65,
      ipca12mPct: 4.85,
    });
    expect(entrada.carteira).toEqual([
      {
        nome: "Tesouro Selic 2029",
        classe: "renda_fixa_pos",
        valorCentavos: 700_000,
        indexador: "SELIC",
        taxaIndexador: 100,
      },
      {
        nome: "ETF Ibovespa",
        classe: "acoes",
        valorCentavos: 200_000,
        indexador: null,
        taxaIndexador: null,
      },
      {
        nome: "FII Logística",
        classe: "fiis",
        valorCentavos: 100_000,
        indexador: null,
        taxaIndexador: null,
      },
    ]);
  });

  it("returns 500 without persisting when the motor fails", async () => {
    mocks.gerarDiagnostico.mockImplementation(() => {
      throw new Error("gerarDiagnostico ainda não foi implementado");
    });

    const response = await POST(
      makeJsonPostRequest({
        profileId: "demo-marina-costa",
        referenceMonth: "2026-11",
        contributionCents: 100_000,
      }),
    );

    expect(response.status).toBe(500);
    expect(mocks.generateInvestmentAnalysis).not.toHaveBeenCalled();
    expect(mocks.saveCheckIn).not.toHaveBeenCalled();
  });

  it("returns 503 on AiConfigurationError without persisting check-in", async () => {
    mocks.generateInvestmentAnalysis.mockRejectedValue(
      new AiConfigurationError(
        "Chave da API de IA não configurada.",
        "MISSING_API_KEY",
      ),
    );

    const response = await POST(
      makeJsonPostRequest({
        profileId: "demo-marina-costa",
        referenceMonth: "2026-11",
        contributionCents: 100_000,
      }),
    );
    const json = await response.json();

    expect(response.status).toBe(503);
    expect(json.code).toBe("MISSING_API_KEY");
    expect(mocks.saveCheckIn).not.toHaveBeenCalled();
  });

  it("returns 502 on AiGenerationError without persisting check-in", async () => {
    mocks.generateInvestmentAnalysis.mockRejectedValue(
      new AiGenerationError(
        "Falha ao gerar análise estruturada.",
        "PROVIDER_ERROR",
      ),
    );

    const response = await POST(
      makeJsonPostRequest({
        profileId: "demo-marina-costa",
        referenceMonth: "2026-11",
        contributionCents: 100_000,
      }),
    );
    const json = await response.json();

    expect(response.status).toBe(502);
    expect(json.code).toBe("PROVIDER_ERROR");
    expect(mocks.saveCheckIn).not.toHaveBeenCalled();
  });
});