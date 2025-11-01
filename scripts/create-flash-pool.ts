#!/usr/bin/env bun

/**
 * Create a new flash loan pool
 *
 * Usage:
 *   bun run scripts/create-flash-pool.ts <coin-type> <initial-amount>
 *
 * Example:
 *   bun run scripts/create-flash-pool.ts 0x2::sui::SUI 1000000000
 */

import { SuiClient, getFullnodeUrl } from '@mysten/sui.js/client';
import { Ed25519Keypair } from '@mysten/sui.js/keypairs/ed25519';
import { Transaction } from '@mysten/sui.js/transactions';
import { readFileSync } from 'fs';
import { join } from 'path';

const NETWORK = (process.env.NETWORK || 'testnet') as 'testnet' | 'mainnet';
const COIN_TYPE = process.argv[2] || '0x2::sui::SUI';
const INITIAL_AMOUNT = process.argv[3] || '1000000000'; // 1 SUI

async function main() {
  console.log('🏊 Creating Flash Loan Pool');
  console.log('═══════════════════════════════════════');
  console.log(`Network: ${NETWORK}`);
  console.log(`Coin Type: ${COIN_TYPE}`);
  console.log(`Initial Amount: ${INITIAL_AMOUNT}`);
  console.log();

  try {
    // 1. Initialize client
    const client = new SuiClient({ url: getFullnodeUrl(NETWORK) });

    // 2. Load deployment info
    const deploymentPath = join(
      process.cwd(),
      `deployments/${NETWORK}.json`
    );

    const deployment = JSON.parse(readFileSync(deploymentPath, 'utf-8'));
    const packageId = deployment.packageId;

    console.log(`📦 Using package: ${packageId}`);

    // 3. Get keypair from environment
    const privateKey = process.env.SUI_PRIVATE_KEY;
    if (!privateKey) {
      throw new Error('SUI_PRIVATE_KEY not set in environment');
    }

    const keypair = Ed25519Keypair.fromSecretKey(
      Buffer.from(privateKey, 'hex')
    );
    const sender = keypair.getPublicKey().toSuiAddress();

    console.log(`👛 Sender: ${sender}`);

    // 4. Get coins for initial liquidity
    const coins = await client.getCoins({
      owner: sender,
      coinType: COIN_TYPE,
    });

    if (coins.data.length === 0) {
      throw new Error(`No ${COIN_TYPE} coins found in wallet`);
    }

    console.log(`💰 Found ${coins.data.length} coin(s)`);

    // 5. Build transaction
    const tx = new Transaction();

    // Split coin for initial liquidity
    const [liquidityCoin] = tx.splitCoins(tx.gas, [
      tx.pure.u64(INITIAL_AMOUNT),
    ]);

    // Create and share pool
    tx.moveCall({
      target: `${packageId}::flash_pool::create_and_share_pool`,
      arguments: [liquidityCoin],
      typeArguments: [COIN_TYPE],
    });

    tx.setGasBudget(10000000);

    // 6. Execute transaction
    console.log('\n📡 Submitting transaction...');

    const result = await client.signAndExecuteTransaction({
      signer: keypair,
      transaction: tx,
      options: {
        showEffects: true,
        showObjectChanges: true,
      },
    });

    if (result.effects?.status?.status !== 'success') {
      throw new Error('Transaction failed');
    }

    // 7. Extract pool ID
    const createdPool = result.objectChanges?.find(
      (obj) => obj.type === 'created' && obj.objectType.includes('FlashPool')
    );

    if (!createdPool || createdPool.type !== 'created') {
      throw new Error('Could not find created pool');
    }

    const poolId = createdPool.objectId;

    console.log('\n✅ Flash pool created successfully!');
    console.log('═══════════════════════════════════════');
    console.log(`🏊 Pool ID: ${poolId}`);
    console.log(`📊 Initial Liquidity: ${INITIAL_AMOUNT}`);
    console.log(`💱 Coin Type: ${COIN_TYPE}`);
    console.log(`🔗 Transaction: ${result.digest}`);

    // 8. Save pool info
    const poolInfo = {
      poolId,
      coinType: COIN_TYPE,
      initialLiquidity: INITIAL_AMOUNT,
      createdAt: new Date().toISOString(),
      transactionDigest: result.digest,
    };

    const poolsPath = join(
      process.cwd(),
      `deployments/${NETWORK}-pools.json`
    );

    let pools: any = {};
    try {
      pools = JSON.parse(readFileSync(poolsPath, 'utf-8'));
    } catch {
      // File doesn't exist, start fresh
    }

    pools[COIN_TYPE] = poolInfo;

    const { writeFileSync } = await import('fs');
    writeFileSync(poolsPath, JSON.stringify(pools, null, 2));

    console.log(`\n💾 Pool info saved to: ${poolsPath}`);

    // 9. Print next steps
    console.log('\n🎯 Next steps:');
    console.log(`1. Add more liquidity: bun run scripts/add-liquidity.ts ${poolId} <amount>`);
    console.log(`2. Test flash borrow: bun run scripts/test-flash-borrow.ts ${poolId}`);
    console.log(`3. View pool info: sui client object ${poolId}`);

  } catch (error) {
    console.error('\n❌ Error:', error);
    process.exit(1);
  }
}

main();
