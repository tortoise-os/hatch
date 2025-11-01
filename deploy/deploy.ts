#!/usr/bin/env bun
/**
 * Main Deployment Runner
 *
 * Orchestrates all deployment scripts in order.
 * Inspired by scaffold-eth-2's deployment system.
 *
 * Usage:
 *   bun run deploy/deploy.ts                    # Deploy all to testnet
 *   NETWORK=mainnet bun run deploy/deploy.ts    # Deploy all to mainnet
 *   bun run deploy/deploy.ts --force            # Force redeploy
 *   bun run deploy/deploy.ts --tags carapace    # Deploy only Carapace
 */

import { deployCarapace } from './00_deploy_carapace';
import { deployHatch } from './01_deploy_hatch';
import {
  generateDeploymentSummary,
  generateEnvFile,
  getAllDeployments,
} from './helpers';

interface DeploymentScript {
  name: string;
  tag: string;
  deploy: (options: any) => Promise<any>;
}

const DEPLOYMENT_SCRIPTS: DeploymentScript[] = [
  {
    name: '00_deploy_carapace',
    tag: 'carapace',
    deploy: deployCarapace,
  },
  {
    name: '01_deploy_hatch',
    tag: 'hatch',
    deploy: deployHatch,
  },
];

async function main() {
  // Parse arguments
  const args = process.argv.slice(2);
  const network = process.env.NETWORK || 'testnet';
  const force = args.includes('--force');
  const gasBudget = parseInt(process.env.GAS_BUDGET || '100000000');

  // Parse tags
  const tagsIndex = args.indexOf('--tags');
  const tags = tagsIndex >= 0 ? args[tagsIndex + 1]?.split(',') : null;

  console.log('\n' + '='.repeat(60));
  console.log(`  🚀 Hatch Deployment Runner`);
  console.log('='.repeat(60));
  console.log(`  Network: ${network}`);
  console.log(`  Force: ${force}`);
  if (tags) {
    console.log(`  Tags: ${tags.join(', ')}`);
  }
  console.log('='.repeat(60) + '\n');

  // Filter scripts by tags
  const scriptsToRun = tags
    ? DEPLOYMENT_SCRIPTS.filter((script) => tags.includes(script.tag))
    : DEPLOYMENT_SCRIPTS;

  if (scriptsToRun.length === 0) {
    console.log('⚠️  No scripts to run for the given tags');
    return;
  }

  console.log(`📋 Running ${scriptsToRun.length} deployment script(s):\n`);
  for (const script of scriptsToRun) {
    console.log(`   - ${script.name} (${script.tag})`);
  }
  console.log('');

  // Run deployments
  const results = [];
  for (const script of scriptsToRun) {
    try {
      const result = await script.deploy({ network, force, gasBudget });
      results.push({ script: script.name, success: true, result });
    } catch (error) {
      console.error(`\n❌ Failed to run ${script.name}:`, error);
      results.push({ script: script.name, success: false, error });

      // Stop on first error
      console.log('\n⛔ Deployment stopped due to error\n');
      process.exit(1);
    }
  }

  // Generate outputs
  console.log('\n📄 Generating deployment artifacts...\n');

  generateEnvFile(network);
  generateDeploymentSummary(network);

  // Export deployments to legacy config for backwards compatibility
  const deployments = getAllDeployments(network);
  const legacyConfig = {
    [network]: {
      network,
      carapace: {
        packageId: deployments.carapace?.packageId || null,
        pools: [],
        deployed: !!deployments.carapace,
      },
      hatch: {
        packageId: deployments.hatch?.packageId || null,
        deployed: !!deployments.hatch,
      },
    },
  };

  const fs = require('fs');
  const path = require('path');

  // Read existing config if it exists
  const configPath = path.join(process.cwd(), 'config', 'deployment.json');
  let existingConfig = {};
  if (fs.existsSync(configPath)) {
    existingConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  }

  // Merge configs
  const mergedConfig = { ...existingConfig, ...legacyConfig };
  fs.writeFileSync(configPath, JSON.stringify(mergedConfig, null, 2));

  console.log(`✅ Updated legacy config: config/deployment.json\n`);

  // Success summary
  console.log('='.repeat(60));
  console.log('  ✨ Deployment Complete!');
  console.log('='.repeat(60));
  console.log(`\n📦 Deployed Packages:\n`);

  for (const result of results) {
    if (result.success) {
      console.log(`   ✅ ${result.result.name}: ${result.result.packageId}`);
    }
  }

  console.log(`\n💡 Next Steps:\n`);
  console.log(`   1. Export env vars: source .env.${network}`);
  console.log(`   2. View deployments: ls -la deployments/${network}/`);
  console.log(`   3. Run examples with the deployed packages\n`);
}

main().catch((error) => {
  console.error('❌ Deployment failed:', error);
  process.exit(1);
});
