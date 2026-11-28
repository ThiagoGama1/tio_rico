import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/prisma", () => ({ getPrisma: vi.fn() }));

import { ipDaRequisicao } from "@/lib/security/rate-limit";

describe("ipDaRequisicao", () => {
  it("uses the first x-forwarded-for entry (the client on Vercel)", () => {
    const headers = new Headers({ "x-forwarded-for": " 203.0.113.7 , 10.0.0.1" });
    expect(ipDaRequisicao(headers)).toBe("203.0.113.7");
  });

  it("falls back to x-real-ip", () => {
    expect(ipDaRequisicao(new Headers({ "x-real-ip": "198.51.100.2" }))).toBe(
      "198.51.100.2",
    );
  });

  it("uses a shared bucket when there is no header, so the limit still applies", () => {
    expect(ipDaRequisicao(new Headers())).toBe("desconhecido");
    expect(ipDaRequisicao(undefined)).toBe("desconhecido");
  });
});
