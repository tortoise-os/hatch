"use client";

import { AlertTriangle, ArrowRight, ChevronDown, Clock3, Database, Gauge, Map, Play, RefreshCw, Server, Sparkles } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { formatAge, formatAtomic, formatSui, scannerApi, shortId, type Candidate, type CartographyReport, type ConfirmedOpportunity, type MarketDefinition, type ResearchReport, type ScanInput, type ScannerConfig, type ScanReport } from "@/lib/api";
import { CARTOGRAPHY_PAGE_SIZE, cartographyStatus, preserveCartography, rankCartographyCells, rankRejections, visibleCartographyCells } from "@/lib/cartography";

const defaults: ScanInput = {
  amount_in: "1000000000",
  gas_cost: "2000000",
  min_profit_bps: "1",
  max_quote_skew_ms: 2000,
  timeout_ms: 5000,
  retries: 1,
  cetus_sources: [],
  seven_k_sources: ["turbos", "cetus", "aftermath", "deepbook_v3", "flowx_v3", "bluefin"],
};

function useScannerData() {
  const [latest, setLatest] = useState<ScanReport | null>(null);
  const [history, setHistory] = useState<ScanReport[]>([]);
  const [cartography, setCartography] = useState<CartographyReport | null>(null);
  const [config, setConfig] = useState<ScannerConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    const [historyResult, cartographyResult, configResult] = await Promise.allSettled([
      scannerApi.history(),
      scannerApi.cartography(),
      scannerApi.config(),
    ]);
    if (historyResult.status === "fulfilled") {
      setHistory(historyResult.value.reports);
      setLatest(historyResult.value.reports[0] ?? null);
    }
    setCartography((previous) => preserveCartography(previous, cartographyResult));
    if (configResult.status === "fulfilled") setConfig(configResult.value);
    if (historyResult.status === "rejected" && cartographyResult.status === "rejected" && configResult.status === "rejected") throw historyResult.reason;
  }, []);
  useEffect(() => {
    refresh().catch(() => {}).finally(() => setLoading(false));
  }, [refresh]);
  return { latest, setLatest, history, cartography, config, refresh, loading };
}

function best(report: ScanReport | null) {
  return report?.candidates[0] ?? null;
}

function coinMeta(coinType: string): { symbol: string; decimals: number } {
  if (coinType.endsWith("::sui::SUI")) return { symbol: "SUI", decimals: 9 };
  if (coinType.endsWith("::usdc::USDC")) return { symbol: "USDC", decimals: 6 };
  if (coinType.endsWith("::usdsui::USDSUI")) return { symbol: "USDSUI", decimals: 6 };
  if (coinType.endsWith("::xbtc::XBTC")) return { symbol: "xBTC", decimals: 8 };
  if (coinType.endsWith("::wbtc::WBTC")) return { symbol: "WBTC", decimals: 8 };
  if (coinType.endsWith("::eth::ETH")) return { symbol: "ETH", decimals: 8 };
  if (coinType.includes("c0600061")) return { symbol: "USDT", decimals: 6 };
  return { symbol: shortId(coinType), decimals: 9 };
}

function pairKey(market: Pick<MarketDefinition, "base_coin" | "coin_type">) {
  return `${market.base_coin}|${market.coin_type}`;
}

function Metric({ label, value, note, tone = "neutral" }: { label: string; value: string; note: string; tone?: string }) {
  return <div className={`metric ${tone}`}><span>{label}</span><strong>{value}</strong><small>{note}</small></div>;
}

export function OverviewDashboard() {
  const { latest, setLatest, history, refresh, loading } = useScannerData();
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState("");
  const top = best(latest);
  const latestBase = coinMeta(latest?.base_coin ?? "0x2::sui::SUI");
  const qualifying = latest?.candidates.filter((candidate) => candidate.meets_threshold).length ?? 0;

  async function runScan() {
    setScanning(true); setError("");
    try { const report = await scannerApi.scan(defaults); setLatest(report); await refresh(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Scan failed."); }
    finally { setScanning(false); }
  }

  return <div className="stack-xl">
    <section className="hero-panel">
      <div>
        <span className="eyebrow"><Sparkles size={14} /> Sui market intelligence</span>
        <h1>See signal before moving capital.</h1>
        <p>Compare live Cetus and 7K round trips, subtract gas reserve, inspect every evaluated route. Observation only.</p>
        <div className="actions">
          <Link className="button primary" href="/scanner">Open scanner <ArrowRight size={17} /></Link>
          <button className="button secondary" onClick={runScan} disabled={scanning}>{scanning ? <><RefreshCw className="spin" size={17} /> Scanning quotes…</> : <><Play size={17} /> Run scan</>}</button>
        </div>
        {error && <div className="inline-error"><AlertTriangle size={16} /> {error}</div>}
      </div>
      <div className="signal-orb">
        <span>Best net return</span>
        <strong className={top && BigInt(top.net_profit) > 0n ? "positive" : "negative"}>{top ? `${formatAtomic(top.net_profit, latestBase.decimals)} ${latestBase.symbol}` : "—"}</strong>
        <small>{top ? `${top.net_profit_bps} bps · ${formatAge(latest!.observed_at_ms)}` : "Run first scan to establish signal"}</small>
      </div>
    </section>

    <section aria-labelledby="latest-scan">
      <div className="section-heading"><div><span className="eyebrow">Latest observation</span><h2 id="latest-scan">Scanner pulse</h2></div>{latest && <span className="timestamp"><Clock3 size={14} /> {new Date(latest.observed_at_ms).toLocaleTimeString()}</span>}</div>
      <div className="metrics-grid">
        <Metric label="Evaluated" value={latest?.candidates.length.toString() ?? "—"} note="Complete round trips" />
        <Metric label="Positive routes" value={qualifying.toString()} note="Needs repeat confirmation" tone={qualifying ? "good" : "neutral"} />
        <Metric label="Provider failures" value={latest?.failures.length.toString() ?? "—"} note="Partial results retained" tone={latest?.failures.length ? "warn" : "neutral"} />
        <Metric label="Scan age" value={latest ? formatAge(latest.observed_at_ms) : "—"} note="History lives in memory" />
      </div>
    </section>

    <section className="history-section" aria-labelledby="recent-scans">
      <div className="section-heading"><div><span className="eyebrow">Memory-only history</span><h2 id="recent-scans">Recent scans</h2></div><Link href="/scanner" className="text-link">Inspect evidence <ArrowRight size={15} /></Link></div>
      {loading ? <div className="empty-state">Loading scan history…</div> : history.length === 0 ? <div className="empty-state"><Gauge size={28} /><strong>No scans recorded</strong><span>Run first scan. History resets when Rust service restarts.</span></div> : <div className="scan-list">{history.slice(0, 6).map((report) => <ScanHistoryRow key={report.observed_at_ms} report={report} />)}</div>}
    </section>
  </div>;
}

function ScanHistoryRow({ report }: { report: ScanReport }) {
  const top = best(report);
  const base = coinMeta(report.base_coin);
  return <div className="scan-row"><span className="scan-time">{new Date(report.observed_at_ms).toLocaleTimeString()}</span><span>{base.symbol}/{coinMeta(report.quote_coin).symbol} · {report.candidates.length} evaluated</span><span>{report.failures.length} failures</span><strong className={top && BigInt(top.net_profit) > 0n ? "positive" : "negative"}>{top ? `${formatAtomic(top.net_profit, base.decimals)} ${base.symbol}` : "No complete route"}</strong><span>{formatAge(report.observed_at_ms)}</span></div>;
}

type Tab = "map" | "opportunities" | "evaluated" | "routes" | "failures" | "history";

export function ScannerDashboard() {
  const { latest, setLatest, history, cartography, config, refresh, loading } = useScannerData();
  const [form, setForm] = useState(defaults);
  const [tab, setTab] = useState<Tab>("map");
  const [scanning, setScanning] = useState(false);
  const [researching, setResearching] = useState(false);
  const [research, setResearch] = useState<ResearchReport | null>(null);
  const [error, setError] = useState("");
  const activeMarkets = useMemo(() => config?.market_registry.filter((market) => market.enabled && !market.watchlist_only) ?? [], [config]);
  const watchlist = useMemo(() => config?.market_registry.filter((market) => market.watchlist_only) ?? [], [config]);
  useEffect(() => {
    if (form.base_coin || !activeMarkets.length) return;
    const market = activeMarkets.find((candidate) => candidate.symbol === "SUI/USDC") ?? activeMarkets[0];
    setForm((current) => ({ ...current, base_coin: market.base_coin, quote_coin: market.coin_type, amount_in: (10n ** BigInt(market.base_decimals)).toString() }));
  }, [activeMarkets, form.base_coin]);
  const evaluated = useMemo(
    () => research ? research.reports.flatMap((report) => report.candidates) : latest?.candidates ?? [],
    [latest, research],
  );

  async function runScan() {
    setScanning(true); setError("");
    try { const report = await scannerApi.scan(form); setLatest(report); setResearch(null); await refresh(); setTab("evaluated"); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Scan failed."); }
    finally { setScanning(false); }
  }

  async function runResearch() {
    setResearching(true); setError("");
    try {
      const result = await scannerApi.research({
        gas_cost: form.gas_cost,
        min_profit_bps: form.min_profit_bps,
        max_quote_skew_ms: form.max_quote_skew_ms,
        timeout_ms: form.timeout_ms,
        retries: form.retries,
        cetus_sources: form.cetus_sources,
        seven_k_sources: form.seven_k_sources,
      });
      setResearch(result);
      setLatest(result.reports.at(-1) ?? null);
      await refresh();
      setTab("map");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Research failed."); }
    finally { setResearching(false); }
  }

  function selectMarket(value: string) {
    const market = activeMarkets.find((candidate) => pairKey(candidate) === value);
    if (!market) return;
    setForm({
      ...form,
      base_coin: market.base_coin,
      quote_coin: market.coin_type,
      amount_in: (10n ** BigInt(market.base_decimals)).toString(),
    });
  }

  return <div className="stack-lg">
    <div className="page-heading"><div><span className="eyebrow"><Map size={14} /> Opportunity cartographer</span><h1>Where edge survives.</h1><p>Direct-base quotes scan five high-value Sui pairs. Positive pairs advance to venue-isolated checks. ETH stays visible, watchlist-only.</p></div>{latest && <div className="latest-stamp"><span className="status-dot" /> Latest scan {formatAge(latest.observed_at_ms)}</div>}</div>
    {config && <div className="market-registry" aria-label="Market registry">{config.market_registry.map((market) => <span className={market.watchlist_only ? "watchlist" : "active"} key={pairKey(market)}>{market.symbol}<small>{market.watchlist_only ? "Watchlist" : "Active"}</small></span>)}</div>}
    {error && <div className="error-banner"><AlertTriangle size={18} /><div><strong>Scan did not complete</strong><span>{error} Previous evidence remains visible.</span></div></div>}
    <div className="scanner-layout">
      <aside className="control-panel" aria-label="Scan settings">
        <div className="panel-title"><div><Server size={18} /><h2>Research settings</h2></div><span>Read only</span></div>
        <label className="field" htmlFor="one-shot-pair"><span>One-shot pair</span><select id="one-shot-pair" value={form.base_coin && form.quote_coin ? `${form.base_coin}|${form.quote_coin}` : ""} onChange={(event) => selectMarket(event.target.value)}><option value="" disabled>Loading markets…</option>{activeMarkets.map((market) => <option key={pairKey(market)} value={pairKey(market)}>{market.symbol}</option>)}</select>{watchlist.length > 0 && <small>{watchlist.map((market) => market.symbol).join(", ")} watchlist-only</small>}</label>
        <Field label={`One-shot amount (${coinMeta(form.base_coin ?? "0x2::sui::SUI").symbol} atomic)`} value={form.amount_in} onChange={(amount_in) => setForm({ ...form, amount_in })} help="Auto research calibrates each base to USDC, then tests $100–$25k notionals" />
        <Field label="Gas reserve (MIST)" value={form.gas_cost} onChange={(gas_cost) => setForm({ ...form, gas_cost })} help="Quote tier only; atomic simulation replaces it with measured gas" />
        <Field label="Minimum profit (bps)" value={form.min_profit_bps} onChange={(min_profit_bps) => setForm({ ...form, min_profit_bps })} />
        <Field label="Maximum quote skew (ms)" value={String(form.max_quote_skew_ms)} onChange={(value) => setForm({ ...form, max_quote_skew_ms: Number(value) })} help="Rejects legs observed too far apart" />
        <div className="field-pair"><Field label="Timeout (ms)" value={String(form.timeout_ms)} onChange={(value) => setForm({ ...form, timeout_ms: Number(value) })} /><Field label="Retries" value={String(form.retries)} onChange={(value) => setForm({ ...form, retries: Number(value) })} /></div>
        <Field label="7K sources" value={form.seven_k_sources.join(", ")} onChange={(value) => setForm({ ...form, seven_k_sources: value.split(",").map((part) => part.trim()).filter(Boolean) })} help="Comma-separated venue names" />
        <button className="button primary full" onClick={runResearch} disabled={researching || scanning}>{researching ? <><RefreshCw className="spin" size={17} /> Researching sizes…</> : <><Sparkles size={17} /> Auto research</>}</button>
        <button className="button secondary full" onClick={runScan} disabled={researching || scanning}>{scanning ? <><RefreshCw className="spin" size={17} /> Scanning quotes…</> : <><Play size={17} /> Run one scan</>}</button>
        <p className="safety-note">No wallet connection, private key, signing, or submission. Quote-confirmed routes remain non-executable until two matching unsigned atomic simulations survive.</p>
      </aside>
      <section className="results-panel">
        {research && <ResearchSummary report={research} />}
        <div className="tabs" role="tablist" aria-label="Scanner results">
          {(["map", "opportunities", "evaluated", "routes", "failures", "history"] as Tab[]).map((item) => <button key={item} role="tab" aria-selected={tab === item} onClick={() => setTab(item)}>{item}<span>{item === "map" ? cartography?.cells.length ?? 0 : item === "opportunities" ? research?.opportunities.length ?? cartography?.confirmed_signals ?? 0 : item === "evaluated" ? evaluated.length : item === "failures" ? research?.provider_failures ?? latest?.failures.length ?? 0 : item === "history" ? history.length : ""}</span></button>)}
        </div>
        <div className="tab-body" role="tabpanel">
          {loading ? <div className="empty-state">Loading scanner evidence…</div> : tab === "map" ? <CartographyView report={cartography} onResearch={runResearch} /> : tab === "opportunities" ? <OpportunityList research={research} onResearch={runResearch} /> : !latest ? <div className="empty-state"><Gauge size={30} /><strong>No scan evidence yet</strong><span>Run bounded auto research to compare live quote surfaces across sizes.</span><button className="button primary" onClick={runResearch}>Start auto research</button></div> : tab === "evaluated" ? <CandidateList candidates={evaluated} /> : tab === "routes" ? <RouteList candidates={evaluated} /> : tab === "failures" ? <ResearchFailureList research={research} latest={latest} /> : <div className="scan-list">{history.map((report) => <ScanHistoryRow key={report.observed_at_ms} report={report} />)}</div>}
        </div>
      </section>
    </div>
  </div>;
}

function CartographyView({ report, onResearch }: { report: CartographyReport | null; onResearch: () => void }) {
  const [visibleCount, setVisibleCount] = useState(CARTOGRAPHY_PAGE_SIZE);
  if (!report || report.research_runs === 0) return <div className="empty-state"><Database size={30} /><strong>No persistent market evidence yet</strong><span>Run auto research. Results will survive scanner restarts and build this map.</span><button className="button primary" onClick={onResearch}>Map markets</button></div>;
  const rejections = rankRejections(report.rejection_reasons);
  const cells = rankCartographyCells(report.cells);
  const visibleCells = visibleCartographyCells(cells, visibleCount);
  return <div className="map-view">
    <div className="map-overview">
      <div><span>Research runs</span><strong>{report.research_runs}</strong></div>
      <div><span>Round trips</span><strong>{report.observed_round_trips}</strong></div>
      <div><span>Map cells</span><strong>{report.cells.length}</strong></div>
      <div><span>Confirmed signals</span><strong className={report.confirmed_signals ? "positive" : ""}>{report.confirmed_signals}</strong></div>
      <div><span>Simulation confirmed</span><strong className={report.simulation_confirmed_signals ? "positive" : ""}>{report.simulation_confirmed_signals}</strong></div>
    </div>
    <div className="map-section-heading"><div><span className="eyebrow">Market × venue direction</span><h2>Evidence map</h2></div><span>Isolated evidence first · sample count shown</span></div>
    {cells.length === 0 ? <div className="empty-state compact"><Gauge size={26} /><strong>No complete venue paths stored</strong><span>Research ran, but providers returned no comparable round trips.</span></div> : <><div className="market-map">{visibleCells.map((cell) => {
      const bestPositive = BigInt(cell.best_net_profit) > 0n;
      const tone = cell.simulation_status === "simulation_confirmed" ? "hot" : cell.positive_quotes > 0 ? "warm" : "cold";
      const status = cartographyStatus(cell);
      return <article className={`map-cell ${tone}`} key={`${cell.base_coin}-${cell.quote_coin}-${cell.evidence_tier}-${cell.forward_venues}-${cell.reverse_venues}`}>
        <div className="map-cell-head"><div><span>{cell.market_symbol}</span><strong><span>{cell.forward_venues}</span><ArrowRight size={13} /><span>{cell.reverse_venues}</span></strong></div><span className="tier-chip">{cell.evidence_tier === "venue_isolated" ? "Isolated" : "Discovery"}</span></div>
        <div className="map-profit"><span>Best quoted net</span><strong className={bestPositive ? "positive" : "negative"}>{bestPositive ? "+" : ""}{formatAtomic(cell.best_net_profit, cell.base_decimals)} {cell.base_symbol}</strong><small>at {formatAtomic(cell.best_amount_in, cell.base_decimals)} {cell.base_symbol}</small></div>
        <div className="map-stats"><span><strong>{(cell.positive_rate_bps / 100).toFixed(2)}%</strong> quote positive</span><span><strong>{cell.positive_quotes}/{cell.observed_round_trips}</strong> observations</span><span><strong>{cell.confirmed_signals}</strong> quote confirmed</span><span><strong>{cell.simulation_attempts ? `${(cell.simulation_survival_rate_bps / 100).toFixed(0)}%` : "—"}</strong> simulation survival</span><span><strong>{cell.median_observed_half_life_ms === null ? "—" : `${cell.median_observed_half_life_ms} ms`}</strong> median half-life</span></div>
        <div className="map-cell-foot"><span>{formatAge(cell.last_observed_at_ms)}</span><strong>{status}</strong></div>
      </article>;
    })}</div><div className="map-more"><span>Showing {visibleCells.length} of {cells.length} evidence cells</span>{visibleCells.length < cells.length && <button className="button secondary" onClick={() => setVisibleCount((count) => count + CARTOGRAPHY_PAGE_SIZE)}>Show more evidence</button>}</div></>}
    <section className="rejection-panel"><div><span className="eyebrow">Failed gates</span><h2>Why routes disappear</h2></div>{rejections.length === 0 ? <span>No rejection reasons stored.</span> : <div className="rejection-bars">{rejections.slice(0, 8).map(([reason, count]) => <div key={reason}><span>{reason.replaceAll("_", " ")}</span><strong>{count}</strong><i style={{ width: `${Math.max(4, (count / rejections[0][1]) * 100)}%` }} /></div>)}</div>}</section>
  </div>;
}

function ResearchSummary({ report }: { report: ResearchReport }) {
  return <>
    <div className="research-summary" aria-label="Auto research summary">
      <div><span>Sizes</span><strong>6 / pair</strong></div>
      <div><span>Markets</span><strong>{report.markets_tested.length}</strong></div>
      <div><span>Discovery scans</span><strong>{report.discovery_reports}</strong></div>
      <div><span>Isolated scans</span><strong>{report.venue_isolated_reports}</strong></div>
      <div><span>Routes</span><strong>{report.routes_evaluated}</strong></div>
      <div><span>Confirmed</span><strong className={report.opportunities.length ? "positive" : ""}>{report.opportunities.length}</strong></div>
    </div>
    <div className="research-sizing">{report.market_sizing.map((sizing) => <div key={`${sizing.base_coin}-${sizing.quote_coin}`}><strong>{sizing.market_symbol}</strong><span>{sizing.amounts.map((amount) => formatAtomic(amount, sizing.base_decimals, 2)).join(" · ")} {sizing.base_symbol}</span><small>${(Number(sizing.usdc_per_base_atomic) / 1_000_000).toLocaleString(undefined, { maximumFractionDigits: 4 })}/{sizing.base_symbol} · gas {formatAtomic(sizing.gas_cost_base, sizing.base_decimals)} {sizing.base_symbol}</small></div>)}</div>
  </>;
}

function OpportunityList({ research, onResearch }: { research: ResearchReport | null; onResearch: () => void }) {
  if (!research) return <div className="empty-state"><Sparkles size={30} /><strong>Confirmation required</strong><span>Run auto research. One quote pair never counts as opportunity.</span><button className="button primary" onClick={onResearch}>Start auto research</button></div>;
  if (!research.opportunities.length) return <div className="empty-state"><Gauge size={30} /><strong>No quote-confirmed opportunity now</strong><span>{research.routes_evaluated} routes across six USD-normalized sizes and {research.markets_tested.length} markets checked. Losing and rejected routes remain under Evaluated.</span><button className="button secondary" onClick={onResearch}>Research again</button></div>;
  return <div className="candidate-list">{research.opportunities.map((opportunity, index) => <ConfirmedOpportunityRow key={`${opportunity.route_fingerprint}-${opportunity.amount_in}`} opportunity={opportunity} rank={index + 1} />)}</div>;
}

function ConfirmedOpportunityRow({ opportunity, rank }: { opportunity: ConfirmedOpportunity; rank: number }) {
  const candidate = opportunity.representative;
  const simulation = opportunity.simulation;
  const confirmed = opportunity.simulation_status === "simulation_confirmed";
  const base = coinMeta(opportunity.base_coin);
  const quote = coinMeta(opportunity.quote_coin);
  return <details className="candidate confirmed"><summary><div className="rank">{rank}</div><div className="route-name"><strong>{base.symbol}/{quote.symbol} · {candidate.forward.provider} <ArrowRight size={14} /> {candidate.reverse.provider}</strong><span className="validation-chip">{confirmed ? "ATOMIC SIMULATION CONFIRMED" : "VENUE-ISOLATED QUOTE ONLY"} · {opportunity.confirmations}/{opportunity.samples}</span></div><div className="candidate-stat"><span>Input</span><strong>{formatAtomic(opportunity.amount_in, base.decimals)} {base.symbol}</strong></div><div className="candidate-stat"><span>{confirmed ? "Simulated delta" : "Worst quoted net"}</span><strong className={confirmed && simulation && BigInt(simulation.balance_delta) > 0n ? "positive" : ""}>{confirmed && simulation ? `${formatAtomic(simulation.balance_delta, base.decimals)} ${base.symbol}` : `+${formatAtomic(opportunity.worst_net_profit, base.decimals)} ${base.symbol}`}</strong></div><div className="bps"><strong>{simulation ? `${simulation.confirmation_count}/${simulation.attempts}` : candidate.net_profit_bps}</strong><span>{simulation ? "sim" : "bps"}</span></div><ChevronDown className="chevron" size={18} /></summary><div className="confirmation-evidence"><span>Best quoted +{formatAtomic(opportunity.best_net_profit, base.decimals)} {base.symbol}</span><span>Max quote skew {opportunity.max_quote_skew_ms} ms</span><span>Fingerprint {opportunity.route_fingerprint}</span><strong>Simulation {opportunity.simulation_status.replaceAll("_", " ")}</strong>{simulation && <><span>Measured gas {formatAtomic(simulation.measured_gas_cost, base.decimals)} {base.symbol}</span><span>Observed half-life {simulation.elapsed_half_life_ms === null ? "—" : `${simulation.elapsed_half_life_ms} ms`}</span>{simulation.failure_reason && <span>Failure: {simulation.failure_reason}</span>}</>}</div><Evidence candidate={candidate} /></details>;
}

function ResearchFailureList({ research, latest }: { research: ResearchReport | null; latest: ScanReport }) {
  const failures = research ? research.reports.flatMap((report) => report.failures) : latest.failures;
  if (!failures.length) return <div className="empty-state good-state"><Sparkles size={28} /><strong>Providers returned cleanly</strong><span>No forward, reverse, decode, or scoring failures recorded.</span></div>;
  return <div className="failure-list">{failures.map((failure, index) => <div className="failure" key={`${failure.provider}-${failure.stage}-${index}`}><AlertTriangle size={18} /><div><strong>{failure.provider} · {failure.stage}</strong><span>{failure.kind}{failure.retryable ? " · retryable" : ""}</span><p>{failure.message}</p></div></div>)}</div>;
}

function Field({ label, value, onChange, help }: { label: string; value: string; onChange: (value: string) => void; help?: string }) {
  const id = label.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-");
  return <label className="field" htmlFor={id}><span>{label}</span><input id={id} value={value} onChange={(event) => onChange(event.target.value)} inputMode="numeric" />{help && <small>{help}</small>}</label>;
}

function CandidateList({ candidates }: { candidates: Candidate[] }) {
  if (!candidates.length) return <div className="empty-state"><AlertTriangle size={28} /><strong>No complete round trips</strong><span>Check provider failures or adjust source filters.</span></div>;
  return <div className="candidate-list">{candidates.map((candidate, index) => { const base = coinMeta(candidate.forward.coin_in); return <details className="candidate" key={`${candidate.forward.provider}-${candidate.reverse.provider}-${index}`}><summary><div className="rank">{index + 1}</div><div className="route-name"><strong>{coinMeta(candidate.forward.coin_in).symbol}/{coinMeta(candidate.forward.coin_out).symbol} · {candidate.forward.provider} <ArrowRight size={14} /> {candidate.reverse.provider}</strong><span>{candidate.forward.route.map((hop) => hop.venue).join(" + ") || "Direct quote"}</span></div><div className="candidate-stat"><span>Returned</span><strong>{formatAtomic(candidate.returned_base, base.decimals)} {base.symbol}</strong></div><div className="candidate-stat"><span>Net</span><strong className={BigInt(candidate.net_profit) > 0n ? "positive" : "negative"}>{formatAtomic(candidate.net_profit, base.decimals)} {base.symbol}</strong></div><div className="bps"><strong>{candidate.net_profit_bps}</strong><span>bps</span></div><ChevronDown className="chevron" size={18} /></summary><Evidence candidate={candidate} /></details>; })}</div>;
}

function Evidence({ candidate }: { candidate: Candidate }) {
  const base = coinMeta(candidate.forward.coin_in);
  return <div className="evidence"><div className="evidence-grid"><div><span>Gross profit</span><strong>{formatAtomic(candidate.gross_profit, base.decimals)} {base.symbol}</strong></div><div><span>Gas reserve</span><strong>{formatAtomic(candidate.gas_cost, base.decimals)} {base.symbol}</strong></div><div><span>Quote skew</span><strong>{candidate.quote_skew_ms} ms</strong></div><div><span>Provider gas hint</span><strong>{candidate.forward.estimated_gas_cost ? `${formatSui(candidate.forward.estimated_gas_cost)} SUI` : "Unavailable"}</strong></div><div><span>Forward latency</span><strong>{candidate.forward.latency_ms} ms</strong></div><div><span>Reverse latency</span><strong>{candidate.reverse.latency_ms} ms</strong></div></div>{candidate.same_quote_provider && <div className="warning"><AlertTriangle size={15} /> Same quote provider used for both legs.</div>}{candidate.shared_pool_ids.length > 0 && <div className="warning"><AlertTriangle size={15} /> Shared liquidity: {candidate.shared_pool_ids.map(shortId).join(", ")}</div>}{candidate.rejection_reasons.length > 0 && <div className="warning"><AlertTriangle size={15} /> Rejected: {candidate.rejection_reasons.join(", ").replaceAll("_", " ")}</div>}<HopGroup label="Forward" quote={candidate.forward} /><HopGroup label="Reverse" quote={candidate.reverse} /></div>;
}

function HopGroup({ label, quote }: { label: string; quote: Candidate["forward"] }) {
  return <div className="hop-group"><div><strong>{label}</strong><span>{quote.provider} · quote {quote.quote_id ? shortId(quote.quote_id) : "unavailable"}</span></div>{quote.route.map((hop, index) => <div className="hop" key={`${hop.pool_id}-${index}`}><span>{index + 1}</span><strong>{hop.venue}</strong><code>{shortId(hop.pool_id)}</code></div>)}</div>;
}

function RouteList({ candidates }: { candidates: Candidate[] }) {
  return <div className="route-list">{candidates.flatMap((candidate, index) => [<HopGroup key={`f-${index}`} label={`Route ${index + 1} · Forward`} quote={candidate.forward} />, <HopGroup key={`r-${index}`} label={`Route ${index + 1} · Reverse`} quote={candidate.reverse} />])}</div>;
}
