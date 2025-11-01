#!/usr/bin/env bun

/**
 * Check deployment status across networks
 *
 * Usage:
 *   bun run scripts/deployment-status.ts
 */

import { SuiClient, getFullnodeUrl } from '@mysten/sui.js/client';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

interface DeploymentInfo {
  network: string;
  packageId: string;
  timestamp: string;
  deployedModules: string[];
}

async function checkNetwork(network: 'testnet' | 'mainnet') {
  console.log(`\n📡 ${network.toUpperCase()}`);
  console.log('─'.repeat(50));

  const deploymentPath = join(process.cwd(), `deployments/${network}.json`);

  if (!existsSync(deploymentPath)) {
    console.log('❌ Not deployed');
    return;
  }

  try {
    const deployment: DeploymentInfo = JSON.parse(
      readFileSync(deploymentPath, 'utf-8')
    );

    const client = new SuiClient({ url: getFullnodeUrl(network) });

    // Check if package exists
    try {
      const packageObj = await client.getObject({
        id: deployment.packageId,
        options: { showContent: true },
      });

      if (packageObj.data) {
        console.log('✅ Deployed and verified');
        console.log(`   Package ID: ${deployment.packageId}`);
        console.log(`   Deployed: ${new Date(deployment.timestamp).toLocaleString()}`);

        // Check for pools
        const poolsPath = join(process.cwd(), `deployments/${network}-pools.json`);
        if (existsSync(poolsPath)) {
          const pools = JSON.parse(readFileSync(poolsPath, 'utf-8'));
          console.log(`   Pools: ${Object.keys(pools).length}`);
        } else {
          console.log('   Pools: 0 (not created)');
        }
      }
    } catch {
      console.log('⚠️  Deployed but package not found on chain');
      console.log(`   Package ID: ${deployment.packageId}`);
      console.log('   (May have been upgraded or removed)');
    }
  } catch (error) {
    console.log('❌ Error reading deployment info');
  }
}

async function main() {
  console.log('📊 Hatch Deployment Status');
  console.log('═'.repeat(50));

  await checkNetwork('testnet');
  await checkNetwork('mainnet');

  console.log('\n═'.repeat(50));
  console.log('\n💡 Commands:');
  console.log('   Deploy to testnet: task deploy:testnet');
  console.log('   Deploy to mainnet: task deploy:mainnet');
  console.log('   Verify deployment: task deploy:verify');
  console.log('   Create pools: task pool:create:all');
}

main();
