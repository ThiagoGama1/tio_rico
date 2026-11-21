import { NextResponse, type NextRequest } from "next/server";
import { isDatabaseConfigured } from "@/lib/db/prisma";
import { computePortfolioEvolution } from "@/lib/history/evolution";
import {
  RepositoryHydrationError,
  getProfileWithAssets,
  listCheckIns,
} from "@/lib/history/repository";

const NO_STORE_HEADERS = { "Cache-Control": "no-store" } as const;

export async function GET(request: NextRequest): Promise<NextResponse> {
  // Read searchParams before early returns so Next.js 16.4 (cacheComponents: true)
  // always treats this route handler as dynamic even when DATABASE_URL is absent at build time.
  const rawProfileId = request.nextUrl.searchParams.get("profileId");
  const profileId = rawProfileId?.trim() || undefined;

  if (!isDatabaseConfigured()) {
    return NextResponse.json(
      {
        error:
          "Banco de dados não configurado. Defina DATABASE_URL para consultar a evolução da carteira.",
      },
      { status: 503, headers: NO_STORE_HEADERS },
    );
  }

  try {
    const profile = await getProfileWithAssets(profileId);

    if (!profile) {
      return NextResponse.json(
        { error: "Perfil de investidor não encontrado." },
        { status: 404, headers: NO_STORE_HEADERS },
      );
    }

    const checkIns = await listCheckIns(profile.id, { order: "asc" });
    const evolution = computePortfolioEvolution(checkIns, {
      id: profile.id,
      goals: profile.goals,
      targetAllocation: profile.targetAllocation,
    });

    return NextResponse.json(
      {
        profile,
        evolution,
        checkInsCount: checkIns.length,
      },
      { status: 200, headers: NO_STORE_HEADERS },
    );
  } catch (error) {
    if (error instanceof RepositoryHydrationError) {
      return NextResponse.json(
        { error: "Histórico da carteira com dados inconsistentes." },
        { status: 500, headers: NO_STORE_HEADERS },
      );
    }

    return NextResponse.json(
      { error: "Falha ao calcular a evolução da carteira." },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }
}
