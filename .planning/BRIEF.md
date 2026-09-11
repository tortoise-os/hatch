# Hatch Sui Scanner Brief

Build read-only Sui arbitrage intelligence before any executor. Produce live, auditable SUI/USDC round-trip candidate records from two independent quote services. Protect user funds by excluding keys, signing, PTBs, and submission from scanner process.

First release targets one-shot Rust CLI operation, exact integer arithmetic, bounded network behavior, JSONL output, and deterministic tests. Later releases may add direct on-chain pool and order-book state, persistence, alerts, simulation, then separately reviewed execution.
