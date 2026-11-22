import {
  Firecrawl,
  type Document,
  type SearchData,
  type SearchResultNews,
  type SearchResultWeb,
} from "firecrawl";
import type {
  AssetClass,
  MarketNewsItem,
  NewsFetchResult,
} from "@/lib/types/domain";

export const FIRECRAWL_CACHE_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours
export const DEFAULT_NEWS_LIMIT = 6;
export const MAX_NEWS_QUERIES = 3;
export const DEFAULT_SNIPPET_MAX_LENGTH = 400;

const MACRO_QUERY = "Selic Copom IPCA economia Brasil";

interface QuerySpec {
  query: string;
  topic: string;
}

const ASSET_CLASS_QUERY_GROUPS: ReadonlyArray<{
  classes: ReadonlyArray<AssetClass>;
  spec: QuerySpec;
}> = [
  {
    classes: ["renda_fixa_pos", "renda_fixa_pre", "renda_fixa_ipca"],
    spec: {
      query: "Tesouro Direto renda fixa juros Brasil",
      topic: "Renda Fixa",
    },
  },
  {
    classes: ["acoes"],
    spec: {
      query: "Ibovespa bolsa brasileira ações mercado",
      topic: "Ações (Brasil)",
    },
  },
  {
    classes: ["fiis"],
    spec: {
      query: "fundos imobiliários IFIX dividendos Brasil",
      topic: "Fundos Imobiliários",
    },
  },
  {
    classes: ["internacional"],
    spec: {
      query: "dólar câmbio mercado americano S&P 500",
      topic: "Internacional",
    },
  },
  {
    classes: ["cripto"],
    spec: {
      query: "bitcoin criptomoedas mercado cripto Brasil",
      topic: "Criptoativos",
    },
  },
];

interface CachedNewsEntry {
  items: MarketNewsItem[];
  fetchedAt: string;
  queriesUsed: string[];
  expiresAt: number;
  error?: string;
}

const newsCache = new Map<string, CachedNewsEntry>();

export function clearFirecrawlCache(): void {
  newsCache.clear();
}

function buildQuerySpecs(assetClasses: ReadonlyArray<AssetClass>): QuerySpec[] {
  const specs: QuerySpec[] = [
    {
      query: MACRO_QUERY,
      topic: "Macroeconomia",
    },
  ];

  const present = new Set<AssetClass>(assetClasses);

  for (const group of ASSET_CLASS_QUERY_GROUPS) {
    if (specs.length >= MAX_NEWS_QUERIES) {
      break;
    }
    const hasMatch = group.classes.some((assetClass) =>
      present.has(assetClass),
    );
    if (hasMatch) {
      specs.push(group.spec);
    }
  }

  return specs;
}

/**
 * Builds targeted Portuguese economic search queries for Firecrawl:
 * always includes a Brazil macro query plus up to 2 asset-class queries
 * (capped at 3 queries total to protect credits and latency).
 */
export function buildNewsQueries(assetClasses: AssetClass[]): string[] {
  return buildQuerySpecs(assetClasses).map((spec) => spec.query);
}

const PROMPT_INJECTION_PATTERNS: ReadonlyArray<RegExp> = [
  /<\s*\/?\s*NOTICIAS_EXTERNAS\s*>/gi,
  /<\s*\/?\s*ANOTACOES_USUARIO\s*>/gi,
  /<\s*\/?\s*(?:system|instructions?|prompt|assistant|user)\s*>/gi,
  /\[\s*\/?\s*(?:INST|SYS|SYSTEM)\s*\]/gi,
  /<<\s*\/?\s*SYS\s*>>/gi,
  /(?:^|\s)#{2,}\s*(?:system|instruction|instrucoes|instruções)\b[^\n]*/gi,
  /\b(?:ignore|disregard|forget)\s+(?:(?:all\s+)?(?:the\s+)?)?(?:previous|above|prior)\s+(?:instructions?|prompts?|rules?)\b/gi,
  /\b(?:ignore|desconsidere|esqueça|esqueca)\s+(?:(?:todas?\s+)?(?:as|os)\s+)?(?:instruções|instrucoes|regras)\s+(?:anteriores|acima)\b/gi,
  /\b(?:system\s+prompt|override\s+instructions?|new\s+system\s+instruction)\b/gi,
];

/**
 * Sanitizes untrusted external news text before injecting it into LLM prompts:
 * strips HTML/markdown noise, control characters, collapses whitespace,
 * neutralizes common prompt-injection markers, and truncates safely.
 */
export function sanitizeNewsSnippet(
  raw: string,
  maxLength: number = DEFAULT_SNIPPET_MAX_LENGTH,
): string {
  if (!raw) {
    return "";
  }

  const safeMax = Math.max(0, Math.floor(maxLength));
  if (safeMax === 0) {
    return "";
  }

  let text = raw;

  // 1. Neutralize explicit prompt-injection markers before stripping tags
  for (const pattern of PROMPT_INJECTION_PATTERNS) {
    text = text.replace(pattern, " ");
  }

  // 2. Remove script/style blocks and remaining HTML tags
  text = text.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, " ");
  text = text.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, " ");
  text = text.replace(/<[^>]*>/g, " ");

  // 3. Strip markdown images/links and formatting syntax
  text = text.replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1");
  text = text.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1");
  text = text.replace(/```[\s\S]*?```/g, " ");
  text = text.replace(/[`*_~]+/g, "");
  text = text.replace(/[#]+/g, " ");

  // 4. Remove angle brackets and ASCII control characters
  text = text.replace(/[<>]/g, " ");
  text = text.replace(/[\u0000-\u001F\u007F]/g, " ");

  // 5. Collapse whitespace
  text = text.replace(/\s+/g, " ").trim();

  if (text.length <= safeMax) {
    return text;
  }

  if (safeMax <= 3) {
    return text.slice(0, safeMax);
  }

  return `${text.slice(0, safeMax - 3).trimEnd()}...`;
}

function canonicalizeHttpUrl(rawUrl: string): string | null {
  try {
    const parsed = new URL(rawUrl.trim());
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    return parsed
      .toString()
      .replace(/[\r\n\u0000-\u001F\u007F]/g, "")
      .replace(/</g, "%3C")
      .replace(/>/g, "%3E");
  } catch {
    return null;
  }
}

function normalizeUrlForDedup(rawUrl: string): string | null {
  try {
    const parsed = new URL(rawUrl.trim());
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }

    const keysToDelete: string[] = [];
    parsed.searchParams.forEach((_value, key) => {
      if (
        key.toLowerCase().startsWith("utm_") ||
        key.toLowerCase() === "fbclid" ||
        key.toLowerCase() === "gclid"
      ) {
        keysToDelete.push(key);
      }
    });
    for (const key of keysToDelete) {
      parsed.searchParams.delete(key);
    }

    parsed.hash = "";
    const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
    const pathname = parsed.pathname.replace(/\/+$/, "") || "/";
    const search = parsed.searchParams.toString();
    return `${host}${pathname}${search ? `?${search}` : ""}`;
  } catch {
    return null;
  }
}

function extractDomainSource(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl.trim());
    return parsed.hostname.toLowerCase().replace(/^www\./, "") || "fonte-externa";
  } catch {
    return "fonte-externa";
  }
}

function isDocumentResult(
  entry: SearchResultNews | SearchResultWeb | Document,
): entry is Document {
  return "metadata" in entry && typeof entry.metadata === "object" && entry.metadata !== null;
}

function extractRawNewsFields(
  entry: SearchResultNews | SearchResultWeb | Document,
): {
  title: string;
  url: string;
  snippet: string;
  publishedAt?: string;
} | null {
  if (isDocumentResult(entry)) {
    const meta = entry.metadata;
    const url = meta?.url ?? meta?.sourceURL;
    const title = meta?.title ?? meta?.ogTitle;
    if (!url || !title) {
      return null;
    }
    const rawSnippet =
      entry.summary ??
      meta?.description ??
      meta?.ogDescription ??
      entry.markdown ??
      "";
    const publishedAt = meta?.publishedTime ?? meta?.dcDate ?? meta?.modifiedTime;
    return {
      title,
      url,
      snippet: rawSnippet,
      publishedAt: publishedAt?.trim() || undefined,
    };
  }

  const url = entry.url;
  const title = entry.title;
  if (!url || !title) {
    return null;
  }

  const rawSnippet =
    "snippet" in entry && typeof entry.snippet === "string"
      ? entry.snippet
      : "description" in entry && typeof entry.description === "string"
        ? entry.description
        : "";

  const publishedAt =
    "date" in entry && typeof entry.date === "string"
      ? entry.date.trim() || undefined
      : undefined;

  return {
    title,
    url,
    snippet: rawSnippet,
    publishedAt,
  };
}

function normalizeSearchEntries(
  data: SearchData | null | undefined,
  topic: string,
): MarketNewsItem[] {
  if (!data) {
    return [];
  }

  const rawList: Array<SearchResultNews | SearchResultWeb | Document> =
    Array.isArray(data.news) && data.news.length > 0
      ? data.news
      : Array.isArray(data.web)
        ? data.web
        : [];

  const normalized: MarketNewsItem[] = [];

  for (const entry of rawList) {
    const extracted = extractRawNewsFields(entry);
    if (!extracted) {
      continue;
    }

    const canonicalUrl = canonicalizeHttpUrl(extracted.url);
    if (!canonicalUrl) {
      continue;
    }

    const dedupKey = normalizeUrlForDedup(canonicalUrl);
    if (!dedupKey) {
      continue;
    }

    const cleanTitle = sanitizeNewsSnippet(extracted.title, 180);
    if (!cleanTitle) {
      continue;
    }

    const cleanSnippet = sanitizeNewsSnippet(
      extracted.snippet,
      DEFAULT_SNIPPET_MAX_LENGTH,
    );

    const cleanPublishedAt = extracted.publishedAt
      ? sanitizeNewsSnippet(extracted.publishedAt, 40) || undefined
      : undefined;

    normalized.push({
      title: cleanTitle,
      url: canonicalUrl,
      source: extractDomainSource(canonicalUrl),
      ...(cleanPublishedAt ? { publishedAt: cleanPublishedAt } : {}),
      snippet: cleanSnippet,
      topic,
    });
  }

  return normalized;
}

function getSafeErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message.replace(/fc-[a-zA-Z0-9_-]+/g, "[REDACTED]").slice(0, 200);
  }
  return "Erro desconhecido ao consultar serviço de notícias.";
}

export interface FetchEconomicNewsOptions {
  assetClasses: AssetClass[];
  limit?: number;
  forceRefresh?: boolean;
  client?: Pick<Firecrawl, "search">;
  apiKey?: string;
}

/**
 * Fetches recent Brazilian economic and market news relevant to the investor's
 * asset classes via Firecrawl Search v2.
 *
 * Gracefully degrades (never throws) when FIRECRAWL_API_KEY is missing or
 * upstream requests fail, returning `newsAvailable: false`.
 */
export async function fetchEconomicNews(
  options: FetchEconomicNewsOptions,
): Promise<NewsFetchResult> {
  const limit = Math.max(1, Math.floor(options.limit ?? DEFAULT_NEWS_LIMIT));
  const specs = buildQuerySpecs(options.assetClasses);
  const queriesUsed = specs.map((spec) => spec.query);
  const cacheKey = JSON.stringify([...queriesUsed].sort());

  if (!options.forceRefresh) {
    const cached = newsCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      const sliced = cached.items.slice(0, limit);
      return {
        items: sliced,
        newsAvailable: sliced.length > 0,
        fetchedAt: cached.fetchedAt,
        queriesUsed: cached.queriesUsed,
        ...(cached.error ? { error: cached.error } : {}),
      };
    }
  }

  const resolvedApiKey = (options.apiKey ?? process.env.FIRECRAWL_API_KEY ?? "").trim();
  const fetchedAt = new Date().toISOString();

  if (!options.client && !resolvedApiKey) {
    return {
      items: [],
      newsAvailable: false,
      fetchedAt,
      queriesUsed,
      error:
        "FIRECRAWL_API_KEY não configurada; a análise seguirá sem notícias externas.",
    };
  }

  let client: Pick<Firecrawl, "search">;
  try {
    client =
      options.client ??
      new Firecrawl({
        apiKey: resolvedApiKey,
        timeoutMs: 10_000,
        maxRetries: 1,
      });
  } catch (error) {
    return {
      items: [],
      newsAvailable: false,
      fetchedAt,
      queriesUsed,
      error: `Falha ao inicializar cliente Firecrawl: ${getSafeErrorMessage(error)}`,
    };
  }

  const settled = await Promise.allSettled(
    specs.map(async (spec) => {
      const data = await client.search(spec.query, {
        sources: ["news"],
        limit: 4,
        tbs: "qdr:w",
        country: "BR",
        timeout: 10000,
      });
      return { spec, data };
    }),
  );

  const seenUrls = new Set<string>();
  const collected: MarketNewsItem[] = [];
  const errors: string[] = [];

  for (const outcome of settled) {
    if (outcome.status === "rejected") {
      errors.push(getSafeErrorMessage(outcome.reason));
      continue;
    }

    const items = normalizeSearchEntries(outcome.value.data, outcome.value.spec.topic);
    for (const item of items) {
      const dedupKey = normalizeUrlForDedup(item.url);
      if (!dedupKey || seenUrls.has(dedupKey)) {
        continue;
      }
      seenUrls.add(dedupKey);
      collected.push(item);
    }
  }

  const allFailed = errors.length === specs.length;
  const errorSummary =
    errors.length > 0
      ? allFailed
        ? `Não foi possível obter notícias externas: ${errors[0]}`
        : `Algumas consultas de notícias falharam (${errors.length}/${specs.length}).`
      : undefined;

  if (!allFailed && collected.length > 0) {
    newsCache.set(cacheKey, {
      items: collected,
      fetchedAt,
      queriesUsed,
      expiresAt: Date.now() + FIRECRAWL_CACHE_TTL_MS,
      ...(errorSummary ? { error: errorSummary } : {}),
    });
  }

  const cappedItems = collected.slice(0, limit);

  return {
    items: cappedItems,
    newsAvailable: cappedItems.length > 0,
    fetchedAt,
    queriesUsed,
    ...(errorSummary ? { error: errorSummary } : {}),
  };
}
