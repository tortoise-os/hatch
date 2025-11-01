#!/usr/bin/env bun

/**
 * Pre-deployment validation checklist
 *
 * Usage:
 *   bun run scripts/pre-deployment-check.ts [testnet|mainnet]
 */

import { execSync } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const NETWORK = (process.argv[2] || process.env.NETWORK || 'testnet') as 'testnet' | 'mainnet';

interface CheckResult {
  name: string;
  passed: boolean;
  message: string;
  required: boolean;
}

const results: CheckResult[] = [];

function check(name: string, passed: boolean, message: string, required: boolean = true) {
  results.push({ name, passed, message, required });
}

function runCommand(cmd: string): { success: boolean; output: string } {
  try {
    const output = execSync(cmd, { encoding: 'utf-8', stdio: 'pipe' });
    return { success: true, output };
  } catch (error: any) {
    return { success: false, output: error.message };
  }
}

async function main() {
  console.log('✅ Pre-Deployment Checklist');
  console.log('═══════════════════════════════════════');
  console.log(`Network: ${NETWORK}`);
  console.log(`Time: ${new Date().toLocaleString()}`);
  console.log('\n🔍 Running checks...\n');

  // 1. Environment checks
  console.log('📋 Environment Checks');
  console.log('─'.repeat(40));

  const privateKey = process.env.SUI_PRIVATE_KEY;
  check(
    'SUI_PRIVATE_KEY set',
    !!privateKey,
    privateKey ? 'Private key configured' : 'Private key not set in environment',
    true
  );

  const { success: suiInstalled } = runCommand('sui --version');
  check(
    'Sui CLI installed',
    suiInstalled,
    suiInstalled ? 'Sui CLI available' : 'Sui CLI not found',
    true
  );

  const { success: bunInstalled } = runCommand('bun --version');
  check(
    'Bun runtime installed',
    bunInstalled,
    bunInstalled ? 'Bun available' : 'Bun not found',
    true
  );

  // 2. Build checks
  console.log('\n🔨 Build Checks');
  console.log('─'.repeat(40));

  const { success: buildSuccess } = runCommand('cd move && sui move build 2>&1');
  check(
    'Move contracts build',
    buildSuccess,
    buildSuccess ? 'Contracts build successfully' : 'Build failed - check errors',
    true
  );

  // 3. Test checks
  console.log('\n🧪 Test Checks');
  console.log('─'.repeat(40));

  const { success: testSuccess, output: testOutput } = runCommand('cd move && sui move test 2>&1');

  if (testSuccess) {
    const testMatches = testOutput.match(/(\d+) passing/);
    const testCount = testMatches ? testMatches[1] : 'unknown';
    check('Move tests pass', true, `${testCount} tests passing`, true);
  } else {
    check('Move tests pass', false, 'Some tests failing', true);
  }

  // 4. Configuration checks
  console.log('\n⚙️  Configuration Checks');
  console.log('─'.repeat(40));

  const poolsConfig = join(process.cwd(), `config/pools.${NETWORK}.json`);
  check(
    'Pool configuration exists',
    existsSync(poolsConfig),
    existsSync(poolsConfig) ? 'Pool config found' : 'Run: task config:generate',
    false
  );

  const botConfig = join(process.cwd(), `config/bot.${NETWORK}.json`);
  check(
    'Bot configuration exists',
    existsSync(botConfig),
    existsSync(botConfig) ? 'Bot config found' : 'Run: task config:generate',
    false
  );

  // 5. Network checks
  console.log('\n📡 Network Checks');
  console.log('─'.repeat(40));

  const { success: envSet, output: activeEnv } = runCommand('sui client active-env 2>&1');
  const correctEnv = activeEnv.trim().toLowerCase() === NETWORK.toLowerCase();
  check(
    `Sui client on ${NETWORK}`,
    envSet && correctEnv,
    correctEnv ? `Active env: ${NETWORK}` : `Wrong network: ${activeEnv.trim()}`,
    true
  );

  const { success: hasGas, output: gasOutput } = runCommand('sui client gas --json 2>&1');
  if (hasGas) {
    try {
      const gasCoins = JSON.parse(gasOutput);
      const hasEnoughGas = gasCoins.length > 0;
      const totalGas = gasCoins.reduce((sum: number, coin: any) => sum + Number(coin.balance), 0);
      const minRequired = NETWORK === 'mainnet' ? 100000000000 : 10000000000; // 100 SUI mainnet, 10 SUI testnet

      check(
        'Sufficient gas',
        totalGas >= minRequired,
        `${(totalGas / 1e9).toFixed(2)} SUI available (min: ${(minRequired / 1e9).toFixed(0)} SUI)`,
        true
      );
    } catch {
      check('Sufficient gas', false, 'Could not parse gas coins', true);
    }
  } else {
    check('Sufficient gas', false, 'No gas coins found', true);
  }

  // 6. Security checks
  console.log('\n🔒 Security Checks');
  console.log('─'.repeat(40));

  const { success: auditSuccess } = runCommand('bun audit 2>&1');
  check(
    'No security vulnerabilities',
    auditSuccess,
    auditSuccess ? 'No vulnerabilities found' : 'Run: bun audit',
    NETWORK === 'mainnet'
  );

  // 7. Git checks
  console.log('\n📦 Version Control Checks');
  console.log('─'.repeat(40));

  const { success: gitClean, output: gitStatus } = runCommand('git status --porcelain 2>&1');
  const isClean = gitClean && gitStatus.trim() === '';
  check(
    'Git working tree clean',
    isClean,
    isClean ? 'No uncommitted changes' : 'Uncommitted changes present',
    NETWORK === 'mainnet'
  );

  const { success: hasCommit } = runCommand('git rev-parse HEAD 2>&1');
  check(
    'Git repository initialized',
    hasCommit,
    hasCommit ? 'Git repo initialized' : 'Not a git repository',
    false
  );

  // Print results
  console.log('\n═══════════════════════════════════════');
  console.log('📊 Results\n');

  let requiredPassed = 0;
  let requiredTotal = 0;
  let optionalPassed = 0;
  let optionalTotal = 0;

  results.forEach(result => {
    const icon = result.passed ? '✅' : '❌';
    const reqLabel = result.required ? '[REQUIRED]' : '[OPTIONAL]';

    console.log(`${icon} ${result.name} ${reqLabel}`);
    console.log(`   ${result.message}`);

    if (result.required) {
      requiredTotal++;
      if (result.passed) requiredPassed++;
    } else {
      optionalTotal++;
      if (result.passed) optionalPassed++;
    }
  });

  console.log('\n═══════════════════════════════════════');
  console.log(`\n📈 Required: ${requiredPassed}/${requiredTotal} passed`);
  console.log(`📊 Optional: ${optionalPassed}/${optionalTotal} passed`);

  const allRequiredPassed = requiredPassed === requiredTotal;

  if (allRequiredPassed) {
    console.log('\n✅ All required checks passed - ready to deploy!');
    console.log('\n💡 Next step:');
    console.log(`   task deploy:${NETWORK}`);
    process.exit(0);
  } else {
    console.log('\n❌ Some required checks failed - fix issues before deploying');
    console.log('\n💡 Review the failed checks above and address them');
    process.exit(1);
  }
}

main();
