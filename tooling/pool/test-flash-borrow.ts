#!/usr/bin/env bun

/**
 * Test flash loan borrow and repay
 *
 * Usage:
 *   bun run scripts/test-flash-borrow.ts <pool-id> <borrow-amount>
 *
 * Example:
 *   bun run scripts/test-flash-borrow.ts 0x123... 100000000
 */

import { SuiClient, getFullnodeUrl } from '@mysten/sui.js/client';
import { Ed25519Keypair } from '@mysten/sui.js/keypairs/ed25519';
import { Transaction } from '@mysten:function_calls/sui.js/transactions';
import { FlashLoanClient } from '../packages/strategy-sdk/src/flash/flash-client';
import { readFileSync } from 'fs';
import { join } from 'path';

const NETWORK = (process.env.NETWORK || 'testnet') as 'testnet' | 'mainnet';
const POOL_ID = process.argv[2];
const BORROW_AMOUNT = process.argv[3] || '100000000'; // 0.1 SUI

async function main() {
  console.log('🧪 Testing Flash Loan');
  console.log('═══════════════════════════════════════');
  console.log(`Network: ${NETWORK}`);
  console.log(`Pool ID: ${POOL_ID}`);
  console.log(`Borrow Amount: ${BORROW_AMOUNT}`);
  console.log();

  if (!POOL_ID) {
    console.error('❌ Error: Pool ID required');
    console.log('Usage: bun run scripts/test-flash-borrow.ts <pool-id> [amount]');
    process.exit(1);
  }

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

    console.log(`📦 Package: ${packageId}`);

    // 3. Get keypair
    const privateKey = process.env.SUI_PRIVATE_KEY;
    if (!privateKey) {
      throw new Error('SUI_PRIVATE_KEY not set');
    }

    const keypair = Ed25519Keypair.fromSecretKey(
      Buffer.from(privateKey, 'hex')
    );
    const sender = keypair.getPublicKey().toSuiAddress();

    console.log(`👛 Sender: ${sender}`);

    // 4. Initialize FlashLoanClient
    const flashClient = new FlashLoanClient(client, {
      packageId,
      poolId: POOL_ID,
    });

    // 5. Get pool info before
    console.log('\n📊 Pool info before:');
    const poolInfoBefore = await flashClient.getPoolInfo();
    console.log(`  Liquidity: ${poolInfoBefore.liquidity}`);
    console.log(`  Loans Issued: ${poolInfoBefore.loansIssued}`);
    console.log(`  Fees Collected: ${poolInfoBefore.feesCollected}`);

    // 6. Calculate expected fee
    const borrowAmount = BigInt(BORROW_AMOUNT);
    const expectedFee = flashClient.calculateFlashFee(borrowAmount);
    console.log(`\n💰 Expected fee: ${expectedFee} (0.05%)`);

    // 7. Build flash loan transaction
    console.log('\n🔨 Building transaction...');

    const tx = await flashClient.buildFlashLoanTx(
      borrowAmount,
      '0x2::sui::SUI',
      (tx, borrowedCoin, receipt) => {
        // Custom logic: Just mint the fee and add it to repayment
        // In a real scenario, you'd use the borrowed funds for arbitrage, etc.

        console.log('  📥 Borrowed coins');
        console.log('  🔄 Simulating use of funds...');

        // Split gas to get fee amount
        const [feeCoin] = tx.splitCoins(tx.gas, [tx.pure.u64(expectedFee)]);

        // Merge borrowed + fee for repayment
        tx.mergeCoins(borrowedCoin, [feeCoin]);

        console.log('  💵 Prepared repayment');

        return borrowedCoin;
      }
    );

    tx.setGasBudget(10000000);

    // 8. Execute transaction
    console.log('\n📡 Executing flash loan...');

    const result = await client.signAndExecuteTransaction({
      signer: keypair,
      transaction: tx,
      options: {
        showEffects: true,
        showEvents: true,
      },
    });

    if (result.effects?.status?.status !== 'success') {
      throw new Error('Transaction failed');
    }

    console.log('✅ Flash loan executed successfully!');

    // 9. Show events
    if (result.events && result.events.length > 0) {
      console.log('\n📢 Events:');
      result.events.forEach((event, i) => {
        console.log(`  Event ${i + 1}:`, event.type);
        if (event.parsedJson) {
          console.log('   ', JSON.stringify(event.parsedJson, null, 4));
        }
      });
    }

    // 10. Get pool info after
    console.log('\n📊 Pool info after:');
    const poolInfoAfter = await flashClient.getPoolInfo();
    console.log(`  Liquidity: ${poolInfoAfter.liquidity}`);
    console.log(`  Loans Issued: ${poolInfoAfter.loansIssued}`);
    console.log(`  Fees Collected: ${poolInfoAfter.feesCollected}`);

    // 11. Show statistics
    console.log('\n📈 Statistics:');
    console.log(`  Liquidity change: +${poolInfoAfter.liquidity - poolInfoBefore.liquidity}`);
    console.log(`  New loans: +${poolInfoAfter.loansIssued - poolInfoBefore.loansIssued}`);
    console.log(`  Fees earned: +${poolInfoAfter.feesCollected - poolInfoBefore.feesCollected}`);

    console.log('\n═══════════════════════════════════════');
    console.log(`🔗 Transaction: ${result.digest}`);
    console.log(`🎉 Flash loan test completed successfully!`);

  } catch (error) {
    console.error('\n❌ Error:', error);
    process.exit(1);
  }
}

main();
