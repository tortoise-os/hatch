#!/usr/bin/env bun

/**
 * Generate deployment configuration templates
 *
 * Usage:
 *   bun run scripts/generate-config.ts [testnet|mainnet]
 */

import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

const NETWORK = (process.argv[2] || process.env.NETWORK || 'testnet') as 'testnet' | 'mainnet';

interface PoolConfig {
  coinType: string;
  initialLiquidity: string;
  description?: string;
}

const TESTNET_POOLS: PoolConfig[] = [
  {
    coinType: '0x2::sui::SUI',
    initialLiquidity: '100000000000', // 100 SUI
    description: 'SUI native token pool for testing',
  },
  {
    coinType: '0x...::usdc::USDC', // Replace with actual USDC address
    initialLiquidity: '10000000000', // 10,000 USDC (6 decimals)
    description: 'USDC stablecoin pool',
  },
];

const MAINNET_POOLS: PoolConfig[] = [
  {
    coinType: '0x2::sui::SUI',
    initialLiquidity: '1000000000000', // 1,000 SUI
    description: 'SUI native token pool',
  },
  {
    coinType: '0x...::usdc::USDC', // Replace with actual USDC address
    initialLiquidity: '100000000000', // 100,000 USDC (6 decimals)
    description: 'USDC stablecoin pool - primary liquidity',
  },
];

interface BotConfig {
  flashPools: string[];
  dexes: {
    cetus: { enabled: boolean; pools: Record<string, string> };
    turbos: { enabled: boolean; pools: Record<string, string> };
  };
  strategy: {
    minProfitBps: number;
    maxFlashAmount: string;
    maxGasPrice: string;
    slippageTolerance: number;
  };
  monitoring: {
    priceCheckInterval: number;
    healthCheckInterval: number;
    alertThreshold: number;
  };
}

const TESTNET_BOT_CONFIG: BotConfig = {
  flashPools: [], // Will be populated after deployment
  dexes: {
    cetus: {
      enabled: true,
      pools: {
        'SUI/USDC': '0x...', // To be filled
      },
    },
    turbos: {
      enabled: true,
      pools: {
        'SUI/USDC': '0x...', // To be filled
      },
    },
  },
  strategy: {
    minProfitBps: 50, // 0.5% minimum profit
    maxFlashAmount: '100000000000', // 100 SUI max
    maxGasPrice: '1000000000', // 1 SUI max gas
    slippageTolerance: 100, // 1% slippage tolerance
  },
  monitoring: {
    priceCheckInterval: 5000, // 5 seconds
    healthCheckInterval: 60000, // 1 minute
    alertThreshold: 10000, // Alert if profit > 10 SUI
  },
};

const MAINNET_BOT_CONFIG: BotConfig = {
  flashPools: [],
  dexes: {
    cetus: {
      enabled: true,
      pools: {
        'SUI/USDC': '0x...', // To be filled with actual addresses
      },
    },
    turbos: {
      enabled: true,
      pools: {
        'SUI/USDC': '0x...', // To be filled with actual addresses
      },
    },
  },
  strategy: {
    minProfitBps: 30, // 0.3% minimum profit
    maxFlashAmount: '1000000000000', // 1,000 SUI max
    maxGasPrice: '5000000000', // 5 SUI max gas
    slippageTolerance: 50, // 0.5% slippage tolerance
  },
  monitoring: {
    priceCheckInterval: 1000, // 1 second
    healthCheckInterval: 30000, // 30 seconds
    alertThreshold: 100000, // Alert if profit > 100 SUI
  },
};

async function main() {
  console.log('⚙️  Generating Deployment Configuration');
  console.log('═══════════════════════════════════════');
  console.log(`Network: ${NETWORK}`);
  console.log();

  try {
    // 1. Create config directory
    const configDir = join(process.cwd(), 'config');
    if (!existsSync(configDir)) {
      mkdirSync(configDir, { recursive: true });
      console.log('✅ Created config directory');
    }

    // 2. Create deployments directory
    const deploymentsDir = join(process.cwd(), 'deployments');
    if (!existsSync(deploymentsDir)) {
      mkdirSync(deploymentsDir, { recursive: true });
      console.log('✅ Created deployments directory');
    }

    // 3. Generate pool configuration
    const poolsConfig = NETWORK === 'mainnet' ? MAINNET_POOLS : TESTNET_POOLS;
    const poolsPath = join(configDir, `pools.${NETWORK}.json`);

    writeFileSync(poolsPath, JSON.stringify(poolsConfig, null, 2));
    console.log(`✅ Generated pool config: ${poolsPath}`);

    // 4. Generate bot configuration
    const botConfig = NETWORK === 'mainnet' ? MAINNET_BOT_CONFIG : TESTNET_BOT_CONFIG;
    const botPath = join(configDir, `bot.${NETWORK}.json`);

    writeFileSync(botPath, JSON.stringify(botConfig, null, 2));
    console.log(`✅ Generated bot config: ${botPath}`);

    // 5. Generate .env template
    const envTemplate = `# Hatch ${NETWORK.toUpperCase()} Configuration
# Generated: ${new Date().toISOString()}

# Sui Network
NETWORK=${NETWORK}

# Wallet Configuration
SUI_PRIVATE_KEY=your_private_key_here

# API Configuration
API_PORT=3000
API_HOST=0.0.0.0

# Database (if using)
DATABASE_URL=postgresql://user:password@localhost:5432/hatch_${NETWORK}
REDIS_URL=redis://localhost:6379

# Monitoring
ENABLE_MONITORING=true
HEIMDAHL_ENDPOINT=https://heimdall.sui.io

# Bot Configuration
BOT_ENABLED=false
BOT_CONFIG_PATH=./config/bot.${NETWORK}.json

# Security
ENABLE_RATE_LIMITING=true
MAX_FLASH_AMOUNT=100000000000
REQUIRE_SIGNATURE=true

# Logging
LOG_LEVEL=info
LOG_FORMAT=json
`;

    const envPath = join(process.cwd(), `.env.${NETWORK}.template`);
    writeFileSync(envPath, envTemplate);
    console.log(`✅ Generated env template: ${envPath}`);

    console.log('\n═══════════════════════════════════════');
    console.log('✅ Configuration generated successfully');
    console.log('\n📝 Next steps:');
    console.log(`   1. Review and update: config/pools.${NETWORK}.json`);
    console.log(`   2. Review and update: config/bot.${NETWORK}.json`);
    console.log(`   3. Copy and configure: cp .env.${NETWORK}.template .env.${NETWORK}`);
    console.log(`   4. Validate config: task config:validate`);
    console.log(`   5. Deploy: task deploy:${NETWORK}`);

  } catch (error) {
    console.error('\n❌ Error:', error);
    process.exit(1);
  }
}

main();
