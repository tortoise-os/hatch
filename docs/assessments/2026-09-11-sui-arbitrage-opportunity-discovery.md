# Sui Arbitrage Opportunity Discovery Assessment

Date: 2026-09-11  
Product: TortoiseOS Hatch  
Audience: operator

## Conclusion

Hatch can discover where Sui arbitrage deserves attention, but current repeated aggregator quotes do not prove executable profit. Product should become an opportunity cartographer: broad discovery, venue attribution, repeated isolated quotes, unsigned atomic PTB simulation, then historical survival analysis.

Real opportunity means same route remains net-positive after venue fees, flash-loan fee, measured gas, slippage buffer, and failure allowance; uses disjoint liquidity; succeeds in full atomic simulation; and survives at least one immediate re-simulation. Only submitted transaction can prove realized profit.

## Current scanner truth

Current scanner:

- scans SUI round trips through Cetus and 7K quote surfaces;
- tests fixed sizes across USDC, USDT, CETUS, DEEP, and WAL;
- rejects missing route evidence, shared pool IDs, stale quote pairs, losses after gas reserve, and results below configured basis-point threshold;
- repeats positive route fingerprints and labels stable results `quote_confirmed`;
- holds latest scan history in memory;
- cannot construct, simulate, sign, or submit a transaction.

Observed positive quotes have been transient. Later runs returning zero signals show why persistence and survival measurement matter. Current UI should be read as lead generation, not profit feed.

## Likely opportunity surfaces

Treat each as hypothesis until data confirms it:

1. AMM-to-AMM divergence after large swaps.
2. CLMM-to-DeepBook divergence between pool price and order book.
3. Stablecoin deviations during volatility or liquidity migration.
4. Long-tail tokens fragmented across shallow pools.
5. New listings and incentive launches with uneven price discovery.
6. Triangular cycles where no direct two-leg route shows edge.

Liquid markets offer larger executable size and faster competition. Long-tail markets offer larger quoted spreads but higher slippage, route failure, and manipulation risk.

## Discovery method

### 1. Map market universe

Ingest active pools and markets from venue-native catalogs. Track coin type, decimals, venue, pool ID, fee tier, liquidity/depth proxy, and last activity. Use curated allowlist until trustworthy catalog adapters exist.

### 2. Broad quote discovery

Sweep logarithmic SUI sizes across market registry using aggregators. Treat best-route output as upper-bound lead. Capture quote time, latency, route branches, venues, pools, output, gas hint, and rejection reason.

### 3. Venue isolation

Requote promising market/size pairs with one allowed venue per adapter. Compare explicit forward venue against explicit reverse venue. Reject reused pools and composite routes whose liquidity cannot be attributed.

### 4. Size optimization

Run coarse logarithmic sweep, then local search around positive sizes. Find maximum conservative profit and maximum executable size before price impact removes edge.

### 5. Atomic dry run

Build unsigned PTB containing full borrow/swap/swap/repay path and simulate through Sui. Read balance changes, gas, command results, and failure status. No wallet secret or transaction submission required.

### 6. Persistence test

Re-simulate immediately and after next checkpoint. Measure signal half-life, survival rate, and latency budget. Discard opportunities expiring before detection-plus-build-plus-simulation latency.

## Ranking

```text
conservative_net =
  worst_simulated_output
  - principal
  - venue_fees
  - flash_loan_fee
  - measured_gas
  - priority_cost
  - slippage_buffer
  - expected_failure_cost
```

Rank market × venue-pair × size cells using:

- confirmed simulation count;
- positive observation rate;
- p10 and median conservative net;
- maximum executable size;
- median signal half-life;
- simulation failure rate;
- quote and build latency;
- rejection-reason distribution.

## Recommended delivery

Phase 1: persistent opportunity cartographer.

- broad discovery;
- venue-isolated quote confirmation;
- append-only local journal;
- market/venue/size heatmap;
- explicit `simulation_pending` state.

Phase 2: read-only execution proof.

- venue transaction builders;
- unsigned PTB assembly;
- Sui simulation and balance-change verification;
- immediate re-simulation;
- `simulation_confirmed` promotion.

Phase 3 remains separate: flash-loan executor, wallet custody, signing, submission, priority strategy, and capital controls.

## Decision

Build Phase 1 now. Design Phase 2 behind strict read-only boundary. Never display `real`, `executable`, or guaranteed profit before successful repeated atomic simulation.
