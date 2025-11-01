#!/usr/bin/env bun

/**
 * Real-time pool monitoring
 *
 * Usage:
 *   bun run scripts/monitor-pools.ts [testnet|mainnet] [interval-seconds]
 */

import { SuiClient, getFullnodeUrl } from '@mysten/sui.js/client';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const NETWORK = (process.argv[2] || process.env.NETWORK || 'testnet') as 'testnet' | 'mainnet';
const INTERVAL = parseInt(process.argv[3] || '30') * 1000; // Default 30 seconds

interface PoolMetrics {
  poolId: string;
  coinType: string;
  balance: string;
  totalBorrowed: string;
  totalFees: string;
  utilizationRate: number;
  timestamp: string;
}

const previousMetrics: Map<string, PoolMetrics> = new Map();

async function fetchPoolMetrics(client: SuiClient, poolId: string, coinType: string): Promise<PoolMetrics | null> {
  try {
    const pool = await client.getObject({
      id: poolId,
      options: { showContent: true },
    });

    if (!pool.data || !pool.data.content || !('fields' in pool.data.content)) {
      return null;
    }

    const fields = pool.data.content.fields as any;

    const balance = BigInt(fields.balance || 0);
    const totalBorrowed = BigInt(fields.total_borrowed || 0);
    const totalFees = BigInt(fields.total_fees || 0);

    const utilizationRate = balance > 0n
      ? Number((totalBorrowed * 10000n) / balance) / 100
      : 0;

    return {
      poolId,
      coinType,
      balance: balance.toString(),
      totalBorrowed: totalBorrowed.toString(),
      totalFees: totalFees.toString(),
      utilizationRate,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    console.error(`Error fetching pool ${poolId}:`, error);
    return null;
  }
}

function formatSUI(mist: string): string {
  return (Number(mist) / 1e9).toFixed(4);
}

function getChangeIndicator(current: number, previous: number): string {
  if (current > previous) return '↑';
  if (current < previous) return '↓';
  return '→';
}

function displayMetrics(metrics: PoolMetrics) {
  const prev = previousMetrics.get(metrics.poolId);

  console.log(`\n╔═══════════════════════════════════════════╗`);
  console.log(`║  ${metrics.coinType.padEnd(41)}║`);
  console.log(`╠═══════════════════════════════════════════╣`);
  console.log(`║  Pool ID: ${metrics.poolId.slice(0, 30)}...║`);

  const balanceChange = prev
    ? getChangeIndicator(Number(metrics.balance), Number(prev.balance))
    : ' ';
  console.log(`║  Balance: ${formatSUI(metrics.balance)} SUI ${balanceChange}          ║`);

  const feesChange = prev
    ? getChangeIndicator(Number(metrics.totalFees), Number(prev.totalFees))
    : ' ';
  console.log(`║  Total Fees: ${formatSUI(metrics.totalFees)} SUI ${feesChange}       ║`);

  const utilizationChange = prev
    ? getChangeIndicator(metrics.utilizationRate, prev.utilizationRate)
    : ' ';
  console.log(`║  Utilization: ${metrics.utilizationRate.toFixed(2)}% ${utilizationChange}           ║`);

  // Status indicator
  let status = '✅ Healthy';
  if (metrics.utilizationRate > 80) status = '⚠️  High Utilization';
  if (Number(metrics.balance) < 1e9) status = '❌ Low Liquidity';

  console.log(`║  Status: ${status}                   ║`);
  console.log(`║  Updated: ${new Date().toLocaleTimeString()}              ║`);
  console.log(`╚═══════════════════════════════════════════╝`);

  // Alert on significant changes
  if (prev) {
    const balanceDiff = ((Number(metrics.balance) - Number(prev.balance)) / Number(prev.balance)) * 100;

    if (Math.abs(balanceDiff) > 10) {
      console.log(`⚠️  Alert: Balance changed by ${balanceDiff.toFixed(2)}%`);
    }

    if (metrics.utilizationRate > 90) {
      console.log(`🚨 Critical: Utilization > 90%`);
    }

    if (Number(metrics.balance) < Number(metrics.totalBorrowed) * 0.1) {
      console.log(`🚨 Critical: Low liquidity`);
    }
  }

  previousMetrics.set(metrics.poolId, metrics);
}

async function monitor() {
  console.clear();
  console.log('🔍 Pool Monitoring Dashboard');
  console.log('═══════════════════════════════════════════');
  console.log(`Network: ${NETWORK}`);
  console.log(`Refresh: ${INTERVAL / 1000}s`);
  console.log(`Time: ${new Date().toLocaleString()}`);

  try {
    const client = new SuiClient({ url: getFullnodeUrl(NETWORK) });

    // Load pools
    const poolsPath = join(process.cwd(), `deployments/${NETWORK}-pools.json`);

    if (!existsSync(poolsPath)) {
      console.log('\n❌ No pools found');
      console.log('   Run: task pool:create:all');
      return;
    }

    const pools = JSON.parse(readFileSync(poolsPath, 'utf-8'));

    // Fetch and display metrics for each pool
    for (const [coinType, poolInfo] of Object.entries(pools)) {
      const info = poolInfo as any;
      const metrics = await fetchPoolMetrics(client, info.poolId, coinType);

      if (metrics) {
        displayMetrics(metrics);
      }
    }

    console.log('\n═══════════════════════════════════════════');
    console.log('Press Ctrl+C to stop monitoring');

  } catch (error) {
    console.error('\n❌ Monitoring error:', error);
  }
}

async function main() {
  console.log('Starting pool monitoring...\n');

  // Run initial monitor
  await monitor();

  // Set up interval
  setInterval(monitor, INTERVAL);
}

main();
