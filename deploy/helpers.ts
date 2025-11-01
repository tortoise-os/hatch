#!/usr/bin/env bun
/**
 * Deployment Helpers
 * Inspired by scaffold-eth-2's deployment patterns
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

export interface DeploymentNetwork {
  name: string;
  rpcUrl?: string;
  explorer: string;
}

export interface DeploymentResult {
  packageId: string;
  digest: string;
  timestamp: string;
  deployer?: string;
  gasUsed?: string;
}

export interface PackageDeployment {
  name: string;
  network: string;
  packageId: string;
  digest: string;
  timestamp: string;
  deployer?: string;
  gasUsed?: string;
  dependencies?: Record<string, string>;
}

export const NETWORKS: Record<string, DeploymentNetwork> = {
  testnet: {
    name: 'testnet',
    explorer: 'https://suiscan.xyz/testnet',
  },
  mainnet: {
    name: 'mainnet',
    explorer: 'https://suiscan.xyz/mainnet',
  },
  devnet: {
    name: 'devnet',
    explorer: 'https://suiscan.xyz/devnet',
  },
  localnet: {
    name: 'localnet',
    rpcUrl: 'http://127.0.0.1:9000',
    explorer: 'http://localhost:3000',
  },
};

/**
 * Get deployment directory for a network
 */
export function getDeploymentDir(network: string): string {
  const deploymentsDir = path.join(process.cwd(), 'deployments', network);
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir, { recursive: true });
  }
  return deploymentsDir;
}

/**
 * Save deployment artifact
 */
export function saveDeployment(
  network: string,
  packageName: string,
  deployment: PackageDeployment
): void {
  const deploymentDir = getDeploymentDir(network);
  const filePath = path.join(deploymentDir, `${packageName}.json`);

  fs.writeFileSync(filePath, JSON.stringify(deployment, null, 2));
  console.log(`✅ Saved deployment: ${filePath}`);
}

/**
 * Load deployment artifact
 */
export function loadDeployment(
  network: string,
  packageName: string
): PackageDeployment | null {
  const deploymentDir = getDeploymentDir(network);
  const filePath = path.join(deploymentDir, `${packageName}.json`);

  if (!fs.existsSync(filePath)) {
    return null;
  }

  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

/**
 * Get all deployments for a network
 */
export function getAllDeployments(network: string): Record<string, PackageDeployment> {
  const deploymentDir = getDeploymentDir(network);

  if (!fs.existsSync(deploymentDir)) {
    return {};
  }

  const deployments: Record<string, PackageDeployment> = {};
  const files = fs.readdirSync(deploymentDir);

  for (const file of files) {
    if (file.endsWith('.json')) {
      const packageName = file.replace('.json', '');
      const deployment = loadDeployment(network, packageName);
      if (deployment) {
        deployments[packageName] = deployment;
      }
    }
  }

  return deployments;
}

/**
 * Build a Move package
 */
export function buildPackage(packagePath: string): void {
  console.log(`📦 Building package at ${packagePath}...`);
  execSync('sui move build', {
    cwd: packagePath,
    stdio: 'inherit',
  });
}

/**
 * Publish a Move package
 */
export function publishPackage(
  packagePath: string,
  gasBudget: number = 100000000
): DeploymentResult {
  console.log(`🚀 Publishing package from ${packagePath}...`);

  const output = execSync(
    `sui client publish --gas-budget ${gasBudget} --json`,
    {
      cwd: packagePath,
      encoding: 'utf-8',
    }
  );

  const result = JSON.parse(output);

  // Extract package ID from object changes
  const packageChange = result.objectChanges?.find(
    (change: any) => change.type === 'published'
  );

  if (!packageChange) {
    throw new Error('Failed to find published package in transaction result');
  }

  return {
    packageId: packageChange.packageId,
    digest: result.digest,
    timestamp: new Date().toISOString(),
    deployer: result.transaction?.data?.sender,
    gasUsed: result.effects?.gasUsed?.computationCost,
  };
}

/**
 * Update Move.toml with deployed package addresses
 */
export function updateMoveToml(
  moveTomlPath: string,
  addresses: Record<string, string>
): void {
  let content = fs.readFileSync(moveTomlPath, 'utf-8');

  for (const [name, address] of Object.entries(addresses)) {
    // Update address in [addresses] section
    const regex = new RegExp(`^${name}\\s*=\\s*"0x[a-f0-9]*"`, 'gm');
    content = content.replace(regex, `${name} = "${address}"`);
  }

  fs.writeFileSync(moveTomlPath, content);
}

/**
 * Generate deployment summary
 */
export function generateDeploymentSummary(network: string): void {
  const deployments = getAllDeployments(network);
  const networkInfo = NETWORKS[network];

  console.log('\n' + '='.repeat(60));
  console.log(`  Deployment Summary - ${network.toUpperCase()}`);
  console.log('='.repeat(60) + '\n');

  for (const [name, deployment] of Object.entries(deployments)) {
    console.log(`📦 ${name}`);
    console.log(`   Package ID: ${deployment.packageId}`);
    console.log(`   Deployed: ${deployment.timestamp}`);
    console.log(`   Explorer: ${networkInfo.explorer}/object/${deployment.packageId}`);
    if (deployment.dependencies && Object.keys(deployment.dependencies).length > 0) {
      console.log(`   Dependencies:`);
      for (const [dep, addr] of Object.entries(deployment.dependencies)) {
        console.log(`     - ${dep}: ${addr}`);
      }
    }
    console.log('');
  }

  console.log('='.repeat(60) + '\n');
}

/**
 * Generate .env file from deployments
 */
export function generateEnvFile(network: string): void {
  const deployments = getAllDeployments(network);
  const envPath = path.join(process.cwd(), `.env.${network}`);

  let envContent = `# Generated by deployment scripts on ${new Date().toISOString()}\n`;
  envContent += `NETWORK=${network}\n`;

  for (const [name, deployment] of Object.entries(deployments)) {
    const envVar = `${name.toUpperCase()}_PACKAGE_ID`;
    envContent += `${envVar}=${deployment.packageId}\n`;
  }

  fs.writeFileSync(envPath, envContent);
  console.log(`✅ Generated ${envPath}`);
}
