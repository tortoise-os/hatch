import {
  AggregatorClient,
  type FindRouterParams,
  type RouterDataV3,
} from "@cetusprotocol/aggregator-sdk";
import { SuiGrpcClient } from "@mysten/sui/grpc";
import {
  Transaction,
  type TransactionObjectArgument,
} from "@mysten/sui/transactions";

const SUI = "0x2::sui::SUI";
const DEFAULT_CETUS_PACKAGE =
  "0x1eabed72c53feb3805120a081dc15963c204dc8d091542592abaf7a35689b2fb";
const DEFAULT_CETUS_CONFIG =
  "0xdaa46292632c3c4d8f31f23ea0f9b36a28ff3677e9684980e4438403a67a3d8f";

export type AtomicSimulationInput = {
  sender: string;
  amount_in: string;
  quote_coin: string;
  route_fingerprint: string;
  forward_provider: string;
  reverse_provider: string;
  forward_pool_ids: string[];
  reverse_pool_ids: string[];
  flash_pool_id: string;
  flash_pool_coin_a: string;
  flash_pool_coin_b: string;
  flash_pool_fee_rate_ppm: number;
  slippage_bps: number;
  cetus_package?: string;
  cetus_global_config?: string;
  sui_grpc_url?: string;
  aggregator_endpoint?: string;
};

export type AtomicSimulationOutput = {
  status: "positive" | "non_positive" | "failed";
  route_fingerprint: string;
  rebuilt_route_fingerprint: string | null;
  observed_at_ms: number;
  measured_gas_cost: string;
  balance_delta: string;
  command_results: number;
  effects_requested: true;
  balance_changes_requested: true;
  command_results_requested: true;
  command_trace: string[];
  error: string | null;
};

type RouteBuilder = {
  findRouters(params: FindRouterParams): Promise<RouterDataV3 | null>;
  routerSwap(params: {
    router: RouterDataV3;
    inputCoin: TransactionObjectArgument;
    slippage: number;
    txb: Transaction;
  }): Promise<TransactionObjectArgument>;
};

export type BuiltAtomicPtb = {
  transaction: Transaction;
  commandTrace: string[];
  rebuiltRouteFingerprint: string;
};

type SimulationTransaction = {
  status: { success: boolean; error: unknown };
  effects?: {
    gasUsed: {
      computationCost: string;
      storageCost: string;
      storageRebate: string;
    };
  };
  balanceChanges?: Array<{ coinType: string; address: string; amount: string }>;
};

export type SimulationResponse = {
  $kind: "Transaction" | "FailedTransaction";
  Transaction?: SimulationTransaction;
  FailedTransaction?: SimulationTransaction;
  commandResults?: unknown[];
};

const PROVIDERS: Record<string, string> = {
  cetus: "CETUS",
  turbos: "TURBOS",
  aftermath: "AFTERMATH",
  deepbook_v3: "DEEPBOOKV3",
  flowx_v3: "FLOWXV3",
  bluefin: "BLUEFIN",
};

function isolatedVenue(provider: string): string {
  const venue = provider.includes(":") ? provider.split(":").at(-1)! : provider;
  const mapped = PROVIDERS[venue.toLowerCase()];
  if (!mapped) throw new Error(`missing transaction builder for provider ${provider}`);
  return mapped;
}

function samePools(actual: string[], expected: string[]): boolean {
  return actual.length === expected.length && actual.every((pool, index) => pool === expected[index]);
}

function validateInput(input: AtomicSimulationInput): void {
  if (!input.sender.trim()) throw new Error("simulation sender is required");
  if (!input.flash_pool_id.trim()) throw new Error("flash pool is required");
  if (input.forward_pool_ids.length === 0 || input.reverse_pool_ids.length === 0) {
    throw new Error("route pool evidence is required");
  }
  const routePools = [...input.forward_pool_ids, ...input.reverse_pool_ids];
  if (new Set(routePools).size !== routePools.length) {
    throw new Error("shared-pool route rejected before simulation");
  }
  if (routePools.includes(input.flash_pool_id)) {
    throw new Error("flash-loan pool overlaps swap route");
  }
  if (input.flash_pool_coin_a !== SUI && input.flash_pool_coin_b !== SUI) {
    throw new Error("flash pool must contain SUI");
  }
  if (input.flash_pool_coin_a === SUI && input.flash_pool_coin_b === SUI) {
    throw new Error("flash pool coin types must be distinct");
  }
  if (!Number.isInteger(input.flash_pool_fee_rate_ppm) || input.flash_pool_fee_rate_ppm < 0 || input.flash_pool_fee_rate_ppm > 1_000_000) {
    throw new Error("flash pool fee rate must be integer ppm");
  }
  if (!Number.isInteger(input.slippage_bps) || input.slippage_bps < 0 || input.slippage_bps > 10_000) {
    throw new Error("slippage must be integer bps");
  }
  const amount = BigInt(input.amount_in);
  if (amount <= 0n || amount > 18_446_744_073_709_551_615n) {
    throw new Error("amount_in must fit positive u64");
  }
}

export function routeFingerprint(
  forwardProvider: string,
  reverseProvider: string,
  forwardPools: string[],
  reversePools: string[],
): string {
  let value = `${forwardProvider}>${reverseProvider}`;
  for (const pool of forwardPools) value += `|${pool}`;
  value += "||";
  for (const pool of reversePools) value += `|${pool}`;
  let hash = 0xcbf29ce484222325n;
  for (const byte of new TextEncoder().encode(value)) {
    hash = ((hash ^ BigInt(byte)) * 0x100000001b3n) & 0xffffffffffffffffn;
  }
  return hash.toString(16).padStart(16, "0");
}

function repaymentAmount(amount: bigint, feeRatePpm: number): bigint {
  const fee = (amount * BigInt(feeRatePpm) + 999_999n) / 1_000_000n;
  return amount + fee;
}

async function requireRoute(
  builder: RouteBuilder,
  params: FindRouterParams,
  expectedPools: string[],
): Promise<RouterDataV3> {
  const route = await builder.findRouters(params);
  if (!route || route.insufficientLiquidity || route.error) {
    throw new Error("isolated route rebuild returned no usable route");
  }
  const actualPools = route.paths.map((path) => path.id);
  if (!samePools(actualPools, expectedPools)) {
    throw new Error(`route fingerprint mismatch: expected ${expectedPools.join(",")}, received ${actualPools.join(",")}`);
  }
  return route;
}

export async function buildAtomicPtb(
  input: AtomicSimulationInput,
  builder: RouteBuilder,
): Promise<BuiltAtomicPtb> {
  validateInput(input);
  const amount = BigInt(input.amount_in);
  const forward = await requireRoute(
    builder,
    {
      from: SUI,
      target: input.quote_coin,
      amount,
      byAmountIn: true,
      providers: [isolatedVenue(input.forward_provider)],
    },
    input.forward_pool_ids,
  );
  const reverse = await requireRoute(
    builder,
    {
      from: input.quote_coin,
      target: SUI,
      amount: forward.amountOut,
      byAmountIn: true,
      providers: [isolatedVenue(input.reverse_provider)],
    },
    input.reverse_pool_ids,
  );
  const rebuiltRouteFingerprint = routeFingerprint(
    input.forward_provider,
    input.reverse_provider,
    forward.paths.map((path) => path.id),
    reverse.paths.map((path) => path.id),
  );
  if (rebuiltRouteFingerprint !== input.route_fingerprint) {
    throw new Error("route fingerprint mismatch after isolated rebuild");
  }

  const tx = new Transaction();
  tx.setSender(input.sender);
  const packageId = input.cetus_package ?? DEFAULT_CETUS_PACKAGE;
  const globalConfig = input.cetus_global_config ?? DEFAULT_CETUS_CONFIG;
  const loanA = input.flash_pool_coin_a === SUI;
  const [balanceA, balanceB, receipt] = tx.moveCall({
    target: `${packageId}::pool::flash_loan`,
    typeArguments: [input.flash_pool_coin_a, input.flash_pool_coin_b],
    arguments: [
      tx.object(globalConfig),
      tx.object(input.flash_pool_id),
      tx.pure.bool(loanA),
      tx.pure.u64(amount),
    ],
  });
  const borrowedBalance = loanA ? balanceA : balanceB;
  const borrowedCoin = tx.moveCall({
    target: "0x2::coin::from_balance",
    typeArguments: [SUI],
    arguments: [borrowedBalance],
  });
  const quoteCoin = await builder.routerSwap({
    router: forward,
    inputCoin: borrowedCoin,
    slippage: input.slippage_bps / 10_000,
    txb: tx,
  });
  const returnedSui = await builder.routerSwap({
    router: reverse,
    inputCoin: quoteCoin,
    slippage: input.slippage_bps / 10_000,
    txb: tx,
  });
  const finalBalance = tx.moveCall({
    target: "0x2::coin::into_balance",
    typeArguments: [SUI],
    arguments: [returnedSui],
  });
  const repayment = tx.moveCall({
    target: "0x2::balance::split",
    typeArguments: [SUI],
    arguments: [
      finalBalance,
      tx.pure.u64(repaymentAmount(amount, input.flash_pool_fee_rate_ppm)),
    ],
  });
  tx.moveCall({
    target: `${packageId}::pool::repay_flash_loan`,
    typeArguments: [input.flash_pool_coin_a, input.flash_pool_coin_b],
    arguments: [
      tx.object(globalConfig),
      tx.object(input.flash_pool_id),
      loanA ? repayment : balanceA,
      loanA ? balanceB : repayment,
      receipt,
    ],
  });
  tx.moveCall({
    target: "0x2::balance::value",
    typeArguments: [SUI],
    arguments: [finalBalance],
  });
  const profitCoin = tx.moveCall({
    target: "0x2::coin::from_balance",
    typeArguments: [SUI],
    arguments: [finalBalance],
  });
  tx.transferObjects([profitCoin], input.sender);

  return {
    transaction: tx,
    rebuiltRouteFingerprint,
    commandTrace: ["borrow", "forward_swap", "reverse_swap", "repay", "inspect_profit"],
  };
}

export async function simulateAtomicRoute(input: AtomicSimulationInput): Promise<AtomicSimulationOutput> {
  const observedAt = Date.now();
  const baseUrl = input.sui_grpc_url ?? "https://fullnode.mainnet.sui.io:443";
  const client = new SuiGrpcClient({ network: "mainnet", baseUrl });
  const aggregator = new AggregatorClient({
    client,
    endpoint: input.aggregator_endpoint,
  });
  try {
    const built = await buildAtomicPtb(input, aggregator);
    const result = await client.simulateTransaction({
      transaction: built.transaction,
      include: { effects: true, balanceChanges: true, commandResults: true },
      doGasSelection: true,
    });
    return interpretSimulation(input, built, result, observedAt);
  } catch (error) {
    return {
      status: "failed",
      route_fingerprint: input.route_fingerprint,
      rebuilt_route_fingerprint: null,
      observed_at_ms: observedAt,
      measured_gas_cost: "0",
      balance_delta: "0",
      command_results: 0,
      effects_requested: true,
      balance_changes_requested: true,
      command_results_requested: true,
      command_trace: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export function interpretSimulation(
  input: AtomicSimulationInput,
  built: Pick<BuiltAtomicPtb, "commandTrace" | "rebuiltRouteFingerprint">,
  result: SimulationResponse,
  observedAt: number,
): AtomicSimulationOutput {
  const simulated = result.$kind === "Transaction" ? result.Transaction : result.FailedTransaction;
  if (!simulated) throw new Error("simulation result variant is missing payload");
  const gas = simulated.effects?.gasUsed;
  const rawMeasuredGas = gas
    ? BigInt(gas.computationCost) + BigInt(gas.storageCost) - BigInt(gas.storageRebate)
    : 0n;
  const measuredGas = rawMeasuredGas > 0n ? rawMeasuredGas : 0n;
  const balanceDelta = (simulated.balanceChanges ?? [])
    .filter((change) => change.coinType === SUI && change.address === input.sender)
    .reduce((sum, change) => sum + BigInt(change.amount), 0n);
  const success = result.$kind === "Transaction" && simulated.status.success;
  return {
    status: success ? (balanceDelta > 0n ? "positive" : "non_positive") : "failed",
    route_fingerprint: input.route_fingerprint,
    rebuilt_route_fingerprint: built.rebuiltRouteFingerprint,
    observed_at_ms: observedAt,
    measured_gas_cost: measuredGas.toString(),
    balance_delta: balanceDelta.toString(),
    command_results: result.commandResults?.length ?? 0,
    effects_requested: true,
    balance_changes_requested: true,
    command_results_requested: true,
    command_trace: built.commandTrace,
    error: simulated.status.success ? null : JSON.stringify(simulated.status.error),
  };
}
