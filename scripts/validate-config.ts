#!/usr/bin/env bun

/**
 * Validate deployment configuration
 *
 * Usage:
 *   bun run scripts/validate-config.ts [testnet|mainnet]
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const NETWORK = (process.argv[2] || process.env.NETWORK || 'testnet') as 'testnet' | 'mainnet';

interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

function validatePoolConfig(poolsPath: string): ValidationResult {
  const result: ValidationResult = { valid: true, errors: [], warnings: [] };

  if (!existsSync(poolsPath)) {
    result.valid = false;
    result.errors.push(`Pool configuration not found: ${poolsPath}`);
    return result;
  }

  try {
    const pools = JSON.parse(readFileSync(poolsPath, 'utf-8'));

    if (!Array.isArray(pools)) {
      result.valid = false;
      result.errors.push('Pool configuration must be an array');
      return result;
    }

    if (pools.length === 0) {
      result.warnings.push('No pools configured');
    }

    pools.forEach((pool, i) => {
      if (!pool.coinType) {
        result.valid = false;
        result.errors.push(`Pool ${i}: Missing coinType`);
      }

      if (!pool.initialLiquidity) {
        result.valid = false;
        result.errors.push(`Pool ${i}: Missing initialLiquidity`);
      }

      // Validate coin type format
      if (pool.coinType && !pool.coinType.match(/^0x[a-fA-F0-9]+::[a-z_]+::[A-Z_]+$/)) {
        result.warnings.push(`Pool ${i}: coinType may not be in correct format`);
      }

      // Validate liquidity is a number
      if (pool.initialLiquidity && isNaN(Number(pool.initialLiquidity))) {
        result.valid = false;
        result.errors.push(`Pool ${i}: initialLiquidity must be a number`);
      }

      // Check for reasonable liquidity amounts
      const liquidity = Number(pool.initialLiquidity);
      if (liquidity < 1000000) {
        result.warnings.push(`Pool ${i}: Very low initial liquidity (< 1 MIST)`);
      }

      if (NETWORK === 'mainnet' && liquidity < 1000000000) {
        result.warnings.push(`Pool ${i}: Low liquidity for mainnet (< 1 SUI)`);
      }
    });
  } catch (error) {
    result.valid = false;
    result.errors.push(`Invalid JSON in pool config: ${error}`);
  }

  return result;
}

function validateBotConfig(botPath: string): ValidationResult {
  const result: ValidationResult = { valid: true, errors: [], warnings: [] };

  if (!existsSync(botPath)) {
    result.warnings.push(`Bot configuration not found: ${botPath}`);
    return result;
  }

  try {
    const config = JSON.parse(readFileSync(botPath, 'utf-8'));

    // Check required fields
    if (!config.strategy) {
      result.valid = false;
      result.errors.push('Missing strategy configuration');
    } else {
      if (typeof config.strategy.minProfitBps !== 'number') {
        result.valid = false;
        result.errors.push('strategy.minProfitBps must be a number');
      }

      if (config.strategy.minProfitBps < 1) {
        result.warnings.push('Very low minProfitBps (< 0.01%) - may execute unprofitable trades');
      }

      if (config.strategy.slippageTolerance > 500) {
        result.warnings.push('High slippage tolerance (> 5%) - risky for production');
      }
    }

    if (!config.dexes) {
      result.warnings.push('No DEX configuration found');
    }

    if (!config.monitoring) {
      result.warnings.push('No monitoring configuration found');
    }

  } catch (error) {
    result.valid = false;
    result.errors.push(`Invalid JSON in bot config: ${error}`);
  }

  return result;
}

function validateEnvironment(): ValidationResult {
  const result: ValidationResult = { valid: true, errors: [], warnings: [] };

  if (!process.env.SUI_PRIVATE_KEY) {
    result.warnings.push('SUI_PRIVATE_KEY not set in environment');
  }

  return result;
}

async function main() {
  console.log('✅ Validating Deployment Configuration');
  console.log('═══════════════════════════════════════');
  console.log(`Network: ${NETWORK}`);
  console.log();

  let allValid = true;
  const allErrors: string[] = [];
  const allWarnings: string[] = [];

  // 1. Validate pool configuration
  console.log('🔍 Validating pool configuration...');
  const poolsPath = join(process.cwd(), `config/pools.${NETWORK}.json`);
  const poolResult = validatePoolConfig(poolsPath);

  if (poolResult.valid) {
    console.log('   ✅ Pool config valid');
  } else {
    console.log('   ❌ Pool config invalid');
    allValid = false;
  }

  allErrors.push(...poolResult.errors);
  allWarnings.push(...poolResult.warnings);

  // 2. Validate bot configuration
  console.log('🔍 Validating bot configuration...');
  const botPath = join(process.cwd(), `config/bot.${NETWORK}.json`);
  const botResult = validateBotConfig(botPath);

  if (botResult.valid) {
    console.log('   ✅ Bot config valid');
  } else {
    console.log('   ❌ Bot config invalid');
    allValid = false;
  }

  allErrors.push(...botResult.errors);
  allWarnings.push(...botResult.warnings);

  // 3. Validate environment
  console.log('🔍 Validating environment...');
  const envResult = validateEnvironment();

  if (envResult.valid) {
    console.log('   ✅ Environment valid');
  } else {
    console.log('   ❌ Environment invalid');
    allValid = false;
  }

  allErrors.push(...envResult.errors);
  allWarnings.push(...envResult.warnings);

  // 4. Summary
  console.log('\n═══════════════════════════════════════');

  if (allErrors.length > 0) {
    console.log('\n❌ Errors:');
    allErrors.forEach(err => console.log(`   • ${err}`));
  }

  if (allWarnings.length > 0) {
    console.log('\n⚠️  Warnings:');
    allWarnings.forEach(warn => console.log(`   • ${warn}`));
  }

  if (allValid && allErrors.length === 0) {
    console.log('✅ Configuration is valid');

    if (allWarnings.length === 0) {
      console.log('   No warnings');
    }

    console.log('\n💡 Ready to deploy with:');
    console.log(`   task deploy:${NETWORK}`);
  } else {
    console.log('\n❌ Configuration has errors - please fix before deploying');
    process.exit(1);
  }
}

main();
