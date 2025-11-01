// Copyright (c) TortoiseOS
// SPDX-License-Identifier: MIT

import { SuiClient } from '@mysten/sui.js/client';
import { Transaction } from '@mysten/sui.js/transactions';
import { normalizeSuiAddress } from '@mysten/sui.js/utils';

export interface FlashLoanConfig {
  packageId: string;
  poolId: string;
}

export interface FlashBorrowParams {
  amount: bigint;
  userAddress: string;
  typeArgs: {
    coinType: string;
  };
}

export interface FlashRepayParams {
  repaymentCoin: string;
  receipt: any;
  userAddress: string;
  typeArgs: {
    coinType: string;
  };
}

export interface FlashLoanInfo {
  poolId: string;
  liquidity: bigint;
  feesCollected: bigint;
  loansIssued: bigint;
  totalVolume: bigint;
}

/**
 * Client for interacting with Hatch flash loan pools
 */
export class FlashLoanClient {
  constructor(
    private client: SuiClient,
    private config: FlashLoanConfig
  ) {}

  /**
   * Build transaction to borrow via flash loan
   */
  async buildFlashBorrowTx(params: FlashBorrowParams): Promise<Transaction> {
    const tx = new Transaction();

    const [borrowedCoin, receipt] = tx.moveCall({
      target: `${this.config.packageId}::flash_pool::flash_borrow`,
      arguments: [
        tx.object(this.config.poolId),
        tx.pure.u64(params.amount),
      ],
      typeArguments: [params.typeArgs.coinType],
    });

    // Return both borrowed coin and receipt for user's logic
    return tx;
  }

  /**
   * Build transaction to repay flash loan
   */
  async buildFlashRepayTx(params: FlashRepayParams): Promise<Transaction> {
    const tx = new Transaction();

    tx.moveCall({
      target: `${this.config.packageId}::flash_pool::flash_repay`,
      arguments: [
        tx.object(this.config.poolId),
        tx.object(params.repaymentCoin),
        params.receipt,
      ],
      typeArguments: [params.typeArgs.coinType],
    });

    return tx;
  }

  /**
   * Build complete flash loan transaction with custom logic
   *
   * @param amount Amount to borrow
   * @param coinType Type of coin to borrow
   * @param customLogic Function that takes borrowed coin and receipt, returns repayment coin
   */
  async buildFlashLoanTx(
    amount: bigint,
    coinType: string,
    customLogic: (tx: Transaction, borrowedCoin: any, receipt: any) => any
  ): Promise<Transaction> {
    const tx = new Transaction();

    // 1. Flash borrow
    const [borrowedCoin, receipt] = tx.moveCall({
      target: `${this.config.packageId}::flash_pool::flash_borrow`,
      arguments: [
        tx.object(this.config.poolId),
        tx.pure.u64(amount),
      ],
      typeArguments: [coinType],
    });

    // 2. Execute custom logic
    const repaymentCoin = customLogic(tx, borrowedCoin, receipt);

    // 3. Repay flash loan
    tx.moveCall({
      target: `${this.config.packageId}::flash_pool::flash_repay`,
      arguments: [
        tx.object(this.config.poolId),
        repaymentCoin,
        receipt,
      ],
      typeArguments: [coinType],
    });

    return tx;
  }

  /**
   * Calculate flash loan fee
   */
  calculateFlashFee(amount: bigint): bigint {
    // 0.05% = 5 basis points = 5 / 10000
    return (amount * 5n) / 10000n;
  }

  /**
   * Get flash pool information
   */
  async getPoolInfo(): Promise<FlashLoanInfo> {
    const poolObject = await this.client.getObject({
      id: this.config.poolId,
      options: {
        showContent: true,
      },
    });

    if (!poolObject.data || poolObject.data.content?.dataType !== 'moveObject') {
      throw new Error('Invalid pool object');
    }

    const fields = poolObject.data.content.fields as any;

    return {
      poolId: this.config.poolId,
      liquidity: BigInt(fields.balance),
      feesCollected: BigInt(fields.fees_collected),
      loansIssued: BigInt(fields.loans_issued),
      totalVolume: BigInt(fields.total_volume),
    };
  }

  /**
   * Create a new flash pool
   */
  async createPool(
    initialLiquidity: string, // Coin object ID
    coinType: string
  ): Promise<Transaction> {
    const tx = new Transaction();

    tx.moveCall({
      target: `${this.config.packageId}::flash_pool::create_and_share_pool`,
      arguments: [tx.object(initialLiquidity)],
      typeArguments: [coinType],
    });

    return tx;
  }

  /**
   * Add liquidity to flash pool
   */
  async addLiquidity(
    liquidityCoin: string, // Coin object ID
    coinType: string
  ): Promise<Transaction> {
    const tx = new Transaction();

    tx.moveCall({
      target: `${this.config.packageId}::flash_pool::add_liquidity`,
      arguments: [
        tx.object(this.config.poolId),
        tx.object(liquidityCoin),
      ],
      typeArguments: [coinType],
    });

    return tx;
  }

  /**
   * Remove liquidity from flash pool
   */
  async removeLiquidity(
    amount: bigint,
    coinType: string
  ): Promise<Transaction> {
    const tx = new Transaction();

    tx.moveCall({
      target: `${this.config.packageId}::flash_pool::remove_liquidity`,
      arguments: [
        tx.object(this.config.poolId),
        tx.pure.u64(amount),
      ],
      typeArguments: [coinType],
    });

    return tx;
  }

  /**
   * Example: Build leveraged farm transaction
   */
  async buildLeveragedFarmTx(
    userDepositCoin: string,
    leverage: number, // 15-50 (1.5x - 5x in deci-units)
    depositCoinType: string,
    registryId: string
  ): Promise<Transaction> {
    const tx = new Transaction();

    tx.moveCall({
      target: `${this.config.packageId}::leveraged_farm::open_and_transfer_position`,
      arguments: [
        tx.object(registryId),
        tx.object(this.config.poolId),
        tx.object(userDepositCoin),
        tx.pure.u8(leverage),
      ],
      typeArguments: [depositCoinType, depositCoinType], // X, Y (same for simplified example)
    });

    return tx;
  }
}
