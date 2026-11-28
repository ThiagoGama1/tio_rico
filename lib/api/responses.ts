import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

/**
 * Helpers compartilhados pelas rotas de sessão, perfil e carteira.
 * Mesmo formato das rotas de checkins: `{ error, details? }` + `Cache-Control: no-store`.
 */

export const NO_STORE_HEADERS = { "Cache-Control": "no-store" } as const;

export function jsonOk(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, { status, headers: NO_STORE_HEADERS });
}

export function jsonError(
  status: number,
  error: string,
  extra?: Record<string, unknown>,
): NextResponse {
  return NextResponse.json(
    { error, ...extra },
    { status, headers: NO_STORE_HEADERS },
  );
}

export function unauthorized(): NextResponse {
  return jsonError(401, "Não autenticado. Faça login para continuar.");
}

export function databaseNotConfigured(action: string): NextResponse {
  return jsonError(
    503,
    `Banco de dados não configurado. Defina DATABASE_URL para ${action}.`,
  );
}

export function profileNotFound(): NextResponse {
  return jsonError(
    404,
    "Perfil de investidor não encontrado. Crie o perfil em POST /api/profile.",
  );
}

type ParseResult<T> = { ok: true; data: T } | { ok: false; response: NextResponse };

/**
 * Teto do corpo das requisições JSON. O maior corpo legítimo (check-in com o
 * máximo de posições) fica em torno de 20 KB.
 */
export const MAX_JSON_BODY_BYTES = 100_000;

function bodyTooLarge(): NextResponse {
  return jsonError(413, "Corpo da requisição grande demais.");
}

/** Lê o corpo como JSON, recusando corpos acima de MAX_JSON_BODY_BYTES (413). */
export async function readJsonBody(
  request: NextRequest,
): Promise<{ ok: true; body: unknown } | { ok: false; response: NextResponse }> {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_JSON_BODY_BYTES) {
    return { ok: false, response: bodyTooLarge() };
  }

  let text: string;
  try {
    text = await request.text();
  } catch {
    return {
      ok: false,
      response: jsonError(400, "Corpo da requisição deve ser um JSON válido."),
    };
  }
  if (Buffer.byteLength(text, "utf8") > MAX_JSON_BODY_BYTES) {
    return { ok: false, response: bodyTooLarge() };
  }

  try {
    return { ok: true, body: JSON.parse(text) as unknown };
  } catch {
    return {
      ok: false,
      response: jsonError(400, "Corpo da requisição deve ser um JSON válido."),
    };
  }
}

/** Lê o JSON do corpo e valida com Zod (400 se JSON inválido ou dados inválidos). */
export async function parseJsonBody<S extends z.ZodType>(
  request: NextRequest,
  schema: S,
  invalidMessage: string,
): Promise<ParseResult<z.output<S>>> {
  const read = await readJsonBody(request);
  if (!read.ok) return read;
  const body = read.body;

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return {
      ok: false,
      response: jsonError(400, invalidMessage, {
        details: z.flattenError(parsed.error),
      }),
    };
  }
  return { ok: true, data: parsed.data };
}
