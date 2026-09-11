# Phase 01 Plan 01: Read-Only Sui Scanner Summary

**Rust scanner now turns live Cetus and Bluefin/7K quotes into ranked, auditable round-trip signals without wallet or transaction capabilities.**

## Accomplishments

- Added standalone `apps/scanner` Rust CLI with configurable pair, amount, gas reserve, threshold, timeout, retry count, endpoints, and venue filters.
- Added live adapters for Cetus `router_v3/find_routes` and Bluefin/7K `v3/quote` based on current published SDK request contracts.
- Added exact `u128`/`i128` profit arithmetic and string-encoded atomic JSON values.
- Added bounded retry classification, partial-provider failure preservation, deterministic candidate ranking, split-route branch indices, and shared-pool detection.
- Added ten tests covering provider response contracts, zero-output rejection, retry classification, source parsing, profit scoring, thresholding, serialization, and partial failures.

## Files Created/Modified

- `apps/scanner/Cargo.toml` and `Cargo.lock` - standalone Rust package and pinned dependencies.
- `apps/scanner/src/` - CLI, normalized models, HTTP boundary, provider adapters, retry logic, and scanner.
- `apps/scanner/tests/fixtures/` - current Cetus and Bluefin/7K response-contract fixtures.
- `apps/scanner/README.md` - run commands, output semantics, and limitations.
- `.gitignore` - ignores Rust `target` output.
- `.planning/ROADMAP.md` - marks read-only quote scanner phase complete.

## Decisions Made

- Call published HTTP quote contracts directly instead of importing transaction-capable TypeScript SDKs.
- Emit all complete round trips, including losing routes, and mark only positive routes above threshold as opportunities.
- Keep aggregator identity separate from underlying venue/pool route metadata.
- Treat shared pool IDs and same-aggregator legs as visible risk signals, not automatic exclusion rules.

## Issues Encountered

- Configured `sccache` cannot run inside filesystem sandbox; verification ran with approved host execution.
- Prime graph registration failed because configured AllSource instance is a read-only replica. Files remain canonical.
- Initial live scan showed gross-positive but gas-negative paths. Scanner correctly retained evidence and flagged zero opportunities.

## Verification

- `cargo fmt --manifest-path apps/scanner/Cargo.toml --check` passed.
- `cargo test --manifest-path apps/scanner/Cargo.toml` passed: 10 tests, 0 failures.
- `cargo clippy --manifest-path apps/scanner/Cargo.toml --all-targets -- -D warnings` passed.
- Live mainnet scan passed: 4 candidates, 0 provider failures, 0 net-positive opportunities with 0.01 SUI gas reserve.
- Best observed live candidate: +6,604,829 MIST gross; -3,395,171 MIST net; -33 bps after gas reserve.
- Dependency tree contains HTTP/CLI/serialization/runtime crates only; no Sui signer, wallet, keypair, PTB, or execution SDK.

## Next Step

Run repeated scans across several input sizes and venue filters, then measure quote freshness and candidate persistence before designing direct-state ingestion. Flash-loan execution remains deferred.
