import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  MAX_JSON_BODY_BYTES,
  parseJsonBody,
  readJsonBody,
} from "@/lib/api/responses";

function post(body: string, headers: Record<string, string> = {}) {
  return new NextRequest("http://localhost:3000/api/x", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body,
  });
}

describe("readJsonBody", () => {
  it("parses a normal JSON body", async () => {
    const result = await readJsonBody(post('{"a":1}'));
    expect(result).toEqual({ ok: true, body: { a: 1 } });
  });

  it("returns 413 when the body is larger than the limit", async () => {
    const big = JSON.stringify({ x: "y".repeat(MAX_JSON_BODY_BYTES) });
    const result = await readJsonBody(post(big));

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(413);
  });

  it("returns 413 from the declared content-length without reading the body", async () => {
    const result = await readJsonBody(
      post("{}", { "content-length": String(MAX_JSON_BODY_BYTES + 1) }),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(413);
  });

  it("returns 400 for invalid JSON", async () => {
    const result = await readJsonBody(post('{"a":'));

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(400);
  });
});

describe("parseJsonBody", () => {
  it("applies the same size limit before validating", async () => {
    const big = JSON.stringify({ x: "y".repeat(MAX_JSON_BODY_BYTES) });
    const result = await parseJsonBody(post(big), z.object({ x: z.string() }), "inválido");

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(413);
  });
});
