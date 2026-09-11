export const API_URL = process.env.NEXT_PUBLIC_SCANNER_API_URL ?? "http://127.0.0.1:3411";

export type RouteHop = {
  route_index: number;
  venue: string;
  pool_id: string;
  coin_in: string;
  coin_out: string;
};

export type Quote = {
  provider: string;
  coin_in: string;
  coin_out: string;
  amount_in: string;
  amount_out: string;
  quote_id: string | null;
  route: RouteHop[];
  estimated_gas_cost: string | null;
  observed_at_ms: number;
  latency_ms: number;
};

export type Candidate = {
  forward: Quote;
  reverse: Quote;
  same_quote_provider: boolean;
  shared_pool_ids: string[];
  returned_base: string;
  gross_profit: string;
  gas_cost: string;
  net_profit: string;
  net_profit_bps: string;
  quote_skew_ms: number;
  rejection_reasons: string[];
  meets_threshold: boolean;
};

export type ProviderFailure = {
  provider: string;
  stage: string;
  kind: string;
  retryable: boolean;
  message: string;
};

export type ScanReport = {
  schema_version: number;
  observed_at_ms: number;
  base_coin: string;
  quote_coin: string;
  amount_in: string;
  gas_cost: string;
  min_profit_bps: string;
  candidates: Candidate[];
  failures: ProviderFailure[];
};

export type Health = {
  status: string;
  read_only: boolean;
  scan_in_progress: boolean;
  history_count: number;
  latest_observed_at_ms: number | null;
};

export type ScanInput = {
  quote_coin?: string;
  amount_in: string;
  gas_cost: string;
  min_profit_bps: string;
  max_quote_skew_ms: number;
  timeout_ms: number;
  retries: number;
  cetus_sources: string[];
  seven_k_sources: string[];
};

export type ConfirmedOpportunity = {
  validation_tier: "quote_confirmed";
  route_fingerprint: string;
  amount_in: string;
  quote_coin: string;
  confirmations: number;
  samples: number;
  worst_net_profit: string;
  best_net_profit: string;
  max_quote_skew_ms: number;
  representative: Candidate;
};

export type ResearchReport = {
  schema_version: number;
  observed_at_ms: number;
  amounts_tested: string[];
  markets_tested: string[];
  routes_evaluated: number;
  provider_failures: number;
  confirmation_runs: number;
  opportunities: ConfirmedOpportunity[];
  reports: ScanReport[];
};

export type ResearchInput = Omit<ScanInput, "amount_in" | "quote_coin"> & { amounts?: string[]; markets?: string[] };

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, { cache: "no-store", ...init });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(data?.message ?? `Scanner API returned HTTP ${response.status}.`);
  }
  return data as T;
}

export const scannerApi = {
  health: () => request<Health>("/api/health"),
  latest: () => request<ScanReport>("/api/scans/latest"),
  history: () => request<{ reports: ScanReport[]; retention: string }>("/api/scans?limit=20"),
  scan: (input: ScanInput) =>
    request<ScanReport>("/api/scans", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    }),
  research: (input: ResearchInput) =>
    request<ResearchReport>("/api/research", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    }),
};

export function formatSui(value: string, digits = 4): string {
  const atomic = BigInt(value);
  const negative = atomic < 0n;
  const absolute = negative ? -atomic : atomic;
  const whole = absolute / 1_000_000_000n;
  const fraction = (absolute % 1_000_000_000n).toString().padStart(9, "0").slice(0, digits);
  return `${negative ? "−" : ""}${whole.toLocaleString()}${digits ? `.${fraction}` : ""}`;
}

export function formatAge(timestamp: number): string {
  const seconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000));
  if (seconds < 5) return "now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  return minutes < 60 ? `${minutes}m ago` : `${Math.floor(minutes / 60)}h ago`;
}

export function shortId(value: string): string {
  return value.length > 18 ? `${value.slice(0, 8)}…${value.slice(-6)}` : value;
}
