#!/usr/bin/env bun

/**
 * Add liquidity to a flash loan pool
 *
 * Usage:
 *   bun run scripts/add-liquidity.ts <pool-id> <amount>
 *
 * Example:
 *   bun run scripts/add-liquidity.ts 0x123... 500000000
 */

import { SuiClient, getFullnodeUrl } from '@mysten/sui.js/client';
import { Ed25519Keypair } from '@mysten/sui.js/keypairs/ed25519';
import { Transaction } from '@mysten/sui.js/transactions';
import { FlashLoanClient } from '../packages/strategy-sdk/src/flash/flash-client';
import { readFileSync } from 'fs';
import { join } from 'path';

const NETWORK = (process.env.NETWORK || 'testnet') as 'testnet' | 'mainnet';
const POOL_ID = process.argv[2];
const AMOUNT = process.argv[3] || '500000000'; // 0.5 SUI

async function main() {
  console.log('💧 Adding Liquidity to Flash Pool');
  console.log('═══════════════════════════════════════');
  console.log(`Network: ${NETWORK}`);
  console.log(`Pool ID: ${POOL_ID}`);
  console.log(`Amount: ${AMOUNT}`);
  console.log();

  if (!POOL_ID) {
    console.error('❌ Error: Pool ID required');
    console.log('Usage: bun run scripts/add-liquidity.ts <pool-id> <amount>');
    process.exit(1);
  }

  try {
    // Initialize client
    const client = new SuiClient({ url: getFullnodeUrl(NETWORK) });

    // Load deployment
    const deploymentPath = join(process.cwd(), `deployments/${NETWORK}.json`);
    const deployment = JSON.parse(readFileSync(deploymentPath, 'utf-8'));
    const packageId = deployment.packageId;

    // Get keypair
    const privateKey = process.env.SUI_PRIVATE_KEY;
    if (!privateKey) {
      throw new Error('SUI_PRIVATE_KEY not set');
    }

    const keypair = Ed25519Keypair.fromSecretKey(Buffer.from(privateKey, 'hex'));
    const sender = keypair.getPublicKey().toSuiAddress();

    console.log(`📦 Package: ${packageId}`);
    console.log(`👛 Sender: ${sender}`);

    // Initialize client
    const flashClient = new FlashLoanClient(client, {
      packageId,
      poolId: POOL_ID,
    });

    // Get pool info before
    console.log('\n📊 Pool info before:');
    const poolBefore = await flashClient.getPoolInfo();
    console.log(`  Liquidity: ${poolBefore.liquidity}`);

    // Build transaction
    const tx = new Transaction();

    // Split coins for liquidity
    const [liquidityCoin] = tx.splitCoins(tx.gas, [tx.pure.u64(AMOUNT)]);

    // Add liquidity
    tx.moveCall({
      target: `${packageId}::flash_pool::add_liquidity`,
      arguments: [tx.object(POOL_ID), liquidityCoin],
      typeArguments: ['0x2::sui::SUI'],
    });

    tx.setGasBudget(10000000);

    // Execute
    console.log('\n📡 Adding liquidity...');

    const result = await client.signAndExecuteTransaction({
      signer: keypair,
      transaction: tx,
      options: {
        showEffects: true,
      },
    });

    if (result.effects?.status?.status !== 'success') {
      throw new Error('Transaction failed');
    }

    console.log('✅ Liquidity added successfully!');

    // Get pool info after
    console.log('\n📊 Pool info after:');
    const poolAfter = await flashClient.getPoolInfo();
    console.log(`  Liquidity: ${poolAfter.liquidity}`);
    console.log(`  Increase: +${poolAfter.liquidity - poolBefore.liquidity}`);

    console.log('\n═══════════════════════════════════════');
    console.log(`🔗 Transaction: ${result.digest}`);

  } catch (error) {
    console.error('\n❌ Error:', error);
    process.exit(1);
  }
}

main();
