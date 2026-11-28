export const GOOGLE_PROVIDER_ID = "google";

/**
 * Retorna `true` quando o OAuth do Google possui Client ID e Client Secret configurados.
 */
export function isGoogleAuthConfigured(): boolean {
  return Boolean(
    process.env.AUTH_GOOGLE_ID?.trim() &&
      process.env.AUTH_GOOGLE_SECRET?.trim(),
  );
}
