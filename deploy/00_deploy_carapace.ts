#!/usr/bin/env bun
/**
 * Deploy Carapace Package
 *
 * This deploys the Carapace flash loan protocol which Hatch depends on.
 */

import * as path from 'path';
import {
  buildPackage,
  publishPackage,
  saveDeployment,
  loadDeployment,
  type PackageDeployment,
} from './helpers';

export interface DeployOptions {
  network: string;
  force?: boolean;
  gasBudget?: number;
}

export async function deployCarapace(options: DeployOptions): Promise<PackageDeployment> {
  const { network, force = false, gasBudget = 100000000 } = options;

  console.log(`\n🔷 Deploying Carapace to ${network}...\n`);

  // Check if already deployed
  if (!force) {
    const existing = loadDeployment(network, 'carapace');
    if (existing) {
      console.log(`⚠️  Carapace already deployed at ${existing.packageId}`);
      console.log(`   Use --force to redeploy\n`);
      return existing;
    }
  }

  // Build and publish
  const carapacePath = path.join(process.cwd(), '..', 'carapace', 'move');

  buildPackage(carapacePath);
  const result = publishPackage(carapacePath, gasBudget);

  // Create deployment artifact
  const deployment: PackageDeployment = {
    name: 'carapace',
    network,
    packageId: result.packageId,
    digest: result.digest,
    timestamp: result.timestamp,
    deployer: result.deployer,
    gasUsed: result.gasUsed,
  };

  // Save deployment
  saveDeployment(network, 'carapace', deployment);

  console.log(`\n✅ Carapace deployed successfully!`);
  console.log(`   Package ID: ${result.packageId}\n`);

  return deployment;
}

// CLI execution
if (import.meta.main) {
  const network = process.env.NETWORK || 'testnet';
  const force = process.argv.includes('--force');
  const gasBudget = parseInt(process.env.GAS_BUDGET || '100000000');

  deployCarapace({ network, force, gasBudget })
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('❌ Deployment failed:', error);
      process.exit(1);
    });
}
