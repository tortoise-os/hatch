import type { CartographyCell, CartographyReport } from "./api";

export function rankCartographyCells(cells: CartographyCell[]): CartographyCell[] {
  return [...cells].sort((left, right) => {
    const simulation = Number(right.simulation_status === "simulation_confirmed") - Number(left.simulation_status === "simulation_confirmed");
    if (simulation) return simulation;
    const isolated = Number(right.evidence_tier === "venue_isolated") - Number(left.evidence_tier === "venue_isolated");
    if (isolated) return isolated;
    if (right.confirmed_signals !== left.confirmed_signals) return right.confirmed_signals - left.confirmed_signals;
    if (right.positive_rate_bps !== left.positive_rate_bps) return right.positive_rate_bps - left.positive_rate_bps;
    const rightNet = BigInt(right.best_net_profit);
    const leftNet = BigInt(left.best_net_profit);
    return rightNet > leftNet ? 1 : rightNet < leftNet ? -1 : 0;
  });
}

export function cartographyStatus(cell: CartographyCell): string {
  if (cell.simulation_status === "simulation_confirmed") return "Atomic simulation confirmed";
  if (cell.confirmed_signals > 0) return "Quote confirmed only";
  if (cell.evidence_tier === "venue_isolated") return "Isolated · unconfirmed";
  return "Discovery lead only";
}

export function rankRejections(rejections: Record<string, number>): Array<[string, number]> {
  return Object.entries(rejections).sort((left, right) => right[1] - left[1]);
}

export function preserveCartography(
  previous: CartographyReport | null,
  result: PromiseSettledResult<CartographyReport>,
): CartographyReport | null {
  return result.status === "fulfilled" ? result.value : previous;
}
