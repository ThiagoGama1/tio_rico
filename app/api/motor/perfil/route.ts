import type { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { jsonOk, parseJsonBody, unauthorized } from "@/lib/api/responses";
import { SuitabilityRequestSchema } from "@/lib/types/motor";
import { alocacaoAlvo, calcularPerfil, pontuarRespostas } from "@/motor";

/**
 * POST /api/motor/perfil — questionário de suitability do onboarding.
 * Só calcula, não salva: o front usa `tipo` e `alvoSugerido` em POST/PATCH /api/profile.
 */
export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const parsed = await parseJsonBody(
    request,
    SuitabilityRequestSchema,
    "Respostas inválidas para o questionário de perfil.",
  );
  if (!parsed.ok) return parsed.response;

  const { excluir, ...respostas } = parsed.data;
  const tipo = calcularPerfil(respostas);

  return jsonOk({
    tipo,
    pontos: pontuarRespostas(respostas),
    alvoSugerido: alocacaoAlvo({ tipo, excluir }),
  });
}
