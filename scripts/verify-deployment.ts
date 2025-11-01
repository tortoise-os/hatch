#!/usr/bin/env bun

/**
 * Verify deployed Hatch contracts
 *
 * Usage:
 *   bun run scripts/verify-deployment.ts [testnet|mainnet]
 */

import { SuiClient, getFullnodeUrl } from '@mysten/sui.js/client';
import { readFileSync } from 'fs';
import { join } from 'path';

const NETWORK = (process.argv[2] || process.env.NETWORK || 'testnet') as 'testnet' | 'mainnet';

interface DeploymentInfo {
  network: string;
  packageId: string;
  timestamp: string;
  deployedModules: string[];
}

async function main() {
  console.log('🔍 Verifying Hatch Deployment');
  console.log('═══════════════════════════════════════');
  console.log(`Network: ${NETWORK}`);
  console.log();

  try {
    // 1. Load deployment info
    const deploymentPath = join(process.cwd(), `deployments/${NETWORK}.json`);
    let deployment: DeploymentInfo;

    try {
      deployment = JSON.parse(readFileSync(deploymentPath, 'utf-8'));
    } catch {
      console.error(`❌ No deployment found for ${NETWORK}`);
      console.error(`   Expected: ${deploymentPath}`);
      process.exit(1);
    }

    console.log(`📦 Package ID: ${deployment.packageId}`);
    console.log(`📅 Deployed: ${new Date(deployment.timestamp).toLocaleString()}`);
    console.log();

    // 2. Initialize client
    const client = new SuiClient({ url: getFullnodeUrl(NETWORK) });

    // 3. Verify package exists
    console.log('🔍 Verifying package...');

    try {
      const packageObj = await client.getObject({
        id: deployment.packageId,
        options: { showContent: true },
      });

      if (!packageObj.data) {
        throw new Error('Package not found on chain');
      }

      console.log('✅ Package exists on chain');
    } catch (error) {
      console.error('❌ Package verification failed:', error);
      process.exit(1);
    }

    // 4. Verify modules
    console.log('\n🔍 Verifying modules...');

    const expectedModules = [
      'flash_pool',
      'dex_arb',
      'leveraged_farm',
      'dex_adapter',
      'cetus_adapter',
      'turbos_adapter',
    ];

    for (const module of expectedModules) {
      try {
        const normalized = await client.getNormalizedMoveModule({
          package: deployment.packageId,
          module,
        });

        if (normalized) {
          console.log(`  ✅ ${module}`);
        }
      } catch {
        console.log(`  ⚠️  ${module} (not found or not public)`);
      }
    }

    // 5. Check for pools
    console.log('\n🔍 Checking for flash pools...');

    const poolsPath = join(process.cwd(), `deployments/${NETWORK}-pools.json`);

    try {
      const pools = JSON.parse(readFileSync(poolsPath, 'utf-8'));
      const poolCount = Object.keys(pools).length;

      console.log(`✅ Found ${poolCount} flash pool(s)`);

      for (const [coinType, poolInfo] of Object.entries(pools)) {
        console.log(`\n  💱 ${coinType}`);
        console.log(`     Pool ID: ${(poolInfo as any).poolId}`);
        console.log(`     Liquidity: ${(poolInfo as any).initialLiquidity}`);
      }
    } catch {
      console.log('⚠️  No pools created yet');
      console.log('   Run: task pool:create:all');
    }

    // 6. Summary
    console.log('\n═══════════════════════════════════════');
    console.log('✅ Deployment verification complete');
    console.log();
    console.log('Next steps:');
    console.log(`  1. View package: sui client object ${deployment.packageId}`);
    console.log('  2. Create pools: task pool:create:all');
    console.log('  3. Start bot: task bot:start');

  } catch (error) {
    console.error('\n❌ Verification failed:', error);
    process.exit(1);
  }
}

main();
