/**
 * Rascunho do onboarding no sessionStorage (mesma chave usada desde a etapa 1).
 * Cada etapa grava o que preencheu e lê o que já existe, para "Voltar" e
 * "Terminar configuração depois" não perderem nada. O perfil só vai para o
 * banco ao concluir a etapa 3.
 */

export const ONBOARDING_DRAFT_KEY = "tio-rico:onboarding-draft";

export type OnboardingDraft = Record<string, unknown>;

export function lerRascunho(): OnboardingDraft {
  try {
    const bruto = sessionStorage.getItem(ONBOARDING_DRAFT_KEY);
    const valor: unknown = bruto ? JSON.parse(bruto) : {};
    return valor && typeof valor === "object" && !Array.isArray(valor)
      ? (valor as OnboardingDraft)
      : {};
  } catch {
    return {};
  }
}

/** Junta os campos novos ao rascunho existente. */
export function salvarRascunho(campos: OnboardingDraft): void {
  try {
    sessionStorage.setItem(
      ONBOARDING_DRAFT_KEY,
      JSON.stringify({ ...lerRascunho(), ...campos }),
    );
  } catch {
    // sessionStorage indisponível (aba privada/bloqueada): segue sem rascunho.
  }
}

export function apagarRascunho(): void {
  try {
    sessionStorage.removeItem(ONBOARDING_DRAFT_KEY);
  } catch {
    // ignora
  }
}

/** Mês atual no formato do <input type="month">: "YYYY-MM". */
export function mesAtual(agora = new Date()): string {
  return `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, "0")}`;
}

/** "YYYY-MM" anterior ao mês atual? (#52) Vazio não é passado. */
export function prazoNoPassado(valor: string, agora = new Date()): boolean {
  return Boolean(valor) && valor < mesAtual(agora);
}
