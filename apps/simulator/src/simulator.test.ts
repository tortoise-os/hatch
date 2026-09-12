import { describe, expect, test } from "bun:test";
import type { FindRouterParams, RouterDataV3 } from "@cetusprotocol/aggregator-sdk";
import { Transaction, type TransactionObjectArgument } from "@mysten/sui/transactions";
import successFixture from "../tests/fixtures/sui-simulation-success.json";
import failureFixture from "../tests/fixtures/sui-simulation-failure.json";
import { buildAtomicPtb, interpretSimulation, routeFingerprint, type AtomicSimulationInput, type SimulationResponse } from "./simulator";

const forwardPools = ["forward-pool"];
const reversePools = ["reverse-pool"];

function route(params: FindRouterParams): RouterDataV3 {
  const forward = params.from === "0x2::sui::SUI";
  return {
    amountIn: {} as RouterDataV3["amountIn"],
    amountOut: { toString: () => (forward ? "1020" : "1010") } as RouterDataV3["amountOut"],
    byAmountIn: true,
    paths: [{
      id: forward ? forwardPools[0] : reversePools[0],
      direction: true,
      provider: params.providers![0],
      from: params.from,
      target: params.target,
      feeRate: 100,
      amountIn: "1000",
      amountOut: forward ? "1020" : "1010",
    }],
    insufficientLiquidity: false,
    deviationRatio: 0,
    packages: new Map([["aggregator_v3", "0x1"]]),
  };
}

const builder = {
  async findRouters(params: FindRouterParams) { return route(params); },
  async routerSwap({ inputCoin }: { inputCoin: TransactionObjectArgument; txb: Transaction }) {
    return inputCoin;
  },
};

function input(overrides: Partial<AtomicSimulationInput> = {}): AtomicSimulationInput {
  const forwardProvider = "seven_k:cetus";
  const reverseProvider = "seven_k:turbos";
  return {
    sender: `0x${"1".repeat(64)}`,
    amount_in: "1000",
    quote_coin: `0x${"2".repeat(64)}::coin::COIN`,
    forward_provider: forwardProvider,
    reverse_provider: reverseProvider,
    forward_pool_ids: forwardPools,
    reverse_pool_ids: reversePools,
    route_fingerprint: routeFingerprint(forwardProvider, reverseProvider, forwardPools, reversePools),
    flash_pool_id: `0x${"3".repeat(64)}`,
    flash_pool_coin_a: "0x2::sui::SUI",
    flash_pool_coin_b: `0x${"4".repeat(64)}::coin::LOAN_PAIR`,
    flash_pool_fee_rate_ppm: 100,
    slippage_bps: 30,
    ...overrides,
  };
}

describe("unsigned atomic PTB", () => {
  test("composes borrow, both swaps, repay, and profit inspection", async () => {
    const built = await buildAtomicPtb(input(), builder);
    expect(built.commandTrace).toEqual(["borrow", "forward_swap", "reverse_swap", "repay", "inspect_profit"]);
    const data = built.transaction.getData() as { commands: unknown[] };
    expect(data.commands.length).toBeGreaterThanOrEqual(8);
  });

  test("fails closed for shared pools", async () => {
    await expect(buildAtomicPtb(input({ reverse_pool_ids: forwardPools }), builder)).rejects.toThrow("shared-pool");
  });

  test("fails closed for missing venue builder", async () => {
    await expect(buildAtomicPtb(input({ forward_provider: "seven_k:unknown" }), builder)).rejects.toThrow("missing transaction builder");
  });

  test("fails closed when rebuilt route fingerprint changes", async () => {
    await expect(buildAtomicPtb(input({ forward_pool_ids: ["changed"] }), builder)).rejects.toThrow("route fingerprint mismatch");
  });

  test("maps successful Sui fixture to measured gas and positive delta", () => {
    const request = input();
    const output = interpretSimulation(
      request,
      { commandTrace: ["borrow", "forward_swap", "reverse_swap", "repay", "inspect_profit"], rebuiltRouteFingerprint: request.route_fingerprint },
      successFixture as SimulationResponse,
      20,
    );
    expect(output.status).toBe("positive");
    expect(output.measured_gas_cost).toBe("13");
    expect(output.balance_delta).toBe("7");
    expect(output.command_results).toBe(5);
  });

  test("maps failed Sui fixture without promoting", () => {
    const request = input();
    const output = interpretSimulation(
      request,
      { commandTrace: [], rebuiltRouteFingerprint: request.route_fingerprint },
      failureFixture as SimulationResponse,
      21,
    );
    expect(output.status).toBe("failed");
    expect(output.error).toContain("MoveAbort");
  });
});
