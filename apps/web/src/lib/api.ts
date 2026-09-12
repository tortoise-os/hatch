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
  research_run_count: number;
  latest_observed_at_ms: number | null;
  persistence: "jsonl" | "memory_only";
  journal_rejected_lines: number;
};

export type ScanInput = {
  base_coin?: string;
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
  validation_tier: "venue_isolated_quote_confirmed";
  simulation_status: "pending" | "simulation_confirmed" | "simulation_failed" | "simulation_non_positive" | "fingerprint_mismatch" | "unsupported_base";
  simulation: AtomicSimulationEvidence | null;
  route_fingerprint: string;
  amount_in: string;
  base_coin: string;
  quote_coin: string;
  confirmations: number;
  samples: number;
  worst_net_profit: string;
  best_net_profit: string;
  max_quote_skew_ms: number;
  representative: Candidate;
};

export type AtomicSimulationResult = {
  status: "positive" | "non_positive" | "failed";
  route_fingerprint: string;
  rebuilt_route_fingerprint: string | null;
  observed_at_ms: number;
  measured_gas_cost: string;
  balance_delta: string;
  command_results: number;
  effects_requested: boolean;
  balance_changes_requested: boolean;
  command_results_requested: boolean;
  command_trace: string[];
  error: string | null;
};

export type AtomicSimulationEvidence = {
  first_seen_at_ms: number;
  last_positive_at_ms: number | null;
  confirmation_count: number;
  attempts: number;
  elapsed_half_life_ms: number | null;
  measured_gas_cost: string;
  balance_delta: string;
  failure_reason: string | null;
  results: AtomicSimulationResult[];
};

export type ResearchReport = {
  schema_version: number;
  observed_at_ms: number;
  amounts_tested: string[];
  markets_tested: string[];
  market_metadata: MarketDefinition[];
  adaptive_sizing: AdaptiveSizingEvidence | null;
  market_sizing: MarketSizingEvidence[];
  routes_evaluated: number;
  provider_failures: number;
  confirmation_runs: number;
  discovery_reports: number;
  venue_isolated_reports: number;
  venues_tested: string[];
  opportunities: ConfirmedOpportunity[];
  reports: ScanReport[];
};

export type AdaptiveSizingEvidence = {
  quote_coin: string;
  reference_amount_in: string;
  usdc_per_sui_atomic: string;
  providers: string[];
  usd_targets: number[];
};

export type MarketSizingEvidence = {
  market_symbol: string;
  base_coin: string;
  base_symbol: string;
  base_decimals: number;
  quote_coin: string;
  quote_symbol: string;
  quote_decimals: number;
  reference_amount_in: string;
  usdc_per_base_atomic: string;
  providers: string[];
  usd_targets: number[];
  amounts: string[];
  gas_cost_base: string;
};

export type MarketDefinition = {
  symbol: string;
  base_coin: string;
  base_symbol: string;
  base_decimals: number;
  coin_type: string;
  quote_symbol: string;
  decimals: number;
  enabled: boolean;
  watchlist_only: boolean;
};

export type CartographyCell = {
  base_coin: string;
  base_symbol: string;
  base_decimals: number;
  quote_coin: string;
  quote_symbol: string;
  quote_decimals: number;
  market_symbol: string;
  evidence_tier: "aggregator_discovery" | "venue_isolated";
  forward_venues: string;
  reverse_venues: string;
  observed_round_trips: number;
  positive_quotes: number;
  positive_rate_bps: number;
  confirmed_signals: number;
  confirmation_hits: number;
  confirmation_samples: number;
  best_net_profit: string;
  worst_net_profit: string;
  best_amount_in: string;
  last_observed_at_ms: number;
  simulation_status: "pending" | "simulation_confirmed" | "simulation_failed" | "simulation_non_positive" | "fingerprint_mismatch" | "unsupported_base";
  simulation_attempts: number;
  positive_simulations: number;
  simulation_survival_rate_bps: number;
  median_observed_half_life_ms: number | null;
  best_simulated_delta: string;
  measured_gas_cost: string;
};

export type CartographyReport = {
  schema_version: number;
  generated_at_ms: number;
  research_runs: number;
  scan_reports: number;
  observed_round_trips: number;
  confirmed_signals: number;
  simulation_confirmed_signals: number;
  journal_rejected_lines: number;
  cells: CartographyCell[];
  rejection_reasons: Record<string, number>;
};

export type ResearchInput = Omit<ScanInput, "amount_in" | "base_coin" | "quote_coin"> & { amounts?: string[]; markets?: MarketDefinition[] };

export type ScannerConfig = {
  defaults: ScanInput;
  market_registry: MarketDefinition[];
  providers: string[];
  history_retention: string;
  journal_path: string | null;
  simulation_mode: string;
  simulation_confirmations_required: number;
};

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
  config: () => request<ScannerConfig>("/api/config"),
  latest: () => request<ScanReport>("/api/scans/latest"),
  history: () => request<{ reports: ScanReport[]; retention: string }>("/api/scans?limit=20"),
  cartography: () => request<CartographyReport>("/api/cartography"),
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
  return formatAtomic(value, 9, digits);
}

export function formatAtomic(value: string, decimals: number, digits = 4): string {
  const atomic = BigInt(value);
  const negative = atomic < 0n;
  const absolute = negative ? -atomic : atomic;
  const scale = 10n ** BigInt(decimals);
  const whole = absolute / scale;
  const fraction = (absolute % scale).toString().padStart(decimals, "0").slice(0, digits);
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
