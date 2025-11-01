#!/usr/bin/env bun

/**
 * Show current deployment configuration
 *
 * Usage:
 *   bun run scripts/show-config.ts [testnet|mainnet]
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const NETWORK = (process.argv[2] || process.env.NETWORK || 'testnet') as 'testnet' | 'mainnet';

function displayConfig(title: string, path: string) {
  console.log(`\n${title}`);
  console.log('─'.repeat(50));

  if (!existsSync(path)) {
    console.log('❌ Not found');
    return;
  }

  try {
    const config = JSON.parse(readFileSync(path, 'utf-8'));
    console.log(JSON.stringify(config, null, 2));
  } catch (error) {
    console.log(`❌ Error reading file: ${error}`);
  }
}

async function main() {
  console.log('⚙️  Deployment Configuration');
  console.log('═'.repeat(50));
  console.log(`Network: ${NETWORK}`);

  // Show deployment info
  displayConfig(
    '📦 Deployment',
    join(process.cwd(), `deployments/${NETWORK}.json`)
  );

  // Show pool configuration
  displayConfig(
    '🏊 Pool Configuration',
    join(process.cwd(), `config/pools.${NETWORK}.json`)
  );

  // Show deployed pools
  displayConfig(
    '🏊 Deployed Pools',
    join(process.cwd(), `deployments/${NETWORK}-pools.json`)
  );

  // Show bot configuration
  displayConfig(
    '🤖 Bot Configuration',
    join(process.cwd(), `config/bot.${NETWORK}.json`)
  );

  console.log('\n═'.repeat(50));
  console.log('\n💡 Commands:');
  console.log('   Generate config: task config:generate');
  console.log('   Validate config: task config:validate');
  console.log('   Deploy: task deploy:testnet or task deploy:mainnet');
}

main();
