"use client";

import { Dialog } from "@base-ui/react/dialog";
import { Pencil, Plus, Trash2, X } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { NavigationMenu } from "@/components/ui/navigationMenu";
import { formatCentsBRL } from "@/lib/history/evolution";
import type { PortfolioAssetRecord } from "@/lib/history/repository";
import {
  ASSET_CLASSES,
  ASSET_CLASS_LABELS,
  type AssetClass,
} from "@/lib/types/domain";

type WalletResponse = {
  assets: PortfolioAssetRecord[];
  totalCents: number;
};

type AssetDraft = {
  name: string;
  assetClass: AssetClass;
  amount: string;
  indexer: string;
  indexerRate: string;
  liquidity: string;
};

type ApiError = { error?: string };

const emptyDraft: AssetDraft = {
  name: "",
  assetClass: "renda_fixa_pos",
  amount: "",
  indexer: "",
  indexerRate: "",
  liquidity: "",
};

function centsFromCurrency(value: string) {
  const normalized = value.trim().replace(/[^\d,.-]/g, "");
  if (!normalized) return 0;

  const decimalValue = normalized.includes(",")
    ? normalized.replace(/\./g, "").replace(",", ".")
    : normalized;
  const amount = Number(decimalValue);

  return Number.isFinite(amount) && amount >= 0 ? Math.round(amount * 100) : Number.NaN;
}

function decimalFromInput(value: string) {
  const normalized = value.trim().replace("%", "").replace(",", ".");
  if (!normalized) return null;

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function draftFromAsset(asset: PortfolioAssetRecord): AssetDraft {
  return {
    name: asset.name,
    assetClass: asset.assetClass,
    amount: String(asset.amountCents / 100).replace(".", ","),
    indexer: asset.indexer ?? "",
    indexerRate:
      asset.indexerRate === null ? "" : String(asset.indexerRate).replace(".", ","),
    liquidity: asset.liquidity ?? "",
  };
}

function assetDetail(asset: PortfolioAssetRecord) {
  const details = [ASSET_CLASS_LABELS[asset.assetClass]];
  const indexer = [asset.indexer, asset.indexerRate === null ? null : `${asset.indexerRate}%`]
    .filter(Boolean)
    .join(" ");

  if (indexer) details.push(indexer);
  if (asset.liquidity) details.push(asset.liquidity);
  return details.join(" · ");
}

function ErrorMessage({ children }: { children: React.ReactNode }) {
  return (
    <p aria-live="polite" className="mt-4 font-k2d text-sm text-destructive">
      {children}
    </p>
  );
}

function FieldLabel({ children, htmlFor }: { children: string; htmlFor: string }) {
  return (
    <label
      htmlFor={htmlFor}
      className="font-intel text-xs tracking-[0.08em] text-muted uppercase"
    >
      {children}
    </label>
  );
}

export function Wallet() {
  const router = useRouter();
  const [assets, setAssets] = useState<PortfolioAssetRecord[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "unavailable">("loading");
  const [message, setMessage] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingAsset, setEditingAsset] = useState<PortfolioAssetRecord | null>(null);
  const [draft, setDraft] = useState<AssetDraft>(emptyDraft);
  const [formError, setFormError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    async function loadAssets() {
      try {
        const response = await fetch("/api/portfolio/assets", { signal: controller.signal });
        const payload = (await response.json().catch(() => null)) as WalletResponse | ApiError | null;

        if (!response.ok) {
          if (response.status === 401) {
            router.replace("/login");
            return;
          }
          throw new Error(
            payload && "error" in payload && typeof payload.error === "string"
              ? payload.error
              : "Não foi possível carregar sua carteira agora.",
          );
        }

        if (!controller.signal.aborted && payload && "assets" in payload) {
          setAssets(payload.assets);
          setStatus("ready");
        }
      } catch (error) {
        if (controller.signal.aborted) return;
        setStatus("unavailable");
        setMessage(
          error instanceof Error
            ? error.message
            : "Não foi possível carregar sua carteira agora.",
        );
      }
    }

    void loadAssets();
    return () => controller.abort();
  }, [router]);

  const summary = useMemo(() => {
    const totalCents = assets.reduce((total, asset) => total + asset.amountCents, 0);
    const totalsByClass = new Map<AssetClass, number>();

    for (const asset of assets) {
      totalsByClass.set(
        asset.assetClass,
        (totalsByClass.get(asset.assetClass) ?? 0) + asset.amountCents,
      );
    }

    const largest = [...totalsByClass.entries()].sort(([, left], [, right]) => right - left)[0];
    return {
      totalCents,
      classes: totalsByClass.size,
      largestPct: largest && totalCents > 0 ? (largest[1] / totalCents) * 100 : null,
    };
  }, [assets]);

  function openCreateDialog() {
    setEditingAsset(null);
    setDraft(emptyDraft);
    setFormError("");
    setIsDialogOpen(true);
  }

  function openEditDialog(asset: PortfolioAssetRecord) {
    setEditingAsset(asset);
    setDraft(draftFromAsset(asset));
    setFormError("");
    setIsDialogOpen(true);
  }

  function closeDialog() {
    if (isSaving) return;
    setIsDialogOpen(false);
  }

  async function saveAsset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const amountCents = centsFromCurrency(draft.amount);
    const indexerRate = decimalFromInput(draft.indexerRate);

    if (!draft.name.trim()) {
      setFormError("Informe o nome do investimento.");
      return;
    }
    if (!Number.isFinite(amountCents)) {
      setFormError("Informe um valor válido para o investimento.");
      return;
    }
    if (indexerRate !== null && !Number.isFinite(indexerRate)) {
      setFormError("Informe uma taxa válida ou deixe o campo em branco.");
      return;
    }

    const payload = {
      name: draft.name.trim(),
      assetClass: draft.assetClass,
      amountCents,
      indexer: draft.indexer.trim() || null,
      indexerRate,
      liquidity: draft.liquidity.trim() || null,
    };

    setFormError("");
    setIsSaving(true);
    try {
      const response = await fetch(
        editingAsset ? `/api/portfolio/assets/${editingAsset.id}` : "/api/portfolio/assets",
        {
          method: editingAsset ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const result = (await response.json().catch(() => null)) as
        | { asset: PortfolioAssetRecord }
        | ApiError
        | null;

      if (!response.ok || !result || !("asset" in result)) {
        throw new Error(
          result && "error" in result && typeof result.error === "string"
            ? result.error
            : "Não foi possível salvar o investimento.",
        );
      }

      setAssets((current) => {
        const withoutSaved = current.filter((asset) => asset.id !== result.asset.id);
        return [...withoutSaved, result.asset].sort(
          (left, right) => right.amountCents - left.amountCents || left.name.localeCompare(right.name),
        );
      });
      setIsDialogOpen(false);
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : "Não foi possível salvar o investimento.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function deleteAsset(asset: PortfolioAssetRecord) {
    setDeletingId(asset.id);
    setMessage("");
    try {
      const response = await fetch(`/api/portfolio/assets/${asset.id}`, { method: "DELETE" });
      const result = (await response.json().catch(() => null)) as ApiError | null;
      if (!response.ok) {
        throw new Error(result?.error ?? "Não foi possível remover o investimento.");
      }
      setAssets((current) => current.filter((currentAsset) => currentAsset.id !== asset.id));
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Não foi possível remover o investimento.",
      );
    } finally {
      setDeletingId(null);
    }
  }

  const isLoading = status === "loading";

  return (
    <div className="flex min-h-dvh bg-[#faf9f7] max-lg:flex-col">
      <NavigationMenu />
      <section className="min-w-0 flex-1 px-6 py-8 lg:px-10 lg:py-12 xl:px-14">
        <header className="flex flex-col justify-between gap-6 sm:flex-row sm:items-start">
          <div>
            <p className="font-intel text-sm tracking-[0.08em] text-muted">
              TIO RICO / INVESTIMENTOS
            </p>
            <h1 className="mt-3 font-k2d text-4xl font-bold tracking-tight text-foreground">
              Carteira
            </h1>
            <p className="mt-2 max-w-2xl font-k2d text-lg text-muted">
              Posições atuais usadas como base opcional para os próximos check-ins.
            </p>
          </div>
          <Button size="lg" className="w-auto px-5" onClick={openCreateDialog}>
            <Plus aria-hidden="true" />
            Adicionar investimento
          </Button>
        </header>

        <section aria-label="Resumo da carteira" className="mt-8 grid gap-4 md:grid-cols-3">
          <SummaryCard
            label="TOTAL DA CARTEIRA"
            value={isLoading ? "—" : formatCentsBRL(summary.totalCents)}
          />
          <SummaryCard
            label="CLASSES PRESENTES"
            value={isLoading ? "—" : String(summary.classes)}
          />
          <SummaryCard
            label="MAIOR EXPOSIÇÃO"
            value={
              isLoading || summary.largestPct === null
                ? "—"
                : `${Math.round(summary.largestPct)}%`
            }
          />
        </section>

        <Card className="mt-5 p-6">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
            <div>
              <h2 className="font-k2d text-2xl font-semibold text-foreground">
                Posições atuais
              </h2>
              <p className="mt-2 font-k2d text-base text-muted">
                Nome, classe, valor, indexador, taxa e liquidez são editáveis em cada posição.
              </p>
            </div>
            <Button size="default" className="w-auto px-4" onClick={openCreateDialog}>
              Adicionar investimento
            </Button>
          </div>

          {status === "unavailable" ? <ErrorMessage>{message}</ErrorMessage> : null}
          {status === "ready" && message ? <ErrorMessage>{message}</ErrorMessage> : null}

          <div className="mt-5 border-t border-border pt-3">
            {isLoading ? (
              <p className="py-8 font-k2d text-base text-muted">Carregando investimentos...</p>
            ) : assets.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border bg-background px-6 py-10 text-center">
                <p className="font-k2d text-lg font-medium text-foreground">
                  Sua carteira ainda está vazia.
                </p>
                <p className="mx-auto mt-2 max-w-md font-k2d text-base text-muted">
                  Adicione seus investimentos para usá-los como ponto de partida nos check-ins.
                </p>
              </div>
            ) : (
              <ul className="space-y-3" aria-label="Investimentos atuais">
                {assets.map((asset) => (
                  <li key={asset.id}>
                    <article className="flex flex-col gap-4 rounded-xl border border-border px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <h3 className="font-k2d text-lg font-semibold text-foreground">{asset.name}</h3>
                        <p className="mt-1 font-k2d text-sm text-muted">{assetDetail(asset)}</p>
                      </div>
                      <div className="flex items-center justify-between gap-3 sm:justify-end">
                        <p className="font-k2d text-2xl font-semibold text-foreground">
                          {formatCentsBRL(asset.amountCents)}
                        </p>
                        <div className="flex gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="w-8"
                            aria-label={`Editar ${asset.name}`}
                            onClick={() => openEditDialog(asset)}
                          >
                            <Pencil aria-hidden="true" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="w-8 text-destructive hover:text-destructive"
                            aria-label={`Remover ${asset.name}`}
                            disabled={deletingId === asset.id}
                            onClick={() => void deleteAsset(asset)}
                          >
                            <Trash2 aria-hidden="true" />
                          </Button>
                        </div>
                      </div>
                    </article>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <p className="mt-5 font-k2d text-sm text-muted">
            Editar ou remover uma posição não altera check-ins já registrados.
          </p>
        </Card>
      </section>

      <Dialog.Root open={isDialogOpen} onOpenChange={(open) => (open ? setIsDialogOpen(true) : closeDialog())}>
        <Dialog.Portal>
          <Dialog.Backdrop className="fixed inset-0 z-50 bg-(--green-3)/30 backdrop-blur-[1px]" />
          <Dialog.Viewport className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto p-4 sm:p-9">
            <Dialog.Popup className="relative my-auto w-full max-w-2xl rounded-2xl border border-border bg-card px-6 py-8 shadow-[4px_4px_16px_rgba(0,0,0,0.08)] outline-none sm:px-9">
              <div className="flex items-start justify-between gap-6">
                <div>
                  <p className="font-intel text-xs tracking-[0.1em] text-(--green-1) uppercase">
                    Carteira atual
                  </p>
                  <Dialog.Title className="mt-2 font-k2d text-2xl font-semibold tracking-tight text-foreground">
                    {editingAsset ? "Editar investimento" : "Adicionar investimento"}
                  </Dialog.Title>
                  <Dialog.Description className="mt-2 font-k2d text-sm text-muted sm:text-base">
                    Esses dados serão sugeridos nos próximos check-ins.
                  </Dialog.Description>
                </div>
                <Dialog.Close
                  type="button"
                  aria-label="Fechar formulário"
                  disabled={isSaving}
                  className="grid size-8 shrink-0 place-items-center rounded-sm text-foreground transition hover:bg-muted/15 focus-visible:ring-2 focus-visible:ring-(--green-1)/30 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <X className="size-5" aria-hidden="true" />
                </Dialog.Close>
              </div>

              <form className="mt-7 grid gap-5" onSubmit={saveAsset}>
                <div className="grid gap-5 sm:grid-cols-2">
                  <label className="grid gap-2 sm:col-span-2">
                    <FieldLabel htmlFor="asset-name">Nome do investimento</FieldLabel>
                    <input
                      id="asset-name"
                      value={draft.name}
                      onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
                      disabled={isSaving}
                      maxLength={160}
                      placeholder="Ex.: Tesouro Selic 2029"
                      className="h-11 rounded-md border border-border bg-transparent px-4 font-k2d text-base text-foreground outline-none transition placeholder:text-muted focus:border-(--green-1) focus:ring-2 focus:ring-(--green-1)/15 disabled:cursor-not-allowed disabled:opacity-50"
                      required
                    />
                  </label>
                  <label className="grid gap-2">
                    <FieldLabel htmlFor="asset-class">Classe</FieldLabel>
                    <select
                      id="asset-class"
                      value={draft.assetClass}
                      onChange={(event) => setDraft((current) => ({ ...current, assetClass: event.target.value as AssetClass }))}
                      disabled={isSaving}
                      className="h-11 rounded-md border border-border bg-transparent px-4 font-k2d text-base text-foreground outline-none transition focus:border-(--green-1) focus:ring-2 focus:ring-(--green-1)/15 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {ASSET_CLASSES.map((assetClass) => (
                        <option key={assetClass} value={assetClass}>
                          {ASSET_CLASS_LABELS[assetClass]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="grid gap-2">
                    <FieldLabel htmlFor="asset-amount">Valor atual</FieldLabel>
                    <input
                      id="asset-amount"
                      inputMode="decimal"
                      value={draft.amount}
                      onChange={(event) => setDraft((current) => ({ ...current, amount: event.target.value }))}
                      disabled={isSaving}
                      placeholder="0,00"
                      className="h-11 rounded-md border border-border bg-transparent px-4 font-k2d text-base text-foreground outline-none transition placeholder:text-muted focus:border-(--green-1) focus:ring-2 focus:ring-(--green-1)/15 disabled:cursor-not-allowed disabled:opacity-50"
                      required
                    />
                  </label>
                  <label className="grid gap-2">
                    <FieldLabel htmlFor="asset-indexer">Indexador</FieldLabel>
                    <input
                      id="asset-indexer"
                      value={draft.indexer}
                      onChange={(event) => setDraft((current) => ({ ...current, indexer: event.target.value }))}
                      disabled={isSaving}
                      maxLength={40}
                      placeholder="Ex.: 100% CDI"
                      className="h-11 rounded-md border border-border bg-transparent px-4 font-k2d text-base text-foreground outline-none transition placeholder:text-muted focus:border-(--green-1) focus:ring-2 focus:ring-(--green-1)/15 disabled:cursor-not-allowed disabled:opacity-50"
                    />
                  </label>
                  <label className="grid gap-2">
                    <FieldLabel htmlFor="asset-rate">Taxa (% a.a.)</FieldLabel>
                    <input
                      id="asset-rate"
                      inputMode="decimal"
                      value={draft.indexerRate}
                      onChange={(event) => setDraft((current) => ({ ...current, indexerRate: event.target.value }))}
                      disabled={isSaving}
                      placeholder="Opcional"
                      className="h-11 rounded-md border border-border bg-transparent px-4 font-k2d text-base text-foreground outline-none transition placeholder:text-muted focus:border-(--green-1) focus:ring-2 focus:ring-(--green-1)/15 disabled:cursor-not-allowed disabled:opacity-50"
                    />
                  </label>
                  <label className="grid gap-2 sm:col-span-2">
                    <FieldLabel htmlFor="asset-liquidity">Liquidez</FieldLabel>
                    <input
                      id="asset-liquidity"
                      value={draft.liquidity}
                      onChange={(event) => setDraft((current) => ({ ...current, liquidity: event.target.value }))}
                      disabled={isSaving}
                      maxLength={60}
                      placeholder="Ex.: Liquidez diária"
                      className="h-11 rounded-md border border-border bg-transparent px-4 font-k2d text-base text-foreground outline-none transition placeholder:text-muted focus:border-(--green-1) focus:ring-2 focus:ring-(--green-1)/15 disabled:cursor-not-allowed disabled:opacity-50"
                    />
                  </label>
                </div>

                {formError ? <ErrorMessage>{formError}</ErrorMessage> : null}

                <div className="mt-1 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                  <Button type="button" variant="outline" size="lg" className="w-auto px-5" disabled={isSaving} onClick={closeDialog}>
                    Cancelar
                  </Button>
                  <Button type="submit" size="lg" className="w-auto px-5" disabled={isSaving}>
                    {isSaving ? "Salvando..." : editingAsset ? "Salvar alterações" : "Adicionar investimento"}
                  </Button>
                </div>
              </form>
            </Dialog.Popup>
          </Dialog.Viewport>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <Card className="p-6">
      <p className="font-intel text-sm tracking-[0.06em] text-muted">{label}</p>
      <p className="mt-2 font-k2d text-3xl font-bold text-foreground">{value}</p>
    </Card>
  );
}
