// Copyright (c) TortoiseOS
// SPDX-License-Identifier: MIT

import * as fs from 'fs';
import * as path from 'path';

export interface DeploymentConfig {
  network: string;
  carapace: {
    packageId: string | null;
    pools: Record<string, any>;
    deployed: boolean;
  };
  hatch: {
    packageId: string | null;
    deployed: boolean;
  };
}

export interface NetworkConfig {
  testnet: DeploymentConfig;
  mainnet: DeploymentConfig;
}

/**
 * Load deployment configuration from config file
 */
export function loadDeploymentConfig(network: 'testnet' | 'mainnet'): DeploymentConfig {
  const configPath = path.join(process.cwd(), 'config', 'deployment.json');

  if (!fs.existsSync(configPath)) {
    throw new Error(`Deployment config not found at ${configPath}`);
  }

  const config: NetworkConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  const networkConfig = config[network];

  if (!networkConfig) {
    throw new Error(`Network ${network} not found in deployment config`);
  }

  if (!networkConfig.carapace.deployed || !networkConfig.hatch.deployed) {
    throw new Error(`Packages not deployed on ${network}. Run deployment script first.`);
  }

  return networkConfig;
}

/**
 * Load configuration from environment variables
 */
export function loadEnvConfig(): {
  network: string;
  carapacePackageId: string;
  hatchPackageId: string;
} {
  const network = process.env.NETWORK || 'testnet';
  const carapacePackageId = process.env.CARAPACE_PACKAGE_ID;
  const hatchPackageId = process.env.HATCH_PACKAGE_ID;

  if (!carapacePackageId || !hatchPackageId) {
    throw new Error('Missing environment variables. Run deployment script or set CARAPACE_PACKAGE_ID and HATCH_PACKAGE_ID');
  }

  return {
    network,
    carapacePackageId,
    hatchPackageId,
  };
}

/**
 * Get package ID for flash loan operations
 * Tries env vars first, then falls back to deployment config
 */
export function getPackageId(network: 'testnet' | 'mainnet' = 'testnet'): string {
  // Try environment variable first
  const envPackageId = process.env.HATCH_PACKAGE_ID;
  if (envPackageId) {
    return envPackageId;
  }

  // Fall back to deployment config
  const config = loadDeploymentConfig(network);
  if (!config.hatch.packageId) {
    throw new Error(`Hatch package ID not found for ${network}`);
  }

  return config.hatch.packageId;
}

/**
 * Get Carapace package ID
 */
export function getCarapacePackageId(network: 'testnet' | 'mainnet' = 'testnet'): string {
  // Try environment variable first
  const envPackageId = process.env.CARAPACE_PACKAGE_ID;
  if (envPackageId) {
    return envPackageId;
  }

  // Fall back to deployment config
  const config = loadDeploymentConfig(network);
  if (!config.carapace.packageId) {
    throw new Error(`Carapace package ID not found for ${network}`);
  }

  return config.carapace.packageId;
}
