"use client";

import { AlertTriangle, ArrowRight, ChevronDown, Clock3, Gauge, Play, RefreshCw, Route, Server, Sparkles } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { formatAge, formatSui, scannerApi, shortId, type Candidate, type ScanInput, type ScanReport } from "@/lib/api";

const defaults: ScanInput = {
  amount_in: "1000000000",
  gas_cost: "10000000",
  min_profit_bps: "0",
  timeout_ms: 5000,
  retries: 1,
  cetus_sources: [],
  seven_k_sources: ["turbos", "cetus", "aftermath", "deepbook_v3", "flowx_v3", "bluefin"],
};

function useScannerData() {
  const [latest, setLatest] = useState<ScanReport | null>(null);
  const [history, setHistory] = useState<ScanReport[]>([]);
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    const result = await scannerApi.history();
    setHistory(result.reports);
    setLatest(result.reports[0] ?? null);
  }, []);
  useEffect(() => {
    refresh().catch(() => {}).finally(() => setLoading(false));
  }, [refresh]);
  return { latest, setLatest, history, refresh, loading };
}

function best(report: ScanReport | null) {
  return report?.candidates[0] ?? null;
}

function Metric({ label, value, note, tone = "neutral" }: { label: string; value: string; note: string; tone?: string }) {
  return <div className={`metric ${tone}`}><span>{label}</span><strong>{value}</strong><small>{note}</small></div>;
}

export function OverviewDashboard() {
  const { latest, setLatest, history, refresh, loading } = useScannerData();
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState("");
  const top = best(latest);
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
        <p>Compare live Cetus and 7K round trips, subtract gas reserve, inspect every route. Observation only.</p>
        <div className="actions">
          <Link className="button primary" href="/scanner">Open scanner <ArrowRight size={17} /></Link>
          <button className="button secondary" onClick={runScan} disabled={scanning}>{scanning ? <><RefreshCw className="spin" size={17} /> Scanning quotes…</> : <><Play size={17} /> Run scan</>}</button>
        </div>
        {error && <div className="inline-error"><AlertTriangle size={16} /> {error}</div>}
      </div>
      <div className="signal-orb">
        <span>Best net return</span>
        <strong className={top && BigInt(top.net_profit) > 0n ? "positive" : "negative"}>{top ? `${formatSui(top.net_profit)} SUI` : "—"}</strong>
        <small>{top ? `${top.net_profit_bps} bps · ${formatAge(latest!.observed_at_ms)}` : "Run first scan to establish signal"}</small>
      </div>
    </section>

    <section aria-labelledby="latest-scan">
      <div className="section-heading"><div><span className="eyebrow">Latest observation</span><h2 id="latest-scan">Scanner pulse</h2></div>{latest && <span className="timestamp"><Clock3 size={14} /> {new Date(latest.observed_at_ms).toLocaleTimeString()}</span>}</div>
      <div className="metrics-grid">
        <Metric label="Candidates" value={latest?.candidates.length.toString() ?? "—"} note="Complete round trips" />
        <Metric label="Qualifying" value={qualifying.toString()} note="Positive after reserve" tone={qualifying ? "good" : "neutral"} />
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
  return <div className="scan-row"><span className="scan-time">{new Date(report.observed_at_ms).toLocaleTimeString()}</span><span>{report.candidates.length} routes</span><span>{report.failures.length} failures</span><strong className={top && BigInt(top.net_profit) > 0n ? "positive" : "negative"}>{top ? `${formatSui(top.net_profit)} SUI` : "No complete route"}</strong><span>{formatAge(report.observed_at_ms)}</span></div>;
}

type Tab = "candidates" | "routes" | "failures" | "history";

export function ScannerDashboard() {
  const { latest, setLatest, history, refresh, loading } = useScannerData();
  const [form, setForm] = useState(defaults);
  const [tab, setTab] = useState<Tab>("candidates");
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState("");

  async function runScan() {
    setScanning(true); setError("");
    try { const report = await scannerApi.scan(form); setLatest(report); await refresh(); setTab("candidates"); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Scan failed."); }
    finally { setScanning(false); }
  }

  return <div className="stack-lg">
    <div className="page-heading"><div><span className="eyebrow"><Route size={14} /> Quote-surface scanner</span><h1>Round-trip evidence</h1><p>Compare SUI → USDC → SUI across aggregators. Values use atomic integer math.</p></div>{latest && <div className="latest-stamp"><span className="status-dot" /> Latest scan {formatAge(latest.observed_at_ms)}</div>}</div>
    {error && <div className="error-banner"><AlertTriangle size={18} /><div><strong>Scan did not complete</strong><span>{error} Previous evidence remains visible.</span></div></div>}
    <div className="scanner-layout">
      <aside className="control-panel" aria-label="Scan settings">
        <div className="panel-title"><div><Server size={18} /><h2>Scan settings</h2></div><span>Bounded run</span></div>
        <Field label="Input amount (MIST)" value={form.amount_in} onChange={(amount_in) => setForm({ ...form, amount_in })} help="1 SUI = 1,000,000,000 MIST" />
        <Field label="Gas reserve (MIST)" value={form.gas_cost} onChange={(gas_cost) => setForm({ ...form, gas_cost })} />
        <Field label="Minimum profit (bps)" value={form.min_profit_bps} onChange={(min_profit_bps) => setForm({ ...form, min_profit_bps })} />
        <div className="field-pair"><Field label="Timeout (ms)" value={String(form.timeout_ms)} onChange={(value) => setForm({ ...form, timeout_ms: Number(value) })} /><Field label="Retries" value={String(form.retries)} onChange={(value) => setForm({ ...form, retries: Number(value) })} /></div>
        <Field label="7K sources" value={form.seven_k_sources.join(", ")} onChange={(value) => setForm({ ...form, seven_k_sources: value.split(",").map((part) => part.trim()).filter(Boolean) })} help="Comma-separated venue names" />
        <button className="button primary full" onClick={runScan} disabled={scanning}>{scanning ? <><RefreshCw className="spin" size={17} /> Scanning quotes…</> : <><Play size={17} /> Run scan</>}</button>
        <p className="safety-note">No wallet connected. No transaction can be built or submitted.</p>
      </aside>
      <section className="results-panel">
        <div className="tabs" role="tablist" aria-label="Scanner results">
          {(["candidates", "routes", "failures", "history"] as Tab[]).map((item) => <button key={item} role="tab" aria-selected={tab === item} onClick={() => setTab(item)}>{item}<span>{item === "candidates" ? latest?.candidates.length ?? 0 : item === "failures" ? latest?.failures.length ?? 0 : item === "history" ? history.length : ""}</span></button>)}
        </div>
        <div className="tab-body" role="tabpanel">
          {loading ? <div className="empty-state">Loading scanner evidence…</div> : !latest ? <div className="empty-state"><Gauge size={30} /><strong>No scan evidence yet</strong><span>Run first bounded scan to compare live quote surfaces.</span><button className="button primary" onClick={runScan}>Run first scan</button></div> : tab === "candidates" ? <CandidateList candidates={latest.candidates} /> : tab === "routes" ? <RouteList candidates={latest.candidates} /> : tab === "failures" ? <FailureList report={latest} /> : <div className="scan-list">{history.map((report) => <ScanHistoryRow key={report.observed_at_ms} report={report} />)}</div>}
        </div>
      </section>
    </div>
  </div>;
}

function Field({ label, value, onChange, help }: { label: string; value: string; onChange: (value: string) => void; help?: string }) {
  const id = label.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-");
  return <label className="field" htmlFor={id}><span>{label}</span><input id={id} value={value} onChange={(event) => onChange(event.target.value)} inputMode="numeric" />{help && <small>{help}</small>}</label>;
}

function CandidateList({ candidates }: { candidates: Candidate[] }) {
  if (!candidates.length) return <div className="empty-state"><AlertTriangle size={28} /><strong>No complete round trips</strong><span>Check provider failures or adjust source filters.</span></div>;
  return <div className="candidate-list">{candidates.map((candidate, index) => <details className="candidate" key={`${candidate.forward.provider}-${candidate.reverse.provider}-${index}`}><summary><div className="rank">{index + 1}</div><div className="route-name"><strong>{candidate.forward.provider} <ArrowRight size={14} /> {candidate.reverse.provider}</strong><span>{candidate.forward.route.map((hop) => hop.venue).join(" + ") || "Direct quote"}</span></div><div className="candidate-stat"><span>Returned</span><strong>{formatSui(candidate.returned_base)} SUI</strong></div><div className="candidate-stat"><span>Net</span><strong className={BigInt(candidate.net_profit) > 0n ? "positive" : "negative"}>{formatSui(candidate.net_profit)} SUI</strong></div><div className="bps"><strong>{candidate.net_profit_bps}</strong><span>bps</span></div><ChevronDown className="chevron" size={18} /></summary><Evidence candidate={candidate} /></details>)}</div>;
}

function Evidence({ candidate }: { candidate: Candidate }) {
  return <div className="evidence"><div className="evidence-grid"><div><span>Gross profit</span><strong>{formatSui(candidate.gross_profit)} SUI</strong></div><div><span>Gas reserve</span><strong>{formatSui(candidate.gas_cost)} SUI</strong></div><div><span>Forward latency</span><strong>{candidate.forward.latency_ms} ms</strong></div><div><span>Reverse latency</span><strong>{candidate.reverse.latency_ms} ms</strong></div></div>{candidate.same_quote_provider && <div className="warning"><AlertTriangle size={15} /> Same quote provider used for both legs.</div>}{candidate.shared_pool_ids.length > 0 && <div className="warning"><AlertTriangle size={15} /> Shared liquidity: {candidate.shared_pool_ids.map(shortId).join(", ")}</div>}<HopGroup label="Forward" quote={candidate.forward} /><HopGroup label="Reverse" quote={candidate.reverse} /></div>;
}

function HopGroup({ label, quote }: { label: string; quote: Candidate["forward"] }) {
  return <div className="hop-group"><div><strong>{label}</strong><span>{quote.provider} · quote {quote.quote_id ? shortId(quote.quote_id) : "unavailable"}</span></div>{quote.route.map((hop, index) => <div className="hop" key={`${hop.pool_id}-${index}`}><span>{index + 1}</span><strong>{hop.venue}</strong><code>{shortId(hop.pool_id)}</code></div>)}</div>;
}

function RouteList({ candidates }: { candidates: Candidate[] }) {
  return <div className="route-list">{candidates.flatMap((candidate, index) => [<HopGroup key={`f-${index}`} label={`Route ${index + 1} · Forward`} quote={candidate.forward} />, <HopGroup key={`r-${index}`} label={`Route ${index + 1} · Reverse`} quote={candidate.reverse} />])}</div>;
}

function FailureList({ report }: { report: ScanReport }) {
  if (!report.failures.length) return <div className="empty-state good-state"><Sparkles size={28} /><strong>Providers returned cleanly</strong><span>No forward, reverse, decode, or scoring failures recorded.</span></div>;
  return <div className="failure-list">{report.failures.map((failure, index) => <div className="failure" key={`${failure.provider}-${failure.stage}-${index}`}><AlertTriangle size={18} /><div><strong>{failure.provider} · {failure.stage}</strong><span>{failure.kind}{failure.retryable ? " · retryable" : ""}</span><p>{failure.message}</p></div></div>)}</div>;
}
