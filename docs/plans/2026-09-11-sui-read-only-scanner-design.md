# Sui Read-Only Arbitrage Scanner Design

Date: 2026-09-11
Status: Approved

## Goal

Ship a useful, bounded Sui scanner before building any flash-loan or transaction executor. The scanner compares live quote surfaces, calculates round-trip returns with integer arithmetic, and emits auditable opportunity records. It never accepts a private key, signs a transaction, or submits a programmable transaction block.

## Existing system and project choice

`hatch` is the correct repository because TortoiseOS documentation assigns arbitrage and advanced strategy work to Hatch. Its current bot monitor is not reusable as a price source: it uses synthetic pool identifiers, placeholder reserves and prices, and the retired `@mysten/sui.js` JSON-RPC client. The strategy SDK also contains placeholder route discovery.

`carapace` contains useful indexing patterns but tracks Carapace's own AMM rather than external Sui liquidity. It also has an unrelated local modification, so this work must not touch it. `bun-move` is ecosystem scaffolding. `turtle-net` is unrelated.

Public projects inform architecture without becoming dependencies:

- Fuzzland `sui-mev` separates DEX indexing, simulation, object management, and strategy selection, but its public repository has one historical commit and an older Sui stack.
- Cetus Aggregator exposes current route quotes and route-level venue/pool metadata across many Sui liquidity sources.
- Bluefin/7K Aggregator exposes a second quote surface with route, hop, venue, and pool metadata.
- DeepBook v3 demonstrates durable direct-state indexing. That belongs in a later scanner phase.

## Chosen first slice

Create standalone Rust binary at `apps/scanner`. Rust matches repository tooling policy and provides exact integer handling without JavaScript `number` conversion risk.

One bounded scan performs:

1. Request base-to-quote quotes from Cetus and Bluefin/7K concurrently.
2. For every successful forward quote, request quote-to-base returns from both providers using exact forward output.
3. Calculate gross and net base-asset profit. Net profit subtracts configurable gas reserve.
4. Rank candidate round trips by net basis points.
5. Emit one JSON object per scan, suitable for JSONL collection.

Default market is native SUI to native USDC and back. Coin types, input amount, source filters, API endpoints, timeout, retry count, gas reserve, and minimum profit threshold remain configurable.

## Components

- `model`: normalized quotes, route hops, candidates, provider failures, scan report.
- `provider`: object-safe asynchronous quote contract plus retry/error classification.
- `providers::cetus`: published `router_v3/find_routes` request and response adapter.
- `providers::seven_k`: published Bluefin/7K `v3/quote` request and response adapter.
- `scanner`: round-trip fan-out, exact profit arithmetic, filtering, deterministic ranking.
- `main`: CLI parsing, one-shot execution, JSONL output, meaningful exit status.

Adapters retain provider quote IDs, observed time, latency, underlying venue names, and pool IDs. Records are signals, not executable guarantees: both aggregators may route through overlapping liquidity, and quoted legs are not atomic.

## Failure behavior

Timeouts, HTTP 429, and server errors receive bounded retry with short exponential backoff. Permanent 4xx and malformed responses fail immediately. One provider failure does not erase successful results from another provider. A scan fails only when no complete round trip can be calculated.

No response amount is converted through floating point. Atomic-unit fields parse into `u128`; values exceeding supported range become explicit provider errors.

## Acceptance

- `cargo test --manifest-path apps/scanner/Cargo.toml` passes parsing, arithmetic, ranking, retry classification, and partial-failure tests.
- `cargo clippy --manifest-path apps/scanner/Cargo.toml --all-targets -- -D warnings` passes.
- Live smoke scan returns valid JSONL or a precise upstream error without requiring wallet credentials.
- CLI exposes no signing, transaction building, execution, flash-loan, or secret-key option.

## Non-goals

Direct CLMM tick reconstruction, DeepBook order-book replay, continuous storage, alerts, dashboard UI, transaction simulation, PTB construction, signing, execution, flash loans, and profitability guarantees remain outside this phase.
