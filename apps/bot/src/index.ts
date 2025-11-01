// Copyright (c) TortoiseOS
// SPDX-License-Identifier: MIT

import 'dotenv/config';
import pino from 'pino';
import { DexMonitor } from './monitor/dex-monitor';

const logger = pino({
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'HH:MM:ss',
    },
  },
});

/**
 * Main bot entry point
 */
async function main() {
  logger.info('🐢 Hatch Arbitrage Bot Starting...');
  logger.info('═══════════════════════════════════════════');

  // Get RPC URL from environment
  const rpcUrl =
    process.env.SUI_RPC_URL || 'https://fullnode.testnet.sui.io:443';

  logger.info(`📡 Connecting to Sui RPC: ${rpcUrl}`);

  try {
    // Initialize DEX monitor
    const monitor = new DexMonitor(rpcUrl);

    // Start monitoring
    await monitor.start();

    logger.info('✅ Bot is now monitoring for arbitrage opportunities');
    logger.info('═══════════════════════════════════════════');

    // Keep bot running
    process.on('SIGINT', () => {
      logger.info('\n🛑 Shutting down bot...');
      monitor.stop();
      process.exit(0);
    });

    process.on('SIGTERM', () => {
      logger.info('\n🛑 Shutting down bot...');
      monitor.stop();
      process.exit(0);
    });
  } catch (error) {
    logger.error('❌ Failed to start bot:', error);
    process.exit(1);
  }
}

// Run the bot
main().catch((error) => {
  logger.error('❌ Unhandled error:', error);
  process.exit(1);
});
