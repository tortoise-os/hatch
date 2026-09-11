# Hatch Sui Scanner

Read-only quote-surface scanner for Sui. It requests exact-in quotes from Cetus and Bluefin/7K, calculates quoted SUI round trips with integer arithmetic, subtracts a configurable gas reserve, and rejects stale or shared-liquidity comparisons.

Scanner cannot sign or submit transactions. It has no wallet, keypair, PTB, or Sui execution dependency.

## Operator web app

Start read-only scanner API:

```bash
bun run dev:scanner
```

In another terminal, start TortoiseOS dashboard:

```bash
bun run dev:web
```

Open `http://127.0.0.1:3410`. Overview shows latest signal and service health. Scanner workspace at `/scanner` can run one-shot scans or bounded auto research across USDC, USDT, CETUS, DEEP, WAL, and BUCK. Auto research sweeps eight SUI sizes, advances positive market/size pairs to venue-isolated 7K quotes, and rechecks route fingerprints three times. API listens on `http://127.0.0.1:3411`.

Research history appends to `apps/scanner/data/research.jsonl` and reloads after scanner restart. Override location with `HATCH_SCANNER_JOURNAL`. Web app has no wallet or execution controls.

## Run

```bash
cargo run --manifest-path apps/scanner/Cargo.toml --release -- \
  --amount 1000000000 \
  --gas-cost 2000000 \
  --min-profit-bps 1 \
  --max-quote-skew-ms 2000 \
  --timeout-ms 5000 \
  --retries 1
```

Defaults represent 1 SUI input, 0.002 SUI reserved gas, 1 bps minimum net profit, and 2 second maximum quote-observation skew. Output is a single JSON line. Atomic amounts and signed profit fields are encoded as strings to avoid downstream precision loss.

Trigger full research through the local API:

```bash
curl -X POST http://127.0.0.1:3411/api/research \
  -H 'content-type: application/json' \
  --data '{}'
```

Useful overrides:

```bash
# Restrict both aggregators to named venues
cargo run --manifest-path apps/scanner/Cargo.toml -- \
  --cetus-sources CETUS,TURBOS,DEEPBOOKV3 \
  --seven-k-sources cetus,turbos,deepbook_v3

# Save repeated scans as JSONL from an external scheduler
cargo run --manifest-path apps/scanner/Cargo.toml --release -- >> scans.jsonl
```

## Output interpretation

- `candidates`: all evaluated round trips, including losses and rejected routes.
- `meets_threshold`: positive after reserve, at or above `min_profit_bps`, with route evidence, no shared pool IDs, and quote skew inside limit.
- `rejection_reasons`: exact gates that prevented promotion.
- `POST /api/research`: bounded market/size matrix with repeated fingerprint confirmation.
- `opportunities`: venue-isolated routes positive in at least two of three samples for one market and size.
- `validation_tier: venue_isolated_quote_confirmed`: repeated isolated quote evidence only; full PTB simulation remains pending.
- `GET /api/cartography`: persisted evidence grouped by market, evidence tier, and directional venue path.
- `failures`: provider, scan stage, failure class, retryability, and message.
- `route`: underlying venue and pool metadata supplied by each aggregator.
- `route_index`: preserves split-route branch grouping from Bluefin/7K.
- `same_quote_provider` and `shared_pool_ids`: quick false-positive risk signals.
- `observed_at_ms` and `latency_ms`: local freshness evidence for each quote.

Quoted legs are not atomic. Treat even quote-confirmed output as discovery evidence, not guaranteed executable profit. Full PTB construction, dry-run balance checks, and measured gas belong in later phase.

## Verify

```bash
cargo fmt --manifest-path apps/scanner/Cargo.toml --check
cargo test --manifest-path apps/scanner/Cargo.toml
cargo clippy --manifest-path apps/scanner/Cargo.toml --all-targets -- -D warnings
```
