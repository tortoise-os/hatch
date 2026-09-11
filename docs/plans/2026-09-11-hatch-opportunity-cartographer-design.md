# Hatch Opportunity Cartographer

## Goal

Turn transient aggregator round-trip signals into a persistent map showing which Sui markets, venue pairs, and trade sizes repeatedly produce positive quote evidence. Keep scanner read-only and describe every result as quote evidence until full programmable-transaction-block simulation exists.

## Chosen slice

Use current broad Cetus and 7K quotes for cheap discovery. Only market/size pairs with positive discovery evidence advance to a second stage. That stage requests 7K quotes with one allowed venue per provider instance, producing explicit identities such as `seven_k:cetus` and `seven_k:deepbook_v3`. Run three isolated samples and promote only stable route fingerprints seen positive at least twice.

This staged design avoids a full venue-by-venue matrix for every market and size. It also avoids claiming native venue pricing: isolated quotes still come through 7K routing infrastructure, so validation tier is `venue_isolated_quote_confirmed`, not simulated or executable.

## Persistence and analytics

Append every completed research report to a local JSONL journal under scanner data directory. Load bounded recent history when API starts. A cartography endpoint aggregates stored reports by quote market, forward venue path, and reverse venue path.

Each map cell exposes:

- observed round trips;
- positive quote observations;
- positive-rate basis points;
- confirmed signal count;
- best and worst observed net result;
- best tested input size;
- latest observation time;
- simulation status.

Also aggregate rejection reasons. UI renders durable market map before candidate lists, making empty and negative research useful.

## Safety boundary

No wallet, key, signing, transaction submission, or execution control. No result is called executable. Unsigned PTB construction and Sui `simulateTransaction` remain next phase because current Rust service has quote adapters but no transaction builders.

## Verification

Rust unit/API tests cover venue identity, staged confirmation, journal reload, and cartography aggregation. Frontend typecheck and production build cover API contracts. Final live run verifies persisted research and browser rendering.
