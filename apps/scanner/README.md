# Hatch Sui Scanner

Read-only quote-surface scanner for Sui. It requests exact-in quotes from Cetus and Bluefin/7K, calculates quoted SUI round trips with integer arithmetic, subtracts a configurable gas reserve, and rejects stale or shared-liquidity comparisons.

Scanner cannot sign or submit transactions. Optional simulation tier builds one unsigned atomic PTB with Cetus CLMM borrow/repay and Cetus aggregator swap builders, then sends it only to Sui `simulateTransaction`. No private key, keypair, signature, wallet connection, or submission path exists.

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

Research history appends to `apps/scanner/data/research.jsonl` and reloads after scanner restart. Override location with `HATCH_SCANNER_JOURNAL`. Web app has no wallet, signing, or execution controls.

### Optional unsigned atomic simulation

Simulation stays disabled unless all required public configuration is supplied. `HATCH_SIMULATION_SENDER` is only a public address with enough SUI to model gas selection; no secret belongs in scanner configuration.

```bash
HATCH_SIMULATION_ENABLED=true \
HATCH_SIMULATION_SENDER=0xPUBLIC_ADDRESS \
HATCH_FLASH_POOL_ID=0xCETUS_CLMM_POOL \
HATCH_FLASH_POOL_COIN_A=0x2::sui::SUI \
HATCH_FLASH_POOL_COIN_B=0xOTHER_COIN_TYPE \
HATCH_FLASH_POOL_FEE_RATE_PPM=100 \
bun run dev:scanner
```

Pool coin order and fee rate must match selected Cetus CLMM pool. Fee denominator is 1,000,000; for example, tick-spacing-2 pool uses `100`. Scanner rejects routes sharing any swap pool or overlapping configured flash-loan pool. It rebuilds both isolated routes, requires identical ordered pool fingerprint, requests effects/balance changes/command results, and promotes only after two positive sender balance deltas. Sender delta includes measured gas.

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
- `validation_tier: venue_isolated_quote_confirmed`: repeated isolated quote evidence.
- `simulation_status: simulation_confirmed`: two matching unsigned atomic simulations returned positive SUI balance delta after flash-loan fee and measured gas.
- Other simulation statuses remain rejected evidence: `pending`, `simulation_failed`, `simulation_non_positive`, or `fingerprint_mismatch`.
- `GET /api/cartography`: persisted evidence grouped by market, evidence tier, and directional venue path.
- `failures`: provider, scan stage, failure class, retryability, and message.
- `route`: underlying venue and pool metadata supplied by each aggregator.
- `route_index`: preserves split-route branch grouping from Bluefin/7K.
- `same_quote_provider` and `shared_pool_ids`: quick false-positive risk signals.
- `observed_at_ms` and `latency_ms`: local freshness evidence for each quote.

Quoted legs are not atomic. Treat quote-confirmed output as discovery evidence. `simulation_confirmed` is stronger execution evidence, still not guaranteed profit: it is unsigned, not submitted, and can decay before inclusion.

## Verify

```bash
cargo fmt --manifest-path apps/scanner/Cargo.toml --check
cargo test --manifest-path apps/scanner/Cargo.toml
cargo clippy --manifest-path apps/scanner/Cargo.toml --all-targets -- -D warnings
bun run --filter @hatch/simulator typecheck
bun run --filter @hatch/simulator test
bun run --filter @hatch/web typecheck
bun run --filter @hatch/web test
```
