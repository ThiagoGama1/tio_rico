import { config } from "dotenv";
import { Prisma } from "@prisma/client";
import { getPrisma } from "../lib/db/prisma";
import {
  formatCentsBRL,
  formatPctBR,
  formatSignedCentsBRL,
  formatSignedPctBR,
  formatSignedPpBR,
} from "../lib/history/evolution";
import { DEMO_PROFILE_ID } from "../lib/history/repository";
import { calculatePortfolioWithMotor } from "../lib/motor/adapter";
import {
  ASSET_CLASS_LABELS,
  AiAnalysisOutputSchema,
  MacroIndicatorsSchema,
  MotorCalculationResultSchema,
  NewsFetchResultSchema,
  TargetAllocationSchema,
  type AiAnalysisOutput,
  type AssetClass,
  type InvestorGoal,
  type MacroIndicators,
  type MotorCalculationResult,
  type NewsFetchResult,
  type PortfolioPositionInput,
  type ReferenceMonth,
  type TargetAllocation,
} from "../lib/types/domain";

config();
config({ path: ".env.local", override: true });

const DEMO_MACRO_SNAPSHOT_ID = "demo-macro-snapshot-2026-11";

const EDUCATIONAL_DISCLAIMER =
  "Análise exclusivamente educacional e informativa baseada nos números informados e no motor determinístico do Tio Rico. Não constitui recomendação de compra ou venda de ativos específicos nem substitui o acompanhamento de um profissional certificado (CNPI/CFP).";

interface SeedPositionSpec extends PortfolioPositionInput {
  assetId: string;
}

interface SeedCheckInSpec {
  id: string;
  referenceMonth: ReferenceMonth;
  createdAt: Date;
  userNotes: string;
  contributionCents: number;
  positions: SeedPositionSpec[];
  macro: MacroIndicators;
  news: NewsFetchResult;
  macroNote: string;
}

const DEMO_GOALS: InvestorGoal[] = [
  {
    title: "Reserva de Emergência (6 meses)",
    targetAmountCents: 3_000_000, // R$ 30.000,00
    targetDate: "2027-06",
    priority: "alta",
  },
  {
    title: "Patrimônio para Independência Parcial (5 anos)",
    targetAmountCents: 15_000_000, // R$ 150.000,00
    targetDate: "2031-11",
    priority: "alta",
  },
  {
    title: "Viagem Internacional em Família",
    targetAmountCents: 2_500_000, // R$ 25.000,00
    targetDate: "2028-07",
    priority: "media",
  },
];

const DEMO_TARGET_ALLOCATION: TargetAllocation = TargetAllocationSchema.parse({
  caixa: 10,
  renda_fixa_pos: 25,
  renda_fixa_ipca: 20,
  acoes: 20,
  fiis: 15,
  internacional: 10,
});

const DEMO_PREFERENCES = {
  currency: "BRL",
  rebalanceFrequency: "mensal",
  excludeCrypto: true,
};

function toPrismaJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function makePositions(amounts: {
  rendaFixaPos: number;
  caixa: number;
  rendaFixaIpca: number;
  acoes: number;
  fiis: number;
  internacional: number;
}): SeedPositionSpec[] {
  return [
    {
      assetId: "demo-asset-tesouro-selic",
      name: "Tesouro Selic 2029",
      assetClass: "renda_fixa_pos",
      amountCents: amounts.rendaFixaPos,
      indexer: "SELIC",
      indexerRate: 100,
      liquidity: "D+1",
    },
    {
      assetId: "demo-asset-cdb-liquidez",
      name: "CDB Liquidez Diária 102% CDI",
      assetClass: "caixa",
      amountCents: amounts.caixa,
      indexer: "CDI",
      indexerRate: 102,
      liquidity: "Diária",
    },
    {
      assetId: "demo-asset-tesouro-ipca",
      name: "Tesouro IPCA+ 2035",
      assetClass: "renda_fixa_ipca",
      amountCents: amounts.rendaFixaIpca,
      indexer: "IPCA+",
      indexerRate: 6.4,
      liquidity: "D+1",
    },
    {
      assetId: "demo-asset-indice-acoes-br",
      name: "ETF Índice Ações Brasil",
      assetClass: "acoes",
      amountCents: amounts.acoes,
      indexer: null,
      indexerRate: null,
      liquidity: "D+2",
    },
    {
      assetId: "demo-asset-cesta-fiis",
      name: "Cesta de FIIs Renda e Logística",
      assetClass: "fiis",
      amountCents: amounts.fiis,
      indexer: null,
      indexerRate: null,
      liquidity: "D+2",
    },
    {
      assetId: "demo-asset-etf-global",
      name: "ETF Mercado Internacional (S&P 500)",
      assetClass: "internacional",
      amountCents: amounts.internacional,
      indexer: null,
      indexerRate: null,
      liquidity: "D+2",
    },
  ];
}

const SEED_CHECKINS: SeedCheckInSpec[] = [
  {
    id: "demo-checkin-2026-08",
    referenceMonth: "2026-08",
    createdAt: new Date("2026-08-15T14:00:00.000Z"),
    userNotes:
      "Primeiro acompanhamento mensal no Tio Rico. Quero reduzir gradualmente a concentração em pós-fixado usando os novos aportes, sem vender posições atuais.",
    contributionCents: 200_000, // R$ 2.000,00
    positions: makePositions({
      rendaFixaPos: 1_680_000, // 40,00%
      caixa: 630_000, // 15,00%
      rendaFixaIpca: 630_000, // 15,00%
      acoes: 546_000, // 13,00%
      fiis: 462_000, // 11,00%
      internacional: 252_000, // 6,00%
    }), // Total: R$ 42.000,00
    macro: MacroIndicatorsSchema.parse({
      selicMetaAnnual: 14.75,
      selicDate: "2026-08-14",
      cdiAnnual: 14.65,
      cdiDaily: 0.0542,
      cdiDate: "2026-08-14",
      ipcaMonthly: 0.36,
      ipca12m: 4.82,
      ipcaDate: "2026-07-01",
      ipcaHistory: [
        { date: "2026-03-01", value: 0.48 },
        { date: "2026-04-01", value: 0.42 },
        { date: "2026-05-01", value: 0.39 },
        { date: "2026-06-01", value: 0.34 },
        { date: "2026-07-01", value: 0.36 },
      ],
      source: "bcb_sgs",
      fetchedAt: "2026-08-15T13:55:00.000Z",
      isStale: false,
    }),
    news: NewsFetchResultSchema.parse({
      items: [
        {
          title:
            "Copom mantém Selic em 14,75% ao ano e reforça postura cautelosa com inflação de serviços",
          url: "https://www.bcb.gov.br/detalhenoticia/copom-2026-08",
          source: "bcb.gov.br",
          publishedAt: "2026-08-12",
          snippet:
            "Comitê destacou juro real restritivo enquanto acompanha convergência do IPCA em 12 meses.",
          topic: "selic",
        },
        {
          title:
            "IPCA acumulado em 12 meses desacelera para 4,82% com alívio em alimentos",
          url: "https://agenciabrasil.ebc.com.br/economia/ipca-2026-08",
          source: "agenciabrasil.ebc.com.br",
          publishedAt: "2026-08-10",
          snippet:
            "Índice oficial de inflação mostrou leitura moderada em julho, favorecendo títulos atrelados ao IPCA.",
          topic: "ipca",
        },
      ],
      newsAvailable: true,
      fetchedAt: "2026-08-15T13:56:00.000Z",
      queriesUsed: ["Selic Copom juros Brasil", "IPCA inflacao Brasil"],
    }),
    macroNote:
      "Com Selic em 14,75% a.a. e IPCA em 4,82%, o juro real elevado mantém a renda fixa pós-fixada atrativa no curto prazo, mas a diversificação gradual em IPCA+ e classes de risco reduz dependência de um único ciclo de juros.",
  },
  {
    id: "demo-checkin-2026-09",
    referenceMonth: "2026-09",
    createdAt: new Date("2026-09-15T14:00:00.000Z"),
    userNotes:
      "Direcionei o aporte do mês passado para ações, IPCA+ e FIIs conforme sugerido. Mantendo aporte disciplinado de R$ 2.000,00.",
    contributionCents: 200_000, // R$ 2.000,00
    positions: makePositions({
      rendaFixaPos: 1_698_000, // 38,07%
      caixa: 636_000, // 14,26%
      rendaFixaIpca: 715_000, // 16,03%
      acoes: 645_000, // 14,46%
      fiis: 496_000, // 11,12%
      internacional: 270_000, // 6,05%
    }), // Total: R$ 44.600,00 (+R$ 2.600,00 vs anterior; +R$ 600,00 ganho est.)
    macro: MacroIndicatorsSchema.parse({
      selicMetaAnnual: 14.5,
      selicDate: "2026-09-14",
      cdiAnnual: 14.4,
      cdiDaily: 0.0533,
      cdiDate: "2026-09-14",
      ipcaMonthly: 0.34,
      ipca12m: 4.71,
      ipcaDate: "2026-08-01",
      ipcaHistory: [
        { date: "2026-04-01", value: 0.42 },
        { date: "2026-05-01", value: 0.39 },
        { date: "2026-06-01", value: 0.34 },
        { date: "2026-07-01", value: 0.36 },
        { date: "2026-08-01", value: 0.34 },
      ],
      source: "bcb_sgs",
      fetchedAt: "2026-09-15T13:55:00.000Z",
      isStale: false,
    }),
    news: NewsFetchResultSchema.parse({
      items: [
        {
          title:
            "Banco Central inicia ajuste gradual e reduz Selic para 14,50% ao ano",
          url: "https://www.bcb.gov.br/detalhenoticia/copom-2026-09",
          source: "bcb.gov.br",
          publishedAt: "2026-09-11",
          snippet:
            "Corte de 0,25 p.p. manteve política monetária em terreno contracionista, sinalizando passos condicionados aos dados.",
          topic: "selic",
        },
        {
          title:
            "Fundos imobiliários e bolsas locais reagem à perspectiva de alívio gradual nos juros",
          url: "https://www.infomoney.com.br/mercados/fiis-juros-2026-09",
          source: "infomoney.com.br",
          publishedAt: "2026-09-13",
          snippet:
            "Fechamento da curva longa de juros ajudou a valorização moderada de ativos reais e renda variável.",
          topic: "fiis",
        },
      ],
      newsAvailable: true,
      fetchedAt: "2026-09-15T13:56:00.000Z",
      queriesUsed: ["Selic Copom corte juros", "FIIs renda variavel Brasil"],
    }),
    macroNote:
      "O início de ajuste da Selic para 14,50% a.a. com IPCA em 4,71% reforça a importância de equilibrar a carteira antes de ciclos mais longos de queda de juros, beneficiando gradualmente IPCA+, FIIs e ações.",
  },
  {
    id: "demo-checkin-2026-10",
    referenceMonth: "2026-10",
    createdAt: new Date("2026-10-15T14:00:00.000Z"),
    userNotes:
      "Consegui elevar o aporte para R$ 2.200,00 após bônus trimestral. Segui reforçando as classes abaixo da meta e comecei a aumentar exposição internacional.",
    contributionCents: 220_000, // R$ 2.200,00
    positions: makePositions({
      rendaFixaPos: 1_640_000, // 34,67%
      caixa: 595_000, // 12,58%
      rendaFixaIpca: 825_000, // 17,44%
      acoes: 760_000, // 16,07%
      fiis: 570_000, // 12,05%
      internacional: 340_000, // 7,19%
    }), // Total: R$ 47.300,00 (+R$ 2.700,00 vs anterior; +R$ 500,00 ganho est.)
    macro: MacroIndicatorsSchema.parse({
      selicMetaAnnual: 14.25,
      selicDate: "2026-10-14",
      cdiAnnual: 14.15,
      cdiDaily: 0.0525,
      cdiDate: "2026-10-14",
      ipcaMonthly: 0.31,
      ipca12m: 4.62,
      ipcaDate: "2026-09-01",
      ipcaHistory: [
        { date: "2026-05-01", value: 0.39 },
        { date: "2026-06-01", value: 0.34 },
        { date: "2026-07-01", value: 0.36 },
        { date: "2026-08-01", value: 0.34 },
        { date: "2026-09-01", value: 0.31 },
      ],
      source: "bcb_sgs",
      fetchedAt: "2026-10-15T13:55:00.000Z",
      isStale: false,
    }),
    news: NewsFetchResultSchema.parse({
      items: [
        {
          title:
            "Selic recua para 14,25% com inflação em 12 meses controlada em 4,62%",
          url: "https://www.bcb.gov.br/detalhenoticia/copom-2026-10",
          source: "bcb.gov.br",
          publishedAt: "2026-10-10",
          snippet:
            "Autoridade monetária manteve comunicação prudente sobre riscos fiscais e cenário externo.",
          topic: "selic",
        },
        {
          title:
            "Dólar e mercados globais seguem voláteis diante de decisões de juros nos EUA",
          url: "https://valor.globo.com/financas/internacional-2026-10",
          source: "valor.globo.com",
          publishedAt: "2026-10-12",
          snippet:
            "Exposição internacional diversificada ajuda a amortecer riscos domésticos em carteiras moderadas.",
          topic: "internacional",
        },
      ],
      newsAvailable: true,
      fetchedAt: "2026-10-15T13:56:00.000Z",
      queriesUsed: ["Selic IPCA outubro 2026", "mercados globais dolar"],
    }),
    macroNote:
      "A continuidade da Selic em 14,25% a.a. com IPCA em 4,62% mantém bom carrego na renda fixa enquanto o reforço gradual em ações, FIIs e internacional aproxima a carteira do equilíbrio moderado planejado.",
  },
  {
    id: "demo-checkin-2026-11",
    referenceMonth: "2026-11",
    createdAt: new Date("2026-11-15T14:00:00.000Z"),
    userNotes:
      "Aderência bem próxima do alvo! Aumentei o aporte para R$ 2.500,00 neste mês para fechar o ano com todas as classes quase alinhadas.",
    contributionCents: 250_000, // R$ 2.500,00
    positions: makePositions({
      rendaFixaPos: 1_512_000, // 30,00%
      caixa: 554_400, // 11,00%
      rendaFixaIpca: 957_600, // 19,00%
      acoes: 907_200, // 18,00%
      fiis: 655_200, // 13,00%
      internacional: 453_600, // 9,00%
    }), // Total: R$ 50.400,00 (+R$ 3.100,00 vs anterior; +R$ 600,00 ganho est.)
    macro: MacroIndicatorsSchema.parse({
      selicMetaAnnual: 14.25,
      selicDate: "2026-11-14",
      cdiAnnual: 14.15,
      cdiDaily: 0.0525,
      cdiDate: "2026-11-14",
      ipcaMonthly: 0.29,
      ipca12m: 4.55,
      ipcaDate: "2026-10-01",
      ipcaHistory: [
        { date: "2026-06-01", value: 0.34 },
        { date: "2026-07-01", value: 0.36 },
        { date: "2026-08-01", value: 0.34 },
        { date: "2026-09-01", value: 0.31 },
        { date: "2026-10-01", value: 0.29 },
      ],
      source: "bcb_sgs",
      fetchedAt: "2026-11-15T13:55:00.000Z",
      isStale: false,
    }),
    news: NewsFetchResultSchema.parse({
      items: [
        {
          title:
            "Copom mantém Selic estável em 14,25% em pausa técnica e monitora expectativas de 2027",
          url: "https://www.bcb.gov.br/detalhenoticia/copom-2026-11",
          source: "bcb.gov.br",
          publishedAt: "2026-11-12",
          snippet:
            "Juro real próximo de 9,28% ao ano segue sustentando a rentabilidade real de títulos públicos.",
          topic: "selic",
        },
        {
          title:
            "IPCA de outubro sobe 0,29% e leva acumulado em 12 meses a 4,55%",
          url: "https://agenciabrasil.ebc.com.br/economia/ipca-2026-11",
          source: "agenciabrasil.ebc.com.br",
          publishedAt: "2026-11-10",
          snippet:
            "Inflação próxima do teto da meta reforça disciplina na combinação entre títulos IPCA+ e ativos geradores de renda.",
          topic: "ipca",
        },
      ],
      newsAvailable: true,
      fetchedAt: "2026-11-15T13:56:00.000Z",
      queriesUsed: [
        "Selic Copom novembro 2026",
        "IPCA acumulado 12 meses Brasil",
      ],
    }),
    macroNote:
      "Com a Selic estável em 14,25% a.a. e IPCA em 4,55%, o juro real segue elevado. A carteira alcançou alto nível de equilíbrio entre proteção inflacionária, liquidez e crescimento de longo prazo.",
  },
];

function buildSeedAiAnalysis(params: {
  spec: SeedCheckInSpec;
  motorResult: MotorCalculationResult;
  previousTotalCents: number | null;
  previousAdherenceScore: number | null;
  previousReferenceMonth: ReferenceMonth | null;
}): AiAnalysisOutput {
  const {
    spec,
    motorResult,
    previousTotalCents,
    previousAdherenceScore,
    previousReferenceMonth,
  } = params;

  const overweight = motorResult.allocations
    .filter((a) => a.deviationPct > 0.5)
    .sort((a, b) => b.deviationPct - a.deviationPct);
  const underweight = motorResult.allocations
    .filter((a) => a.deviationPct < -0.5)
    .sort((a, b) => a.deviationPct - b.deviationPct);

  const topOver = overweight[0];
  const topUnder = underweight[0];

  const resumoExecutivo =
    `No check-in de ${spec.referenceMonth}, a carteira soma ${formatCentsBRL(motorResult.totalCurrentCents)} ` +
    `com aderência atual de ${motorResult.adherenceScore.toFixed(2).replace(".", ",")}/100. ` +
    `Com o novo aporte de ${formatCentsBRL(motorResult.contributionCents)}, o patrimônio projetado vai a ` +
    `${formatCentsBRL(motorResult.totalAfterContributionCents)} e a aderência sobe para ` +
    `${motorResult.adherenceScoreAfterContribution.toFixed(2).replace(".", ",")}/100.`;

  const diagnosticoParts: string[] = [];
  if (topOver) {
    diagnosticoParts.push(
      `${ASSET_CLASS_LABELS[topOver.assetClass]} está em ${formatPctBR(topOver.currentPct)} frente ao alvo de ${formatPctBR(topOver.targetPct)} (${formatSignedPpBR(topOver.deviationPct)}).`,
    );
  }
  if (topUnder) {
    diagnosticoParts.push(
      `${ASSET_CLASS_LABELS[topUnder.assetClass]} aparece abaixo da meta em ${formatPctBR(topUnder.currentPct)} vs. alvo de ${formatPctBR(topUnder.targetPct)} (${formatSignedPpBR(topUnder.deviationPct)}).`,
    );
  }
  diagnosticoParts.push(
    `Rentabilidade nominal estimada pelo motor: ${formatPctBR(motorResult.estimatedAnnualYieldPct)} a.a. (juro real estimado de ${formatPctBR(motorResult.estimatedRealYieldPct)} a.a. frente ao IPCA de ${formatPctBR(spec.macro.ipca12m)}).`,
  );

  let evolucaoDesdeUltimoCheckin: string;
  if (previousTotalCents === null || previousReferenceMonth === null) {
    evolucaoDesdeUltimoCheckin =
      `Este é o primeiro check-in registrado (${spec.referenceMonth}), servindo como linha de base com patrimônio de ${formatCentsBRL(motorResult.totalCurrentCents)} e aderência de ${motorResult.adherenceScore.toFixed(2).replace(".", ",")}/100.`;
  } else {
    const deltaCents = motorResult.totalCurrentCents - previousTotalCents;
    const deltaPct =
      previousTotalCents > 0
        ? round2((deltaCents / previousTotalCents) * 100)
        : 0;
    const estGainCents = deltaCents - spec.contributionCents;
    const adherenceDeltaText =
      previousAdherenceScore !== null
        ? ` A aderência variou ${formatSignedPpBR(round2(motorResult.adherenceScore - previousAdherenceScore))} (de ${previousAdherenceScore.toFixed(2).replace(".", ",")} para ${motorResult.adherenceScore.toFixed(2).replace(".", ",")}).`
        : "";
    evolucaoDesdeUltimoCheckin =
      `Desde ${previousReferenceMonth}, o patrimônio evoluiu ${formatSignedCentsBRL(deltaCents)} (${formatSignedPctBR(deltaPct)}), ` +
      `com aporte registrado de ${formatCentsBRL(spec.contributionCents)} e variação estimada sem aporte de ${formatSignedCentsBRL(estGainCents)}.${adherenceDeltaText}`;
  }

  const opcoesDeAjuste = motorResult.allocations
    .filter((a) => a.suggestedContributionCents > 0)
    .sort((a, b) => b.suggestedContributionCents - a.suggestedContributionCents)
    .map((allocation) => ({
      classeAtivo: allocation.assetClass,
      acaoSugerida: `Direcionar parte do novo aporte para ${ASSET_CLASS_LABELS[allocation.assetClass]}`,
      valorSugeridoCentavos: allocation.suggestedContributionCents,
      justificativa:
        `Classe está em ${formatPctBR(allocation.currentPct)} frente ao alvo de ${formatPctBR(allocation.targetPct)} (${formatSignedPpBR(allocation.deviationPct)}). ` +
        `O direcionamento projeta a participação para ${formatPctBR(allocation.projectedPctAfterContribution)} sem necessidade de vendas.`,
    }));

  const alertas: string[] = [];
  if (topOver && topOver.deviationPct >= 5) {
    alertas.push(
      `Concentração acima do alvo em ${ASSET_CLASS_LABELS[topOver.assetClass]} (${formatSignedPpBR(topOver.deviationPct)}). Priorize rebalanceamento via novos aportes.`,
    );
  }
  alertas.push(
    `Juro real da Selic em ${formatPctBR(motorResult.realInterestRatePct)} a.a. favorece paciência na transição para o alvo moderado sem comprometer a reserva de liquidez.`,
  );

  const fontesConsultadas = spec.news.items.map((item) => ({
    titulo: item.title,
    url: item.url,
    fonte: item.source,
  }));

  return AiAnalysisOutputSchema.parse({
    resumoExecutivo,
    diagnosticoAlocacao: diagnosticoParts.join(" "),
    evolucaoDesdeUltimoCheckin,
    impactoMacroENoticias: spec.macroNote,
    opcoesDeAjuste,
    alertas,
    fontesConsultadas,
    disclaimer: EDUCATIONAL_DISCLAIMER,
  });
}

async function main(): Promise<void> {
  const prisma = getPrisma();

  try {
    console.log("Iniciando seed idempotente do Tio Rico (Marina Costa)...");

    // 1. Upsert demo investor profile
    await prisma.investorProfile.upsert({
      where: { id: DEMO_PROFILE_ID },
      update: {
        name: "Marina Costa",
        email: "marina.costa@demo.tiorico.app",
        riskProfile: "moderado",
        horizonMonths: 60,
        monthlyIncomeCents: 950_000,
        goals: toPrismaJson(DEMO_GOALS),
        targetAllocation: toPrismaJson(DEMO_TARGET_ALLOCATION),
        preferences: toPrismaJson(DEMO_PREFERENCES),
      },
      create: {
        id: DEMO_PROFILE_ID,
        name: "Marina Costa",
        email: "marina.costa@demo.tiorico.app",
        riskProfile: "moderado",
        horizonMonths: 60,
        monthlyIncomeCents: 950_000,
        goals: toPrismaJson(DEMO_GOALS),
        targetAllocation: toPrismaJson(DEMO_TARGET_ALLOCATION),
        preferences: toPrismaJson(DEMO_PREFERENCES),
      },
    });

    // 2. Sync current PortfolioAsset rows from latest check-in (2026-11) idempotently
    const latestSpec = SEED_CHECKINS[SEED_CHECKINS.length - 1];
    const seedAssetIds = latestSpec.positions.map((pos) => pos.assetId);

    await prisma.$transaction(async (tx) => {
      await tx.portfolioAsset.deleteMany({
        where: {
          profileId: DEMO_PROFILE_ID,
          id: { notIn: seedAssetIds },
        },
      });

      for (const pos of latestSpec.positions) {
        await tx.portfolioAsset.upsert({
          where: { id: pos.assetId },
          update: {
            profileId: DEMO_PROFILE_ID,
            name: pos.name,
            assetClass: pos.assetClass,
            amountCents: pos.amountCents,
            indexer: pos.indexer ?? null,
            indexerRate: pos.indexerRate ?? null,
            liquidity: pos.liquidity ?? null,
          },
          create: {
            id: pos.assetId,
            profileId: DEMO_PROFILE_ID,
            name: pos.name,
            assetClass: pos.assetClass,
            amountCents: pos.amountCents,
            indexer: pos.indexer ?? null,
            indexerRate: pos.indexerRate ?? null,
            liquidity: pos.liquidity ?? null,
          },
        });
      }
    });

    // 3. Upsert the 4 realistic monthly CheckIns with deterministic motor results & AI analyses
    let previousTotalCents: number | null = null;
    let previousAdherenceScore: number | null = null;
    let previousReferenceMonth: ReferenceMonth | null = null;

    for (const spec of SEED_CHECKINS) {
      const motorResult = MotorCalculationResultSchema.parse(
        calculatePortfolioWithMotor({
          riskProfile: "moderado",
          horizonMonths: 60,
          positions: spec.positions,
          targetAllocation: DEMO_TARGET_ALLOCATION,
          contributionCents: spec.contributionCents,
          macro: spec.macro,
        }),
      );

      const aiAnalysis = buildSeedAiAnalysis({
        spec,
        motorResult,
        previousTotalCents,
        previousAdherenceScore,
        previousReferenceMonth,
      });

      const totalValueCents = motorResult.totalCurrentCents;

      await prisma.$transaction(async (tx) => {
        await tx.checkIn.upsert({
          where: { id: spec.id },
          update: {
            profileId: DEMO_PROFILE_ID,
            referenceMonth: spec.referenceMonth,
            userNotes: spec.userNotes,
            contributionCents: spec.contributionCents,
            totalValueCents,
            adherenceScore: motorResult.adherenceScore,
            macroSnapshot: toPrismaJson(spec.macro),
            motorResult: toPrismaJson(motorResult),
            aiAnalysis: toPrismaJson(aiAnalysis),
            newsSources: toPrismaJson(spec.news),
            createdAt: spec.createdAt,
          },
          create: {
            id: spec.id,
            profileId: DEMO_PROFILE_ID,
            referenceMonth: spec.referenceMonth,
            userNotes: spec.userNotes,
            contributionCents: spec.contributionCents,
            totalValueCents,
            adherenceScore: motorResult.adherenceScore,
            macroSnapshot: toPrismaJson(spec.macro),
            motorResult: toPrismaJson(motorResult),
            aiAnalysis: toPrismaJson(aiAnalysis),
            newsSources: toPrismaJson(spec.news),
            createdAt: spec.createdAt,
          },
        });

        await tx.checkInPosition.deleteMany({
          where: { checkInId: spec.id },
        });

        await tx.checkInPosition.createMany({
          data: spec.positions.map((pos, index) => {
            const allocationPct =
              totalValueCents > 0
                ? round2((pos.amountCents / totalValueCents) * 100)
                : 0;
            const targetPct =
              DEMO_TARGET_ALLOCATION[pos.assetClass as AssetClass] ?? 0;

            return {
              id: `${spec.id}-pos-${index + 1}`,
              checkInId: spec.id,
              assetClass: pos.assetClass,
              assetLabel: pos.name,
              amountCents: pos.amountCents,
              allocationPct,
              targetPct,
            };
          }),
        });
      });

      previousTotalCents = totalValueCents;
      previousAdherenceScore = motorResult.adherenceScore;
      previousReferenceMonth = spec.referenceMonth;
    }

    // 4. Upsert latest MacroSnapshot record
    const latestMacro = latestSpec.macro;
    await prisma.macroSnapshot.upsert({
      where: { id: DEMO_MACRO_SNAPSHOT_ID },
      update: {
        selicMetaAnnual: latestMacro.selicMetaAnnual,
        selicDate: latestMacro.selicDate,
        cdiAnnual: latestMacro.cdiAnnual,
        cdiDaily: latestMacro.cdiDaily,
        cdiDate: latestMacro.cdiDate,
        ipcaMonthly: latestMacro.ipcaMonthly,
        ipca12m: latestMacro.ipca12m,
        ipcaDate: latestMacro.ipcaDate,
        rawPayload: toPrismaJson({
          ipcaHistory: latestMacro.ipcaHistory,
          source: latestMacro.source,
        }),
        fetchedAt: new Date(latestMacro.fetchedAt),
      },
      create: {
        id: DEMO_MACRO_SNAPSHOT_ID,
        selicMetaAnnual: latestMacro.selicMetaAnnual,
        selicDate: latestMacro.selicDate,
        cdiAnnual: latestMacro.cdiAnnual,
        cdiDaily: latestMacro.cdiDaily,
        cdiDate: latestMacro.cdiDate,
        ipcaMonthly: latestMacro.ipcaMonthly,
        ipca12m: latestMacro.ipca12m,
        ipcaDate: latestMacro.ipcaDate,
        rawPayload: toPrismaJson({
          ipcaHistory: latestMacro.ipcaHistory,
          source: latestMacro.source,
        }),
        fetchedAt: new Date(latestMacro.fetchedAt),
      },
    });

    console.log(
      `Seed concluído com sucesso: perfil "${DEMO_PROFILE_ID}", ${latestSpec.positions.length} ativos atuais, ${SEED_CHECKINS.length} check-ins mensais e 1 MacroSnapshot.`,
    );
  } finally {
    await prisma.$disconnect();
    const globalWithPool = globalThis as {
      __tioRicoPgPool?: { end: () => Promise<void> };
    };
    if (globalWithPool.__tioRicoPgPool) {
      await globalWithPool.__tioRicoPgPool.end();
    }
  }
}

main().catch((error: unknown) => {
  console.error("Erro ao executar seed do Tio Rico:", error);
  process.exitCode = 1;
});
