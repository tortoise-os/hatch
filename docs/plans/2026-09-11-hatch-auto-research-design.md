# Hatch Auto Research Design

Date: 2026-09-11
Status: Approved by operator request

## Problem

Hatch currently labels every completed round trip as a candidate. Four candidates can therefore mean four losing routes, as in the operator screenshot. One fixed 1 SUI sample also misses size-dependent price dislocations. Quote APIs are live, but a single non-atomic comparison is not an executable opportunity.

## Truth model

Use three explicit levels:

1. **Evaluated route**: both quote legs returned and integer scoring completed.
2. **Quote-confirmed opportunity**: positive after gas reserve and minimum-profit threshold, non-empty routes, no shared pool IDs, bounded quote-observation skew, and repeated confirmation for the same amount/provider/pool fingerprint.
3. **Simulated opportunity**: complete atomic PTB dry-run succeeds with measured gas and balance changes. Deferred with the flash-loan/PTB phase.

Hatch must never call level 1 an opportunity. Current implementation can reach level 2 only. UI must keep the `READ ONLY` boundary and show the validation tier beside every promoted result.

## Auto research

Add `POST /api/research`. One bounded request sweeps 0.1, 0.25, 0.5, 1, 2, 5, 10, and 25 SUI across USDC, USDT, CETUS, DEEP, and WAL by default. Maximum 12 amounts and eight markets prevent unbounded upstream traffic. Each market/size pair receives one discovery scan. Pairs with a qualifying route receive two additional confirmation scans.

Results group candidates by quote market, amount, quote-provider direction, and ordered forward/reverse pool IDs. A group is promoted only when it appears profitably in at least two samples. Report conservative `worst_net_profit`, `best_net_profit`, confirmation count, sample count, maximum observed quote skew, and representative route evidence. Keep every discovery report in normal in-memory history.

Default gas reserve changes from 0.01 SUI to 0.002 SUI. This remains an operator reserve, not measured transaction gas. Cetus `data.gas` is recorded as provider metadata but cannot replace full PTB simulation. Cetus router API version changes to current documented `v=1999999`.

## UI

Rename `Candidates` to `Opportunities`; count only quote-confirmed results. Add `Evaluated` tab for all completed round trips. `Auto research` becomes primary scanner action; one-shot scan remains available for manual diagnosis. Empty state says no opportunity exists now and reports sizes/routes checked. History rows say `evaluated`, not `routes` or candidates.

Promoted rows show `QUOTE CONFIRMED`, confirmation ratio, worst-case net, best-case net, quote skew, amount, provider direction, venue/pool evidence, and explicit `PTB simulation pending`. Losses remain inspectable under Evaluated and History, never under Opportunities.

## Failure handling and verification

Research lock prevents overlapping scans/research. Partial amount failures remain visible; successful sizes are retained. Invalid, duplicate, zero, or oversized amount grids return typed `400` errors. Total absence of positive signals is successful research with an empty opportunity list.

Rust tests cover classification gates, stable fingerprint grouping, confirmation threshold, request bounds, and route/gas parsing. Existing scanner tests, Clippy, formatting, frontend type checking, and production build must pass. Live verification must inspect a returned research artifact and browser text, not only HTTP status.

## Live verification snapshot

One 2026-09-11 mainnet sweep evaluated 232 routes with zero provider failures and promoted three repeated fingerprints:

- SUI/USDT at 10 SUI: 2/3 confirmations, +0.005027072 SUI worst net, 266 ms maximum quote skew.
- SUI/CETUS at 5 SUI: 2/3 confirmations, +0.000510268 SUI worst net, 274 ms maximum quote skew.
- SUI/CETUS at 0.1 SUI: 3/3 confirmations, +0.000039977 SUI worst net, 268 ms maximum quote skew.

Later sweeps found zero confirmed opportunities. This disappearance is expected market behavior and validates keeping losing routes separate, requiring repeated fingerprints, and refusing to present old quote signals as current profit.

## Sources

- [Cetus Aggregator V3 reference](https://github.com/CetusProtocol/cetus-skills/blob/main/skills/cetus-aggregator/reference.md)
- [7K Aggregator overview](https://docs.7k.ag/7k-aggregator/overview)
- [Sui transaction simulation](https://sdk.mystenlabs.com/sui/clients/executing)
