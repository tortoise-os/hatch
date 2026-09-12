import { describe, expect, test } from "bun:test";
import type { CartographyCell, CartographyReport } from "./api";
import { cartographyStatus, preserveCartography, rankCartographyCells, rankRejections, visibleCartographyCells } from "./cartography";

function cell(overrides: Partial<CartographyCell> = {}): CartographyCell {
  return {
    base_coin: "base",
    base_symbol: "BASE",
    base_decimals: 9,
    quote_coin: "coin",
    quote_symbol: "QUOTE",
    quote_decimals: 6,
    market_symbol: "TEST",
    evidence_tier: "aggregator_discovery",
    forward_venues: "a",
    reverse_venues: "b",
    observed_round_trips: 1,
    positive_quotes: 0,
    positive_rate_bps: 0,
    confirmed_signals: 0,
    confirmation_hits: 0,
    confirmation_samples: 0,
    best_net_profit: "-1",
    worst_net_profit: "-1",
    best_amount_in: "100",
    last_observed_at_ms: 1,
    simulation_status: "pending",
    simulation_attempts: 0,
    positive_simulations: 0,
    simulation_survival_rate_bps: 0,
    median_observed_half_life_ms: null,
    best_simulated_delta: "0",
    measured_gas_cost: "0",
    ...overrides,
  };
}

describe("cartography presentation", () => {
  test("empty state remains empty", () => {
    expect(rankCartographyCells([])).toEqual([]);
  });

  test("simulation-confirmed evidence sorts before isolated and discovery", () => {
    const ranked = rankCartographyCells([
      cell({ market_symbol: "DISCOVERY" }),
      cell({ market_symbol: "ISOLATED", evidence_tier: "venue_isolated" }),
      cell({ market_symbol: "SIM", simulation_status: "simulation_confirmed" }),
    ]);
    expect(ranked.map((item) => item.market_symbol)).toEqual(["SIM", "ISOLATED", "DISCOVERY"]);
    expect(cartographyStatus(ranked[0])).toBe("Atomic simulation confirmed");
    expect(cartographyStatus(ranked[1])).toBe("Isolated · unconfirmed · simulation pending");
  });

  test("every simulation state has an explicit operator label", () => {
    expect(cartographyStatus(cell({ simulation_status: "simulation_failed" }))).toBe("Atomic simulation failed");
    expect(cartographyStatus(cell({ simulation_status: "simulation_non_positive" }))).toBe("Atomic simulation non-positive");
    expect(cartographyStatus(cell({ simulation_status: "fingerprint_mismatch" }))).toBe("Simulation fingerprint mismatch");
    expect(cartographyStatus(cell({ simulation_status: "unsupported_base" }))).toBe("Quote confirmed · simulator unsupported for base");
    expect(cartographyStatus(cell({ confirmed_signals: 1 }))).toBe("Quote confirmed only · simulation pending");
    expect(cartographyStatus(cell())).toBe("Discovery lead only · simulation pending");
  });

  test("rejection histogram ranks common causes first", () => {
    expect(rankRejections({ rare: 1, common: 9 })).toEqual([["common", 9], ["rare", 1]]);
  });

  test("market map paging keeps remaining evidence reachable", () => {
    const cells = Array.from({ length: 60 }, (_, index) => cell({ market_symbol: String(index) }));
    expect(visibleCartographyCells(cells, 48)).toHaveLength(48);
    expect(visibleCartographyCells(cells, 96)).toHaveLength(60);
  });

  test("API failure preserves prior evidence", () => {
    const previous = { schema_version: 2 } as CartographyReport;
    const rejected: PromiseRejectedResult = { status: "rejected", reason: new Error("offline") };
    expect(preserveCartography(previous, rejected)).toBe(previous);
  });
});
