// Copyright (c) TortoiseOS
// SPDX-License-Identifier: MIT

export interface TokenPair {
  tokenA: string;
  tokenB: string;
}

export interface PoolInfo {
  poolId: string;
  reserveA: bigint;
  reserveB: bigint;
  lpSupply: bigint;
}

export interface SwapQuote {
  amountIn: bigint;
  amountOut: bigint;
  priceImpact: number;
  fee: bigint;
}

export interface Position {
  id: string;
  owner: string;
  collateral: bigint;
  debt: bigint;
  leverage: number;
  healthFactor: number;
}
