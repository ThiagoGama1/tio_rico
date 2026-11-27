import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionUser } from "@/lib/auth/session";

const mocks = vi.hoisted(() => ({
  getSessionUser: vi.fn<() => Promise<SessionUser | null>>(),
}));

vi.mock("@/lib/auth/session", () => ({
  getSessionUser: mocks.getSessionUser,
}));

import { POST } from "@/app/api/motor/perfil/route";

const USER: SessionUser = { id: "user-1", email: "ana@example.com", name: "Ana" };

const RESPOSTAS = {
  objetivo: "crescer",
  prazo: "3_a_5_anos",
  experiencia: "poupanca_renda_fixa",
  reacaoQueda: "mantem",
};

function makeJsonPostRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost:3000/api/motor/perfil", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("POST /api/motor/perfil", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSessionUser.mockResolvedValue(USER);
  });

  it("returns 401 when no user is logged in", async () => {
    mocks.getSessionUser.mockResolvedValue(null);

    const response = await POST(makeJsonPostRequest(RESPOSTAS));

    expect(response.status).toBe(401);
  });

  it("returns 400 on malformed JSON", async () => {
    const response = await POST(makeJsonPostRequest("{"));

    expect(response.status).toBe(400);
  });

  it("returns 400 with details on an unknown answer", async () => {
    const response = await POST(makeJsonPostRequest({ ...RESPOSTAS, prazo: "amanha" }));
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.details.fieldErrors.prazo).toBeDefined();
  });

  it("returns 400 when a question is missing", async () => {
    const { reacaoQueda: _omitida, ...semReacao } = RESPOSTAS;
    void _omitida;

    const response = await POST(makeJsonPostRequest(semReacao));

    expect(response.status).toBe(400);
  });

  it("returns 200 with profile type, score and suggested target", async () => {
    const response = await POST(makeJsonPostRequest(RESPOSTAS));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(json.tipo).toBe("moderado");
    expect(json.pontos).toBe(7);
    expect(json.alvoSugerido.cripto).toBe(2);
  });

  it("removes excluded classes from the suggested target", async () => {
    const response = await POST(makeJsonPostRequest({ ...RESPOSTAS, excluir: ["cripto"] }));
    const json = await response.json();

    //moderado sem cripto, arredondado pelo maior resto: 31/15/10/5/10/21/8
    expect(json.alvoSugerido).toEqual({
      renda_fixa_pos: 31,
      renda_fixa_ipca: 15,
      renda_fixa_pre: 10,
      caixa: 5,
      fiis: 10,
      acoes: 21,
      internacional: 8,
    });
  });

  it("returns the suggested target as integers summing exactly 100", async () => {
    for (const excluir of [[], ["cripto"], ["acoes", "internacional"]]) {
      const response = await POST(makeJsonPostRequest({ ...RESPOSTAS, excluir }));
      const json = await response.json();
      const valores = Object.values<number>(json.alvoSugerido);

      expect(valores.every(Number.isInteger)).toBe(true);
      expect(valores.reduce((a, b) => a + b, 0)).toBe(100);
    }
  });
});
