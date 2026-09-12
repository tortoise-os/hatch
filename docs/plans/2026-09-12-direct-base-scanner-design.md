# Direct-base scanner design

## Goal

Scan `USDC/USDT`, `SUI/USDC`, `USDC/USDSUI`, `USDC/xBTC`, and `xBTC/WBTC` as explicit round-trip markets. Keep Sui Bridge ETH visible but excluded from research. Preserve read-only operation and existing persisted evidence.

## Chosen approach

Use pair-aware market definitions with base coin, quote coin, symbols, decimals, enabled state, and watchlist state. Existing quote-only market records deserialize as legacy SUI-base records through defaults. Group confirmations and cartography by both base and quote so evidence cannot collide across pairs.

Before default research, calibrate each active base against native USDC. USDC uses exact parity; SUI and xBTC use fresh forward-only Cetus and 7K quotes. Convert `$100`, `$500`, `$1,000`, `$5,000`, `$10,000`, and `$25,000` targets into each base asset's atomic units. Convert configured SUI gas reserve into matching base units with conservative ceiling division before scoring. Persist per-market sizing, calibration source, and converted gas evidence.

Fixed per-token ladders were rejected because they drift with prices. Gross-profit-only scoring was rejected because it would promote routes without comparable gas costs. Generic user-defined asset discovery was rejected for this slice; verified registry entries keep scope and safety bounded.

## Data flow

`POST /api/research` builds calibrated plans, then scans each enabled pair and size. Positive `(base, quote, amount)` tuples advance to venue-isolated confirmation. Optional atomic simulation remains SUI-base only; non-SUI confirmations stay quote-only. `POST /api/scans` accepts optional `base_coin` for one-shot direct-pair diagnosis.

UI loads registry from `/api/config`, exposes active pair selection for one-shot scans, labels ETH as watchlist-only, formats amounts using base metadata, and displays per-pair USD sizing evidence.

## Verification

- Unit-test registry, legacy deserialization, per-base sizing, gas conversion, and pair-aware grouping.
- Preserve journal reload and cartography tests.
- Run Rust format, tests, and clippy; web typecheck, tests, and production build.
- Run bounded live research across five active pairs and verify ETH produces no scan.

## Sources

- `apps/scanner/src/research.rs`
- `apps/scanner/src/api.rs`
- `apps/scanner/src/cartography.rs`
- `apps/web/src/components/dashboard.tsx`
- `apps/web/src/lib/api.ts`
