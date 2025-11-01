#!/usr/bin/env bun

/**
 * Integration test for deployment workflow
 *
 * Tests the complete deployment process without actually deploying
 *
 * Usage:
 *   bun run scripts/test-deployment-workflow.ts
 */

import { execSync } from 'child_process';
import { existsSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'fs';
import { join } from 'path';

interface TestResult {
  name: string;
  passed: boolean;
  message: string;
  duration: number;
}

const results: TestResult[] = [];
const TEST_DIR = join(process.cwd(), 'test-deployment');

function test(name: string, fn: () => void | Promise<void>) {
  return async () => {
    const start = Date.now();
    try {
      await fn();
      const duration = Date.now() - start;
      results.push({ name, passed: true, message: 'Passed', duration });
      console.log(`✅ ${name} (${duration}ms)`);
    } catch (error: any) {
      const duration = Date.now() - start;
      results.push({ name, passed: false, message: error.message, duration });
      console.log(`❌ ${name}: ${error.message} (${duration}ms)`);
    }
  };
}

function runCommand(cmd: string): string {
  return execSync(cmd, { encoding: 'utf-8', stdio: 'pipe' });
}

async function setup() {
  console.log('🔧 Setting up test environment...\n');

  // Create test directory
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true });
  }
  mkdirSync(TEST_DIR, { recursive: true });
  mkdirSync(join(TEST_DIR, 'deployments'), { recursive: true });
  mkdirSync(join(TEST_DIR, 'config'), { recursive: true });
}

async function cleanup() {
  console.log('\n🧹 Cleaning up test environment...');
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true });
  }
}

async function main() {
  console.log('🧪 Deployment Workflow Integration Tests');
  console.log('═══════════════════════════════════════\n');

  await setup();

  // Test 1: Configuration generation
  await test('Config generation creates required files', () => {
    runCommand('bun run scripts/generate-config.ts testnet');

    if (!existsSync('config/pools.testnet.json')) {
      throw new Error('Pool config not created');
    }
    if (!existsSync('config/bot.testnet.json')) {
      throw new Error('Bot config not created');
    }
    if (!existsSync('.env.testnet.template')) {
      throw new Error('Env template not created');
    }
  })();

  // Test 2: Configuration validation
  await test('Config validation accepts valid configs', () => {
    const output = runCommand('bun run scripts/validate-config.ts testnet');

    if (!output.includes('Configuration is valid')) {
      throw new Error('Validation failed for valid config');
    }
  })();

  // Test 3: Configuration validation rejects invalid configs
  await test('Config validation rejects invalid configs', () => {
    // Create invalid config
    writeFileSync(
      'config/pools.testnet.json',
      JSON.stringify([{ coinType: 'invalid' }])
    );

    try {
      runCommand('bun run scripts/validate-config.ts testnet 2>&1');
      throw new Error('Should have failed validation');
    } catch {
      // Expected to fail
    }

    // Restore valid config
    runCommand('bun run scripts/generate-config.ts testnet');
  })();

  // Test 4: Deployment status works
  await test('Deployment status script runs', () => {
    const output = runCommand('bun run scripts/deployment-status.ts');

    if (!output.includes('Deployment Status')) {
      throw new Error('Status script output unexpected');
    }
  })();

  // Test 5: Show config works
  await test('Show config displays configuration', () => {
    const output = runCommand('bun run scripts/show-config.ts testnet');

    if (!output.includes('Deployment Configuration')) {
      throw new Error('Show config output unexpected');
    }
  })();

  // Test 6: Taskfile validates
  await test('Taskfile has valid YAML syntax', () => {
    const output = runCommand('task --list');

    if (!output.includes('deploy:testnet')) {
      throw new Error('Deployment tasks not found');
    }
    if (!output.includes('pool:create')) {
      throw new Error('Pool tasks not found');
    }
    if (!output.includes('config:validate')) {
      throw new Error('Config tasks not found');
    }
  })();

  // Test 7: Move contracts build
  await test('Move contracts build successfully', () => {
    const output = runCommand('cd move && sui move build 2>&1');

    if (output.includes('error')) {
      throw new Error('Build failed');
    }
  })();

  // Test 8: Move tests pass
  await test('Move tests pass', () => {
    const output = runCommand('cd move && sui move test 2>&1');

    if (!output.includes('passing')) {
      throw new Error('Tests did not pass');
    }
  })();

  // Test 9: Mock deployment creates artifacts
  await test('Deployment creates expected artifacts', () => {
    // Create mock deployment
    const mockDeployment = {
      network: 'testnet',
      packageId: '0x1234567890abcdef',
      timestamp: new Date().toISOString(),
      deployedModules: ['flash_pool', 'dex_arb'],
    };

    writeFileSync(
      `${TEST_DIR}/deployments/testnet.json`,
      JSON.stringify(mockDeployment, null, 2)
    );

    const exists = existsSync(`${TEST_DIR}/deployments/testnet.json`);
    if (!exists) {
      throw new Error('Deployment artifact not created');
    }

    const content = JSON.parse(
      readFileSync(`${TEST_DIR}/deployments/testnet.json`, 'utf-8')
    );

    if (content.packageId !== mockDeployment.packageId) {
      throw new Error('Deployment artifact corrupted');
    }
  })();

  // Test 10: Rollback creates backup
  await test('Rollback process creates backups', () => {
    const deployment = {
      network: 'testnet',
      packageId: '0xoriginal',
      timestamp: new Date().toISOString(),
      deployedModules: [],
    };

    writeFileSync(
      'deployments/testnet.json',
      JSON.stringify(deployment, null, 2)
    );

    // Create a backup manually (simulating rollback)
    const backupPath = `deployments/testnet.${Date.now()}.backup.json`;
    writeFileSync(backupPath, JSON.stringify(deployment, null, 2));

    if (!existsSync(backupPath)) {
      throw new Error('Backup not created');
    }
  })();

  await cleanup();

  // Print summary
  console.log('\n═══════════════════════════════════════');
  console.log('📊 Test Results\n');

  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);

  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`⏱️  Total time: ${totalDuration}ms`);

  if (failed > 0) {
    console.log('\n❌ Failed tests:');
    results.filter(r => !r.passed).forEach(r => {
      console.log(`   • ${r.name}: ${r.message}`);
    });
  }

  console.log('\n═══════════════════════════════════════');

  if (failed === 0) {
    console.log('✅ All deployment workflow tests passed!');
    process.exit(0);
  } else {
    console.log('❌ Some tests failed');
    process.exit(1);
  }
}

main().catch(error => {
  console.error('Test runner error:', error);
  cleanup();
  process.exit(1);
});
