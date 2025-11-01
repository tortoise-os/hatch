#!/usr/bin/env bun

/**
 * Deploy Hatch contracts to Sui network
 *
 * Usage:
 *   bun run scripts/deploy.ts [testnet|mainnet]
 */

import { execSync } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const NETWORK = process.argv[2] || 'testnet';

interface DeploymentInfo {
  network: string;
  packageId: string;
  timestamp: string;
  deployedModules: string[];
}

async function main() {
  console.log('🚀 Deploying Hatch to', NETWORK);
  console.log('═══════════════════════════════════════');

  try {
    // 1. Switch to target network
    console.log(`\n📡 Switching to ${NETWORK}...`);
    execSync(`sui client switch --env ${NETWORK}`, { stdio: 'inherit' });

    // 2. Build Move contracts
    console.log('\n🔨 Building Move contracts...');
    execSync('sui move build', { cwd: 'move', stdio: 'inherit' });

    // 3. Deploy contracts
    console.log('\n📦 Publishing package...');
    const output = execSync(
      'sui client publish --gas-budget 100000000 --json',
      { cwd: 'move', encoding: 'utf-8' }
    );

    const result = JSON.parse(output);

    if (result.effects?.status?.status !== 'success') {
      throw new Error('Deployment failed');
    }

    // 4. Extract package ID
    const packageId = result.objectChanges?.find(
      (obj: any) => obj.type === 'published'
    )?.packageId;

    if (!packageId) {
      throw new Error('Could not find package ID in deployment result');
    }

    console.log('\n✅ Deployment successful!');
    console.log('═══════════════════════════════════════');
    console.log(`📦 Package ID: ${packageId}`);

    // 5. Extract created objects
    const createdObjects = result.objectChanges?.filter(
      (obj: any) => obj.type === 'created'
    );

    console.log('\n📝 Created objects:');
    createdObjects?.forEach((obj: any) => {
      console.log(`  - ${obj.objectType}: ${obj.objectId}`);
    });

    // 6. Save deployment info
    const deploymentInfo: DeploymentInfo = {
      network: NETWORK,
      packageId,
      timestamp: new Date().toISOString(),
      deployedModules: [
        'flash_pool',
        'leveraged_farm',
        'dex_arb',
      ],
    };

    const deploymentPath = join(
      process.cwd(),
      `deployments/${NETWORK}.json`
    );

    writeFileSync(
      deploymentPath,
      JSON.stringify(deploymentInfo, null, 2)
    );

    console.log(`\n💾 Deployment info saved to: ${deploymentPath}`);

    // 7. Print next steps
    console.log('\n🎯 Next steps:');
    console.log('1. Create flash pool: bun run scripts/create-flash-pool.ts');
    console.log('2. Add liquidity: bun run scripts/add-liquidity.ts');
    console.log('3. Test flash loan: bun run scripts/test-flash-borrow.ts');
    console.log('4. Start bot: task bot:start');

  } catch (error) {
    console.error('\n❌ Deployment failed:', error);
    process.exit(1);
  }
}

main();
