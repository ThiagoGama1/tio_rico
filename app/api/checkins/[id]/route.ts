import { NextResponse, type NextRequest } from "next/server";
import { isDatabaseConfigured } from "@/lib/db/prisma";
import {
  RepositoryHydrationError,
  getCheckInById,
} from "@/lib/history/repository";

const NO_STORE_HEADERS = { "Cache-Control": "no-store" } as const;

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  // Await params before early returns so Next.js 16.4 (cacheComponents: true)
  // keeps this dynamic route handler request-scoped.
  const { id } = await context.params;
  const trimmedId = id.trim();

  if (!isDatabaseConfigured()) {
    return NextResponse.json(
      {
        error:
          "Banco de dados não configurado. Defina DATABASE_URL para consultar check-ins.",
      },
      { status: 503, headers: NO_STORE_HEADERS },
    );
  }

  if (!trimmedId) {
    return NextResponse.json(
      { error: "Identificador de check-in inválido." },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  try {
    const checkIn = await getCheckInById(trimmedId);

    if (!checkIn) {
      return NextResponse.json(
        { error: "Check-in não encontrado." },
        { status: 404, headers: NO_STORE_HEADERS },
      );
    }

    return NextResponse.json(checkIn, {
      status: 200,
      headers: NO_STORE_HEADERS,
    });
  } catch (error) {
    if (error instanceof RepositoryHydrationError) {
      return NextResponse.json(
        { error: "Dados do check-in inconsistentes no banco de dados." },
        { status: 500, headers: NO_STORE_HEADERS },
      );
    }

    return NextResponse.json(
      { error: "Falha ao consultar o check-in no banco de dados." },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }
}
