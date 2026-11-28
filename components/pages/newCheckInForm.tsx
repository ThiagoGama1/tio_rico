"use client";

import { FormEvent, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { parseReaisParaCentavos } from "@/lib/format/moeda";
import {
  ASSET_CLASSES,
  ASSET_CLASS_LABELS,
  type AssetClass,
} from "@/lib/types/domain";

type PositionDraft = {
  id?: string;
  name: string;
  assetClass: AssetClass;
  amountCents: number;
  indexer: string | null;
  indexerRate: number | null;
  liquidity: string | null;
};

// rowKey: chave estável da linha na tela (não vai para a API). Com a chave pelo
// índice, remover uma linha fazia a de baixo herdar o valor da removida (#66).
type PositionRow = PositionDraft & { rowKey: string; amountText: string };

type NewCheckInFormProps = {
  initialPositions: PositionDraft[];
};

type ApiError = { error?: string };

const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

function currentReferenceMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function formatCents(value: number) {
  return currencyFormatter.format(value / 100);
}

// "1.500" = R$ 1.500,00 (ponto é milhar no pt-BR, #65)
function centsFromCurrency(value: string) {
  return parseReaisParaCentavos(value) ?? 0;
}

function createEmptyPosition(): PositionDraft {
  return {
    name: "",
    assetClass: "outros",
    amountCents: 0,
    indexer: null,
    indexerRate: null,
    liquidity: null,
  };
}

function FieldLabel({ children, htmlFor }: { children: string; htmlFor: string }) {
  return (
    <label
      className="font-intel text-xs tracking-[0.08em] text-muted uppercase"
      htmlFor={htmlFor}
    >
      {children}
    </label>
  );
}

export function NewCheckInForm({ initialPositions }: NewCheckInFormProps) {
  const router = useRouter();
  const [referenceMonth, setReferenceMonth] = useState(currentReferenceMonth);
  const [contribution, setContribution] = useState("0");
  const nextRowNumber = useRef(0);
  const [positions, setPositions] = useState<PositionRow[]>(() =>
    initialPositions.map((position, index) => ({
      ...position,
      rowKey: position.id ?? `initial-${index}`,
      amountText: formatCents(position.amountCents),
    })),
  );
  const [includeNews, setIncludeNews] = useState(true);
  const [includeAiAnalysis, setIncludeAiAnalysis] = useState(true);
  const [syncPortfolioAssets, setSyncPortfolioAssets] = useState(true);
  const [userNotes, setUserNotes] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const estimatedTotalCents = useMemo(
    () => positions.reduce((total, position) => total + position.amountCents, 0),
    [positions],
  );

  function updatePosition(rowKey: string, patch: Partial<PositionRow>) {
    setPositions((current) =>
      current.map((position) =>
        position.rowKey === rowKey ? { ...position, ...patch } : position,
      ),
    );
  }

  function addPosition() {
    nextRowNumber.current += 1;
    const empty = createEmptyPosition();
    setPositions((current) => [
      ...current,
      { ...empty, rowKey: `new-${nextRowNumber.current}`, amountText: formatCents(empty.amountCents) },
    ]);
  }

  function removePosition(rowKey: string) {
    // a última linha não pode ser removida (o botão também fica desabilitado)
    setPositions((current) =>
      current.length <= 1 ? current : current.filter((position) => position.rowKey !== rowKey),
    );
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    const contributionCents = centsFromCurrency(contribution);
    const validPositions = positions
      .filter((position) => position.name.trim())
      .map(
        (position): PositionDraft => ({
          id: position.id,
          name: position.name,
          assetClass: position.assetClass,
          amountCents: position.amountCents,
          indexer: position.indexer,
          indexerRate: position.indexerRate,
          liquidity: position.liquidity,
        }),
      );
    if (validPositions.length === 0) {
      setError("Informe ao menos uma posição para registrar o check-in.");
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch("/api/checkins", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          referenceMonth,
          contributionCents,
          userNotes: userNotes.trim(),
          positions: validPositions,
          includeNews,
          includeAiAnalysis,
          syncPortfolioAssets,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as ApiError;

      if (!response.ok) {
        throw new Error(payload.error ?? "Não foi possível salvar o check-in.");
      }

      router.push("/overview");
      router.refresh();
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Não foi possível salvar o check-in.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
      <Card className="grid gap-4 p-5 lg:grid-cols-3">
        <div className="rounded-xl border border-border p-5">
          <FieldLabel htmlFor="reference-month">Mês de referência</FieldLabel>
          <input
            id="reference-month"
            type="month"
            value={referenceMonth}
            onChange={(event) => setReferenceMonth(event.target.value)}
            disabled={isSubmitting}
            className="mt-3 h-10 w-full bg-transparent font-k2d text-lg text-foreground outline-none disabled:cursor-not-allowed disabled:opacity-50"
            required
          />
          <p className="mt-2 font-k2d text-sm text-muted">Formato AAAA-MM</p>
        </div>

        <div className="rounded-xl border border-border p-5">
          <FieldLabel htmlFor="contribution">Aporte do mês</FieldLabel>
          <input
            id="contribution"
            inputMode="decimal"
            value={contribution}
            onChange={(event) => setContribution(event.target.value)}
            disabled={isSubmitting}
            className="mt-3 h-10 w-full border-b border-(--green-1) bg-transparent font-k2d text-lg text-foreground outline-none focus:border-primary disabled:cursor-not-allowed disabled:opacity-50"
            aria-describedby="contribution-hint"
          />
          <p id="contribution-hint" className="mt-2 font-k2d text-sm text-muted">
            Informe 0 se não houve aporte.
          </p>
        </div>

        <div className="rounded-xl border border-border p-5">
          <p className="font-intel text-xs tracking-[0.08em] text-muted uppercase">
            Origem das posições
          </p>
          <p className="mt-3 font-k2d text-lg text-foreground">Fotografia desta tela</p>
          <p className="mt-2 font-k2d text-sm text-muted">
            Revise a carteira antes de salvar o registro.
          </p>
        </div>
      </Card>

      <Card className="p-5">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <h2 className="font-k2d text-2xl font-semibold text-foreground">
              Fotografia de investimentos
            </h2>
            <p className="mt-2 font-k2d text-sm text-muted">
              Ajuste os valores para registrar exatamente a carteira deste período.
            </p>
          </div>
          <Button
            type="button"
            size="lg"
            className="w-auto px-5"
            disabled={isSubmitting}
            onClick={addPosition}
          >
            Adicionar posição
          </Button>
        </div>

        <div className="mt-5 space-y-3">
          {positions.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border p-5 font-k2d text-muted">
              Nenhuma posição informada. Adicione os investimentos que farão parte do check-in.
            </div>
          ) : (
            positions.map((position) => (
              <article
                key={position.rowKey}
                className="grid gap-4 rounded-xl border border-border p-5 lg:grid-cols-[minmax(0,1fr)_11rem_auto] lg:items-end"
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <FieldLabel htmlFor={`name-${position.rowKey}`}>Investimento</FieldLabel>
                    <input
                      id={`name-${position.rowKey}`}
                      value={position.name}
                      onChange={(event) => updatePosition(position.rowKey, { name: event.target.value })}
                      disabled={isSubmitting}
                      placeholder="Nome do ativo"
                      className="mt-2 h-10 w-full border-b border-border bg-transparent font-k2d text-base text-foreground outline-none placeholder:text-muted focus:border-(--green-1) disabled:cursor-not-allowed disabled:opacity-50"
                      required
                    />
                  </div>
                  <div>
                    <FieldLabel htmlFor={`asset-class-${position.rowKey}`}>Classe</FieldLabel>
                    <select
                      id={`asset-class-${position.rowKey}`}
                      value={position.assetClass}
                      onChange={(event) =>
                        updatePosition(position.rowKey, { assetClass: event.target.value as AssetClass })
                      }
                      disabled={isSubmitting}
                      className="mt-2 h-10 w-full border-b border-border bg-transparent font-k2d text-base text-foreground outline-none focus:border-(--green-1) disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {ASSET_CLASSES.map((assetClass) => (
                        <option key={assetClass} value={assetClass}>
                          {ASSET_CLASS_LABELS[assetClass]}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <FieldLabel htmlFor={`amount-${position.rowKey}`}>Valor atual</FieldLabel>
                  <input
                    id={`amount-${position.rowKey}`}
                    inputMode="decimal"
                    value={position.amountText}
                    onChange={(event) =>
                      updatePosition(position.rowKey, {
                        amountText: event.target.value,
                        amountCents: centsFromCurrency(event.target.value),
                      })
                    }
                    disabled={isSubmitting}
                    className="mt-2 h-10 w-full border-b border-border bg-transparent font-k2d text-lg text-foreground outline-none focus:border-(--green-1) disabled:cursor-not-allowed disabled:opacity-50"
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isSubmitting || positions.length === 1}
                  className="w-full justify-center"
                  onClick={() => removePosition(position.rowKey)}
                >
                  Remover
                </Button>
              </article>
            ))
          )}
        </div>
      </Card>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(22rem,0.85fr)]">
        <Card className="p-5">
          <h2 className="font-k2d text-2xl font-semibold text-foreground">Conteúdo gerado</h2>
          <div className="mt-5 space-y-3 font-k2d text-base text-foreground">
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={includeNews}
                onChange={(event) => setIncludeNews(event.target.checked)}
                disabled={isSubmitting}
              />
              Incluir notícias recentes por classe de ativo
            </label>
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={includeAiAnalysis}
                onChange={(event) => setIncludeAiAnalysis(event.target.checked)}
                disabled={isSubmitting}
              />
              Gerar análise educacional por IA
            </label>
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={syncPortfolioAssets}
                onChange={(event) => setSyncPortfolioAssets(event.target.checked)}
                disabled={isSubmitting}
              />
              Sincronizar posições informadas com a carteira
            </label>
          </div>
          <div className="mt-5">
            <FieldLabel htmlFor="notes">Notas pessoais</FieldLabel>
            <textarea
              id="notes"
              value={userNotes}
              onChange={(event) => setUserNotes(event.target.value)}
              disabled={isSubmitting}
              maxLength={4000}
              placeholder="Algo importante para registrar neste período?"
              className="mt-2 min-h-28 w-full rounded-xl border border-border bg-transparent p-3 font-k2d text-base text-foreground outline-none placeholder:text-muted focus:border-(--green-1) disabled:cursor-not-allowed disabled:opacity-50"
            />
            <p className="mt-2 font-k2d text-sm text-muted">Opcional · até 4.000 caracteres</p>
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="font-k2d text-2xl font-semibold text-foreground">O que será salvo</h2>
          <div className="mt-5 space-y-3">
            <div className="flex items-center justify-between gap-4 rounded-xl border border-border p-4">
              <div>
                <p className="font-k2d text-lg text-foreground">Patrimônio estimado</p>
                <p className="mt-1 font-k2d text-sm text-muted">Soma das posições informadas</p>
              </div>
              <p className="font-k2d text-2xl font-semibold text-foreground">
                {formatCents(estimatedTotalCents)}
              </p>
            </div>
            <div className="flex items-center justify-between gap-4 rounded-xl border border-border p-4">
              <div>
                <p className="font-k2d text-lg text-foreground">Aporte informado</p>
                <p className="mt-1 font-k2d text-sm text-muted">Considerado no motor de alocação</p>
              </div>
              <p className="font-k2d text-2xl font-semibold text-foreground">
                {formatCents(centsFromCurrency(contribution))}
              </p>
            </div>
          </div>
          {error ? (
            <p aria-live="polite" className="mt-4 font-k2d text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <Button type="submit" size="lg" className="mt-5 w-auto px-5" disabled={isSubmitting}>
            {isSubmitting ? "Salvando..." : "Salvar check-in"}
          </Button>
        </Card>
      </div>
    </form>
  );
}
