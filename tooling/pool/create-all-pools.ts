#!/usr/bin/env bun

/**
 * Create all configured flash loan pools
 *
 * Usage:
 *   bun run scripts/create-all-pools.ts [testnet|mainnet]
 */

import { execSync } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const NETWORK = (process.argv[2] || process.env.NETWORK || 'testnet') as 'testnet' | 'mainnet';

interface PoolConfig {
  coinType: string;
  initialLiquidity: string;
}

async function main() {
  console.log('🏊 Creating All Flash Pools');
  console.log('═══════════════════════════════════════');
  console.log(`Network: ${NETWORK}`);
  console.log();

  try {
    // 1. Load pool configuration
    const configPath = join(process.cwd(), `config/pools.${NETWORK}.json`);

    if (!existsSync(configPath)) {
      console.error(`❌ Pool configuration not found: ${configPath}`);
      console.log('\n💡 Create configuration file with:');
      console.log('   task config:generate');
      process.exit(1);
    }

    const config: PoolConfig[] = JSON.parse(readFileSync(configPath, 'utf-8'));

    console.log(`📋 Found ${config.length} pool(s) to create\n`);

    // 2. Check deployment exists
    const deploymentPath = join(process.cwd(), `deployments/${NETWORK}.json`);

    if (!existsSync(deploymentPath)) {
      console.error(`❌ No deployment found for ${NETWORK}`);
      console.log('\n💡 Deploy first with:');
      console.log(`   task deploy:${NETWORK}`);
      process.exit(1);
    }

    // 3. Create each pool
    for (let i = 0; i < config.length; i++) {
      const pool = config[i];

      console.log(`\n[${i + 1}/${config.length}] Creating pool for ${pool.coinType}`);
      console.log(`   Initial liquidity: ${pool.initialLiquidity}`);

      try {
        execSync(
          `NETWORK=${NETWORK} bun run scripts/create-flash-pool.ts ${pool.coinType} ${pool.initialLiquidity}`,
          { stdio: 'inherit' }
        );

        console.log(`   ✅ Pool created successfully`);
      } catch (error) {
        console.error(`   ❌ Failed to create pool:`, error);
        console.log(`   Continuing with next pool...`);
      }

      // Small delay between pool creations
      if (i < config.length - 1) {
        console.log('   Waiting 2 seconds...');
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    console.log('\n═══════════════════════════════════════');
    console.log('✅ Pool creation complete');
    console.log('\n💡 Next steps:');
    console.log('   1. View pools: task pool:list');
    console.log('   2. Add liquidity: task pool:add-liquidity');
    console.log('   3. Start bot: task bot:start');

  } catch (error) {
    console.error('\n❌ Error:', error);
    process.exit(1);
  }
}

main();
