#!/usr/bin/env bun

/**
 * List all flash loan pools
 *
 * Usage:
 *   bun run scripts/list-pools.ts [testnet|mainnet]
 */

import { SuiClient, getFullnodeUrl } from '@mysten/sui.js/client';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const NETWORK = (process.argv[2] || process.env.NETWORK || 'testnet') as 'testnet' | 'mainnet';

async function main() {
  console.log('🏊 Flash Loan Pools');
  console.log('═══════════════════════════════════════');
  console.log(`Network: ${NETWORK}`);
  console.log();

  try {
    // Load pools from deployment file
    const poolsPath = join(process.cwd(), `deployments/${NETWORK}-pools.json`);

    if (!existsSync(poolsPath)) {
      console.log('❌ No pools found');
      console.log('\n💡 Create pools with:');
      console.log('   task pool:create:all');
      process.exit(0);
    }

    const pools = JSON.parse(readFileSync(poolsPath, 'utf-8'));
    const poolEntries = Object.entries(pools);

    if (poolEntries.length === 0) {
      console.log('❌ No pools found');
      process.exit(0);
    }

    console.log(`Found ${poolEntries.length} pool(s):\n`);

    const client = new SuiClient({ url: getFullnodeUrl(NETWORK) });

    // Display each pool
    for (const [coinType, poolInfo] of poolEntries) {
      const info = poolInfo as any;

      console.log(`💱 ${coinType}`);
      console.log(`   Pool ID: ${info.poolId}`);
      console.log(`   Created: ${new Date(info.createdAt).toLocaleString()}`);
      console.log(`   Initial Liquidity: ${info.initialLiquidity}`);

      // Try to get current pool state
      try {
        const pool = await client.getObject({
          id: info.poolId,
          options: { showContent: true },
        });

        if (pool.data && pool.data.content && 'fields' in pool.data.content) {
          const fields = pool.data.content.fields as any;
          console.log(`   Current Balance: ${fields.balance || 'N/A'}`);
          console.log(`   Total Fees: ${fields.total_fees || 'N/A'}`);
          console.log(`   Status: ${fields.paused ? '⏸️  Paused' : '✅ Active'}`);
        }
      } catch {
        console.log('   Status: ⚠️  Unable to fetch current state');
      }

      console.log();
    }

    console.log('═══════════════════════════════════════');
    console.log('\n💡 Commands:');
    console.log('   Pool info: task pool:info -- <pool-id>');
    console.log('   Add liquidity: task pool:add-liquidity -- <pool-id> <amount>');

  } catch (error) {
    console.error('\n❌ Error:', error);
    process.exit(1);
  }
}

main();
