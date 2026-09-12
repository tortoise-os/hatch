# USD-normalized SUI research sizing

## Goal

Replace default `0.1–25 SUI` research sweep with live USD-normalized notionals. Default run should test roughly `135–33,750 SUI` at current market price, while explicit API amount overrides keep existing behavior.

## Design

- Request fresh `1 SUI -> native USDC` forward quotes from configured Cetus and 7K providers before default research.
- Deduplicate provider observations and use median USDC output as reference price.
- Convert `$100`, `$500`, `$1,000`, `$5,000`, `$10,000`, and `$25,000` targets into MIST with checked integer arithmetic and nearest-unit rounding.
- Reject missing, zero, or implausible calibration instead of silently using stale pricing.
- Persist calibration evidence with research report: reference amount, observed USDC price, contributing providers, and USD targets.
- Keep caller-supplied `amounts` authoritative and mark those runs as explicit sizing by omitting adaptive evidence.

## Boundaries

Read-only quote behavior remains unchanged. No wallet, signing, borrowing, or execution path is added. Existing JSONL records remain readable through optional sizing metadata.

## Verification

- Unit-test USD conversion, rounding, monotonic ladder, and explicit amount parsing.
- Test forward-only provider quote collection independently from round-trip scoring.
- Run Rust format, tests, and clippy; run web typecheck, tests, and production build.
