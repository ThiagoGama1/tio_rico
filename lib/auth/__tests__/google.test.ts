import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GOOGLE_PROVIDER_ID, isGoogleAuthConfigured } from "@/lib/auth/google";

describe("Google OAuth configuration", () => {
  const originalId = process.env.AUTH_GOOGLE_ID;
  const originalSecret = process.env.AUTH_GOOGLE_SECRET;

  beforeEach(() => {
    delete process.env.AUTH_GOOGLE_ID;
    delete process.env.AUTH_GOOGLE_SECRET;
  });

  afterEach(() => {
    if (originalId === undefined) {
      delete process.env.AUTH_GOOGLE_ID;
    } else {
      process.env.AUTH_GOOGLE_ID = originalId;
    }

    if (originalSecret === undefined) {
      delete process.env.AUTH_GOOGLE_SECRET;
    } else {
      process.env.AUTH_GOOGLE_SECRET = originalSecret;
    }
  });

  it("exposes the canonical provider ID", () => {
    expect(GOOGLE_PROVIDER_ID).toBe("google");
  });

  it("returns false when either AUTH_GOOGLE_ID or AUTH_GOOGLE_SECRET is missing or blank", () => {
    expect(isGoogleAuthConfigured()).toBe(false);

    process.env.AUTH_GOOGLE_ID = "client-id";
    expect(isGoogleAuthConfigured()).toBe(false);

    process.env.AUTH_GOOGLE_SECRET = "   ";
    expect(isGoogleAuthConfigured()).toBe(false);

    delete process.env.AUTH_GOOGLE_ID;
    process.env.AUTH_GOOGLE_SECRET = "client-secret";
    expect(isGoogleAuthConfigured()).toBe(false);
  });

  it("returns true when both AUTH_GOOGLE_ID and AUTH_GOOGLE_SECRET are non-empty", () => {
    process.env.AUTH_GOOGLE_ID = "client-id";
    process.env.AUTH_GOOGLE_SECRET = "client-secret";

    expect(isGoogleAuthConfigured()).toBe(true);
  });
});
