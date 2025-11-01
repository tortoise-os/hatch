#!/usr/bin/env bun
/**
 * Basic Flash Loan Example
 *
 * This example demonstrates how to:
 * 1. Load deployment configuration
 * 2. Initialize the FlashLoanClient
 * 3. Execute a basic flash loan
 */

import { SuiClient, getFullnodeUrl } from '@mysten/sui.js/client';
import { Ed25519Keypair } from '@mysten/sui.js/keypairs/ed25519';
import { FlashLoanClient, getPackageId, loadEnvConfig } from '../src';

async function main() {
  // Load configuration
  console.log('Loading configuration...');
  const config = loadEnvConfig();
  console.log(`Network: ${config.network}`);
  console.log(`Hatch Package ID: ${config.hatchPackageId}`);
  console.log(`Carapace Package ID: ${config.carapacePackageId}`);

  // Initialize Sui client
  const client = new SuiClient({
    url: getFullnodeUrl(config.network as any)
  });

  // In production, use your actual keypair
  // For this example, we'll show the setup
  const privateKey = process.env.SUI_PRIVATE_KEY;
  if (!privateKey) {
    throw new Error('SUI_PRIVATE_KEY environment variable not set');
  }

  const keypair = Ed25519Keypair.fromSecretKey(
    Buffer.from(privateKey, 'hex')
  );
  const userAddress = keypair.getPublicKey().toSuiAddress();

  console.log(`User address: ${userAddress}`);

  // Initialize flash loan client
  // You need to specify the pool ID - this would come from your deployment
  const poolId = process.env.POOL_ID;
  if (!poolId) {
    throw new Error('POOL_ID environment variable not set');
  }

  const flashLoanClient = new FlashLoanClient(client, {
    packageId: config.hatchPackageId,
    poolId: poolId,
  });

  // Get pool information
  console.log('\nFetching pool information...');
  const poolInfo = await flashLoanClient.getPoolInfo();
  console.log('Pool Info:', {
    liquidity: poolInfo.liquidity.toString(),
    feesCollected: poolInfo.feesCollected.toString(),
    loansIssued: poolInfo.loansIssued.toString(),
    totalVolume: poolInfo.totalVolume.toString(),
  });

  // Calculate fee for borrowing 1000 tokens
  const borrowAmount = 1000n * 1_000_000_000n; // 1000 tokens (9 decimals)
  const fee = flashLoanClient.calculateFlashFee(borrowAmount);
  console.log(`\nFlash loan fee for ${borrowAmount}: ${fee}`);

  // Build flash loan transaction
  console.log('\nBuilding flash loan transaction...');
  const coinType = '0x2::sui::SUI'; // Example: borrowing SUI

  const tx = await flashLoanClient.buildFlashLoanTx(
    borrowAmount,
    coinType,
    (tx, borrowedCoin, receipt) => {
      // Custom logic goes here
      // For this example, we just return the borrowed coin + fee
      console.log('Executing custom logic with borrowed funds...');

      // In a real scenario, you would:
      // 1. Use the borrowed funds for arbitrage, leverage, etc.
      // 2. Make profit
      // 3. Return borrowed amount + fee

      // For now, just return the borrowed coin
      return borrowedCoin;
    }
  );

  console.log('Transaction built successfully!');
  console.log('\nTo execute this transaction:');
  console.log('1. Review the transaction');
  console.log('2. Sign and execute with your keypair');
  console.log('3. Monitor the transaction on chain');

  // In production, you would sign and execute:
  // const result = await client.signAndExecuteTransaction({
  //   signer: keypair,
  //   transaction: tx,
  // });
  // console.log('Transaction result:', result);
}

main().catch(console.error);
