# Hatch Sui Scanner

Read-only quote-surface scanner for Sui. It requests exact-in quotes from Cetus and Bluefin/7K, calculates every quoted SUI-to-USDC-to-SUI round trip, subtracts a configurable gas reserve, and emits one compact JSON object per run.

Scanner cannot sign or submit transactions. It has no wallet, keypair, PTB, or Sui execution dependency.

## Run

```bash
cargo run --manifest-path apps/scanner/Cargo.toml --release -- \
  --amount 1000000000 \
  --gas-cost 10000000 \
  --min-profit-bps 0 \
  --timeout-ms 5000 \
  --retries 1
```

Defaults represent 1 SUI input and 0.01 SUI reserved gas. Output is a single JSON line. Atomic amounts and signed profit fields are encoded as strings to avoid downstream precision loss.

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

- `candidates`: all complete quoted round trips, sorted by net basis points.
- `meets_threshold`: positive net result at or above `min_profit_bps`.
- `failures`: provider, scan stage, failure class, retryability, and message.
- `route`: underlying venue and pool metadata supplied by each aggregator.
- `route_index`: preserves split-route branch grouping from Bluefin/7K.
- `same_quote_provider` and `shared_pool_ids`: quick false-positive risk signals.
- `observed_at_ms` and `latency_ms`: local freshness evidence for each quote.

Quoted legs are not atomic and aggregators can use overlapping liquidity. Treat output as discovery evidence, not guaranteed executable profit. Direct pool-state decoding and transaction simulation belong in later phases.

## Verify

```bash
cargo fmt --manifest-path apps/scanner/Cargo.toml --check
cargo test --manifest-path apps/scanner/Cargo.toml
cargo clippy --manifest-path apps/scanner/Cargo.toml --all-targets -- -D warnings
```
