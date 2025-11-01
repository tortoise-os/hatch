#!/usr/bin/env bun

/**
 * Comprehensive health check for deployed system
 *
 * Usage:
 *   bun run scripts/health-check.ts [testnet|mainnet]
 */

import { SuiClient, getFullnodeUrl } from '@mysten/sui.js/client';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const NETWORK = (process.argv[2] || process.env.NETWORK || 'testnet') as 'testnet' | 'mainnet';

interface HealthStatus {
  component: string;
  status: 'healthy' | 'warning' | 'error';
  message: string;
  details?: any;
}

const results: HealthStatus[] = [];

function addResult(component: string, status: 'healthy' | 'warning' | 'error', message: string, details?: any) {
  results.push({ component, status, message, details });
}

async function checkDeployment() {
  const deploymentPath = join(process.cwd(), `deployments/${NETWORK}.json`);

  if (!existsSync(deploymentPath)) {
    addResult('Deployment', 'error', 'No deployment found');
    return null;
  }

  try {
    const deployment = JSON.parse(readFileSync(deploymentPath, 'utf-8'));
    addResult('Deployment', 'healthy', 'Deployment file exists', {
      packageId: deployment.packageId,
      timestamp: deployment.timestamp,
    });
    return deployment;
  } catch (error) {
    addResult('Deployment', 'error', `Invalid deployment file: ${error}`);
    return null;
  }
}

async function checkPackageOnChain(client: SuiClient, packageId: string) {
  try {
    const pkg = await client.getObject({
      id: packageId,
      options: { showContent: true },
    });

    if (!pkg.data) {
      addResult('Package', 'error', 'Package not found on-chain');
      return false;
    }

    addResult('Package', 'healthy', 'Package exists on-chain', {
      packageId,
      version: pkg.data.version,
    });
    return true;
  } catch (error) {
    addResult('Package', 'error', `Failed to fetch package: ${error}`);
    return false;
  }
}

async function checkModules(client: SuiClient, packageId: string) {
  const modules = [
    'flash_pool',
    'dex_arb',
    'leveraged_farm',
    'dex_adapter',
    'cetus_adapter',
    'turbos_adapter',
  ];

  let healthyCount = 0;

  for (const module of modules) {
    try {
      const normalized = await client.getNormalizedMoveModule({
        package: packageId,
        module,
      });

      if (normalized) {
        healthyCount++;
      }
    } catch {
      // Module not accessible
    }
  }

  if (healthyCount === modules.length) {
    addResult('Modules', 'healthy', `All ${modules.length} modules accessible`);
  } else if (healthyCount > 0) {
    addResult('Modules', 'warning', `Only ${healthyCount}/${modules.length} modules accessible`);
  } else {
    addResult('Modules', 'error', 'No modules accessible');
  }
}

async function checkPools(client: SuiClient) {
  const poolsPath = join(process.cwd(), `deployments/${NETWORK}-pools.json`);

  if (!existsSync(poolsPath)) {
    addResult('Pools', 'warning', 'No pools created yet');
    return;
  }

  try {
    const pools = JSON.parse(readFileSync(poolsPath, 'utf-8'));
    const poolCount = Object.keys(pools).length;

    if (poolCount === 0) {
      addResult('Pools', 'warning', 'No pools configured');
      return;
    }

    let healthyPools = 0;
    let lowLiquidityPools = 0;

    for (const [coinType, poolInfo] of Object.entries(pools)) {
      const info = poolInfo as any;

      try {
        const pool = await client.getObject({
          id: info.poolId,
          options: { showContent: true },
        });

        if (pool.data && pool.data.content && 'fields' in pool.data.content) {
          const fields = pool.data.content.fields as any;

          healthyPools++;

          // Check liquidity levels
          const balance = BigInt(fields.balance || 0);
          const initialLiquidity = BigInt(info.initialLiquidity || 0);

          if (balance < initialLiquidity / 10n) {
            lowLiquidityPools++;
          }
        }
      } catch {
        // Pool not accessible
      }
    }

    if (healthyPools === poolCount) {
      if (lowLiquidityPools > 0) {
        addResult('Pools', 'warning', `${healthyPools}/${poolCount} pools healthy (${lowLiquidityPools} low liquidity)`);
      } else {
        addResult('Pools', 'healthy', `${healthyPools}/${poolCount} pools healthy`);
      }
    } else if (healthyPools > 0) {
      addResult('Pools', 'warning', `Only ${healthyPools}/${poolCount} pools accessible`);
    } else {
      addResult('Pools', 'error', 'No pools accessible');
    }
  } catch (error) {
    addResult('Pools', 'error', `Failed to check pools: ${error}`);
  }
}

async function checkConfiguration() {
  const poolsConfig = join(process.cwd(), `config/pools.${NETWORK}.json`);
  const botConfig = join(process.cwd(), `config/bot.${NETWORK}.json`);

  let configIssues = 0;

  if (!existsSync(poolsConfig)) {
    addResult('Config', 'warning', 'Pool configuration not found');
    configIssues++;
  }

  if (!existsSync(botConfig)) {
    addResult('Config', 'warning', 'Bot configuration not found');
    configIssues++;
  }

  if (configIssues === 0) {
    addResult('Config', 'healthy', 'All configurations present');
  }
}

async function checkNetwork(client: SuiClient) {
  try {
    const chainId = await client.getChainIdentifier();
    const latestCheckpoint = await client.getLatestCheckpointSequenceNumber();

    addResult('Network', 'healthy', `Connected to ${NETWORK}`, {
      chainId,
      latestCheckpoint: latestCheckpoint.toString(),
    });
  } catch (error) {
    addResult('Network', 'error', `Network connection failed: ${error}`);
  }
}

async function main() {
  console.log('🏥 System Health Check');
  console.log('═══════════════════════════════════════');
  console.log(`Network: ${NETWORK}`);
  console.log(`Time: ${new Date().toLocaleString()}`);
  console.log();

  try {
    const client = new SuiClient({ url: getFullnodeUrl(NETWORK) });

    // Run all checks
    console.log('🔍 Running health checks...\n');

    await checkNetwork(client);
    const deployment = await checkDeployment();

    if (deployment) {
      await checkPackageOnChain(client, deployment.packageId);
      await checkModules(client, deployment.packageId);
      await checkPools(client);
    }

    await checkConfiguration();

    // Print results
    console.log('📊 Health Check Results');
    console.log('═══════════════════════════════════════\n');

    let hasErrors = false;
    let hasWarnings = false;

    results.forEach(result => {
      const icon =
        result.status === 'healthy' ? '✅' :
        result.status === 'warning' ? '⚠️' :
        '❌';

      console.log(`${icon} ${result.component}: ${result.message}`);

      if (result.details) {
        Object.entries(result.details).forEach(([key, value]) => {
          console.log(`   ${key}: ${value}`);
        });
      }

      if (result.status === 'error') hasErrors = true;
      if (result.status === 'warning') hasWarnings = true;
    });

    console.log('\n═══════════════════════════════════════');

    // Summary
    const healthyCount = results.filter(r => r.status === 'healthy').length;
    const warningCount = results.filter(r => r.status === 'warning').length;
    const errorCount = results.filter(r => r.status === 'error').length;

    console.log(`\n📈 Summary: ${healthyCount} healthy, ${warningCount} warnings, ${errorCount} errors`);

    if (hasErrors) {
      console.log('\n❌ System has critical errors - immediate action required');
      process.exit(1);
    } else if (hasWarnings) {
      console.log('\n⚠️  System has warnings - review recommended');
      process.exit(0);
    } else {
      console.log('\n✅ All systems healthy');
      process.exit(0);
    }

  } catch (error) {
    console.error('\n❌ Health check failed:', error);
    process.exit(1);
  }
}

main();
