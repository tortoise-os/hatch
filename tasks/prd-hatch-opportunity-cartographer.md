[PRD]
# PRD: Hatch Opportunity Cartographer

## 1. Overview

Hatch needs to identify Sui market regions where arbitrage evidence persists, not display isolated positive aggregator quotes. Opportunity Cartographer will discover broad candidates, attribute routes to venues and pools, persist observations, visualize market × venue × size performance, and later prove candidate economics using unsigned atomic PTB simulation. Product remains read-only. Flash-loan execution, signing, and submission stay outside scope.

Primary user: TortoiseOS operator deciding which markets and venue integrations deserve engineering and monitoring effort.

## 2. Goals

- Produce persistent evidence across at least six curated Sui quote markets and eight logarithmic SUI sizes.
- Attribute confirmation-stage quotes to one configured venue per provider instance.
- Promote quote candidates only after identical route fingerprint stays positive in at least two of three isolated samples.
- Show historical market and venue-pair hit rates even when no current opportunity exists.
- Add unsigned atomic simulation tier without adding wallet secrets, signing, or submission.
- Prevent UI from calling quote-only evidence executable profit.

## 3. Quality Gates

### Epic-Level (run once on epic completion)

- `cargo fmt --manifest-path apps/scanner/Cargo.toml --check`
- `cargo test --manifest-path apps/scanner/Cargo.toml`
- `cargo clippy --manifest-path apps/scanner/Cargo.toml --all-targets -- -D warnings`
- `bun run --filter @hatch/web typecheck`
- `bun run --filter @hatch/web build`
- Testing trophy complete across required layers.

### Story-Level (checked per story)

- Backend stories: targeted Rust unit test plus endpoint contract check where applicable.
- Persistence stories: restart service and verify prior research remains queryable.
- UI stories: verify desktop and narrow viewport in browser with zero console errors.
- Simulation stories: verify no signing or execute method exists in request path.

## 4. User Stories

### US-001: Curated market registry [Backend]

**Description:** As an operator, I want named, validated market definitions so research covers useful markets without opaque coin IDs.

**Acceptance Criteria:**

- [ ] Test: registry rejects duplicate or empty coin types in `apps/scanner/src/research.rs`.
- [ ] Registry contains symbol, coin type, decimals, and enabled state for each default market.
- [ ] Default research covers at least USDC, USDT, CETUS, DEEP, WAL, and BUCK.
- [ ] API returns markets tested as explicit metadata.
- [ ] Targeted Rust tests pass.

Mark each item [x] as completed. Close only when all items pass.

### US-002: Staged venue-isolated quote research [Backend]

**Description:** As an operator, I want broad discovery followed by isolated venue checks so aggregator artifacts do not become promoted signals.

**Acceptance Criteria:**

- [ ] Test: provider identities remain distinct for `seven_k:cetus`, `seven_k:turbos`, and `seven_k:deepbook_v3`.
- [ ] Broad discovery scans configured market × amount matrix.
- [ ] Only positive discovery market/size pairs advance to isolated stage.
- [ ] Each isolated provider sends exactly one source restriction.
- [ ] Confirmation groups require stable provider direction and ordered pool IDs.
- [ ] Promoted tier equals `venue_isolated_quote_confirmed`.
- [ ] Targeted Rust tests pass.

Mark each item [x] as completed. Close only when all items pass.

### US-003: Persistent research journal [Backend]

**Description:** As an operator, I want research evidence to survive restarts so market patterns can accumulate over time.

**Acceptance Criteria:**

- [ ] Test: append then reload preserves research report atomic values and route evidence.
- [ ] Test: malformed JSONL line is counted and does not prevent valid history loading.
- [ ] Completed research appends one JSON object per line to configurable local path.
- [ ] API startup loads bounded recent research history.
- [ ] Health/config response exposes persistence mode, retained run count, and rejected-line count.
- [ ] Runtime journal data is ignored by git.
- [ ] Restart contract check returns prior report-derived cartography.

Mark each item [x] as completed. Close only when all items pass.

### US-004: Cartography aggregation API [Backend]

**Description:** As an operator, I want evidence grouped by market and venue direction so I can see where edge concentrates.

**Acceptance Criteria:**

- [ ] Test: aggregation groups by quote coin, evidence tier, forward venue path, and reverse venue path.
- [ ] Test: aggregation calculates observed count, positive count, positive-rate bps, best/worst net, best size, and last observation.
- [ ] Test: confirmed opportunity increments confirmation hits and signal count for matching cell.
- [ ] `GET /api/cartography` returns stable typed JSON.
- [ ] Response includes rejection-reason histogram.
- [ ] Every cell returns `simulation_status: pending` until simulation exists.
- [ ] Endpoint contract check returns HTTP 200 with empty valid state before first run.

Mark each item [x] as completed. Close only when all items pass.

### US-005: Operator market map [UI]

**Description:** As an operator, I want persistent heatmap-style results so negative research remains informative and promising surfaces stand out.

**Acceptance Criteria:**

- [ ] Contract type in `apps/web/src/lib/api.ts` matches cartography response.
- [ ] Scanner fetches history and cartography concurrently.
- [ ] Market map shows market, forward/reverse venues, evidence tier, sample count, positive rate, confirmed signals, best net, best size, age, and simulation status.
- [ ] Empty map explains that stored research is required.
- [ ] Rejection histogram shows why routes fail.
- [ ] Existing Opportunities, Evaluated, Routes, Failures, and History views remain usable.
- [ ] Browser verification passes at desktop and mobile widths with zero console errors.

Mark each item [x] as completed. Close only when all items pass.

### US-006: Unsigned atomic PTB simulation [Integration]

**Description:** As an operator, I want complete routes dry-run atomically so quote evidence can advance toward executable proof without transaction submission.

**Acceptance Criteria:**

- [ ] Test: builder composes borrow, forward swap, reverse swap, repay, and profit balance inspection in one PTB.
- [ ] Test: shared-pool and missing-builder routes fail closed before simulation.
- [ ] Simulation requests effects, balance changes, and command results.
- [ ] Gas comes from simulation output, replacing fixed reserve for this tier.
- [ ] Candidate advances only when balance delta is positive after all fees.
- [ ] Code path contains no private key, signer, `signAndExecuteTransaction`, or transaction submission.
- [ ] Integration fixture covers successful and failed simulation responses.

Mark each item [x] as completed. Close only when all items pass.

### US-007: Persistence and half-life confirmation [Integration]

**Description:** As an operator, I want immediate repeated simulation so signals too short-lived for operation are rejected.

**Acceptance Criteria:**

- [ ] Test: route fingerprint mismatch prevents promotion.
- [ ] Test: one failed or non-positive re-simulation prevents `simulation_confirmed` status.
- [ ] Store first-seen, last-positive, confirmation count, and elapsed half-life evidence.
- [ ] Promote only after two positive atomic simulations using same route fingerprint.
- [ ] Cartography exposes simulation survival rate and median observed half-life.
- [ ] Integration tests pass against deterministic simulation fixtures.

Mark each item [x] as completed. Close only when all items pass.

## 5. Testing Trophy

### Unit Tests

- [ ] Market and amount validation.
- [ ] Route fingerprint stability.
- [ ] Shared-liquidity rejection.
- [ ] Cartography grouping and rates.
- [ ] JSONL recovery behavior.
- [ ] Conservative net-profit calculation.

### Contract Tests

- [ ] Cetus response parser fixtures.
- [ ] 7K response parser fixtures and isolated provider identity.
- [ ] `/api/research` staged response shape.
- [ ] `/api/cartography` empty and populated response shapes.
- [ ] Sui simulation response fixtures.

### Integration Tests

- [ ] Research run → journal append → service reload → same cartography.
- [ ] Positive discovery → isolated confirmation → map cell.
- [ ] Quote-confirmed route → PTB build → two simulations → promotion/rejection.

### Frontend Tests

- [ ] Empty cartography state.
- [ ] Populated market map ordering and status labels.
- [ ] Rejection histogram.
- [ ] API failure preserves prior evidence.

### E2E Tests

- [ ] Start scanner and web app, run bounded research, inspect map, restart scanner, verify persistence.
- [ ] Confirm no wallet, signing, submit, or execute control appears.

Deployment classification:

- Block merge: arithmetic, route attribution, persistence, filtering, promotion, and orchestration tests.
- Block release: API contracts, frontend behavior, truth labels, simulation boundary.
- Follow-up allowed: long-duration performance and visual regression baselines.

## 6. Functional Requirements

- FR-1: System must keep broad discovery distinct from venue-isolated confirmation.
- FR-2: System must persist completed research locally using append-only format.
- FR-3: System must recover valid journal entries after malformed lines.
- FR-4: System must group evidence by market, evidence tier, and directional venue path.
- FR-5: System must retain losing and rejected observations.
- FR-6: System must expose exact rejection reasons and provider failures.
- FR-7: System must encode 128-bit atomic amounts as decimal strings across JSON boundary.
- FR-8: System must label quote-only evidence as non-executable.
- FR-9: System must require repeated atomic simulation before `simulation_confirmed`.
- FR-10: System must remain usable with zero opportunities.

## 7. Non-Goals

- Wallet connection or custody.
- Private-key handling.
- Transaction signing or submission.
- Automated flash-loan execution.
- Guaranteed profit claims.
- Cross-chain arbitrage.
- MEV bidding or validator relationships.
- Unbounded token crawling before trusted market-quality filters exist.

## 8. Technical Considerations

- Rust scanner remains authority for quote normalization, checked arithmetic, research orchestration, persistence, and analytics.
- Next.js app consumes typed decimal strings and uses `BigInt` for display calculations.
- Venue isolation through aggregator source filters improves attribution but is not venue-native state reconstruction; UI must state this.
- JSONL favors auditability and low setup cost. SQLite becomes justified when query volume or retention makes full replay expensive.
- Sui simulation should use current supported client API and capture effects, balance changes, and command results.
- Journal retention and compaction need explicit future policy before long-running deployment.

## 9. Success Metrics

- 100% promoted quote signals contain explicit venue direction and pool fingerprint.
- 100% research runs persist across scanner restart.
- Zero quote-only cards use `real`, `executable`, or guaranteed-profit language.
- Cartography returns useful negative evidence when current opportunity count is zero.
- At least 95% of research requests complete without unclassified provider failure under normal upstream availability.
- Simulation phase reports measured gas and exact balance delta for every promoted candidate.

## 10. Open Questions

- Which venue-native SDKs provide stable transaction builders compatible inside one PTB?
- Which pool catalog supplies trustworthy liquidity and activity filters?
- What journal retention window and compaction policy suit continuous operation?
- What minimum conservative-net buffer covers latency and failure risk before executor phase?
- Should checkpoint-based re-simulation replace elapsed-time sampling for every venue?
[/PRD]
