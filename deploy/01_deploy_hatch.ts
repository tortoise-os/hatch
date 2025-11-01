#!/usr/bin/env bun
/**
 * Deploy Hatch Package
 *
 * This deploys the Hatch protocol with Carapace as a dependency.
 * Carapace must be deployed first (see 00_deploy_carapace.ts).
 */

import * as path from 'path';
import * as fs from 'fs';
import {
  buildPackage,
  publishPackage,
  saveDeployment,
  loadDeployment,
  updateMoveToml,
  type PackageDeployment,
} from './helpers';

export interface DeployOptions {
  network: string;
  force?: boolean;
  gasBudget?: number;
}

export async function deployHatch(options: DeployOptions): Promise<PackageDeployment> {
  const { network, force = false, gasBudget = 100000000 } = options;

  console.log(`\n🔶 Deploying Hatch to ${network}...\n`);

  // Check if already deployed
  if (!force) {
    const existing = loadDeployment(network, 'hatch');
    if (existing) {
      console.log(`⚠️  Hatch already deployed at ${existing.packageId}`);
      console.log(`   Use --force to redeploy\n`);
      return existing;
    }
  }

  // Get Carapace deployment (dependency)
  const carapace = loadDeployment(network, 'carapace');
  if (!carapace) {
    throw new Error(
      'Carapace not deployed yet. Run 00_deploy_carapace.ts first.'
    );
  }

  console.log(`📦 Using Carapace at ${carapace.packageId}`);

  // Prepare Move.toml with Carapace address
  const hatchPath = path.join(process.cwd(), 'move');
  const moveTomlPath = path.join(hatchPath, 'Move.toml');
  const moveTomlBackup = path.join(hatchPath, 'Move.toml.backup');

  // Backup original Move.toml
  fs.copyFileSync(moveTomlPath, moveTomlBackup);

  try {
    // Update Move.toml with Carapace address
    let moveToml = fs.readFileSync(moveTomlPath, 'utf-8');

    // Comment out local dependency
    moveToml = moveToml.replace(
      /^carapace = { local = ".*" }$/m,
      '# carapace = { local = "../../carapace/move" }  # Commented for deployment'
    );

    // Update carapace address
    moveToml = moveToml.replace(
      /^carapace = "0x[a-f0-9]*"$/m,
      `carapace = "${carapace.packageId}"`
    );

    fs.writeFileSync(moveTomlPath, moveToml);

    // Build and publish
    buildPackage(hatchPath);
    const result = publishPackage(hatchPath, gasBudget);

    // Create deployment artifact
    const deployment: PackageDeployment = {
      name: 'hatch',
      network,
      packageId: result.packageId,
      digest: result.digest,
      timestamp: result.timestamp,
      deployer: result.deployer,
      gasUsed: result.gasUsed,
      dependencies: {
        carapace: carapace.packageId,
      },
    };

    // Save deployment
    saveDeployment(network, 'hatch', deployment);

    console.log(`\n✅ Hatch deployed successfully!`);
    console.log(`   Package ID: ${result.packageId}`);
    console.log(`   Dependencies:`);
    console.log(`     - Carapace: ${carapace.packageId}\n`);

    return deployment;
  } finally {
    // Always restore original Move.toml
    fs.copyFileSync(moveTomlBackup, moveTomlPath);
    fs.unlinkSync(moveTomlBackup);
    console.log(`♻️  Restored original Move.toml\n`);
  }
}

// CLI execution
if (import.meta.main) {
  const network = process.env.NETWORK || 'testnet';
  const force = process.argv.includes('--force');
  const gasBudget = parseInt(process.env.GAS_BUDGET || '100000000');

  deployHatch({ network, force, gasBudget })
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('❌ Deployment failed:', error);
      process.exit(1);
    });
}
