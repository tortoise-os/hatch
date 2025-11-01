#!/usr/bin/env bun

/**
 * Interactive quick start guide
 *
 * Usage:
 *   bun run scripts/quick-start.ts
 */

import { execSync } from 'child_process';
import { existsSync } from 'fs';

console.log('\n🚀 Hatch Quick Start Guide\n');
console.log('═══════════════════════════════════════\n');

// Check prerequisites
console.log('📋 Checking Prerequisites...\n');

const checks = {
  sui: false,
  bun: false,
  git: false,
  privateKey: false,
  config: false,
};

try {
  execSync('sui --version', { stdio: 'pipe' });
  checks.sui = true;
  console.log('✅ Sui CLI installed');
} catch {
  console.log('❌ Sui CLI not found');
  console.log('   Install: cargo install --locked --git https://github.com/MystenLabs/sui.git --branch mainnet sui\n');
}

try {
  execSync('bun --version', { stdio: 'pipe' });
  checks.bun = true;
  console.log('✅ Bun runtime installed');
} catch {
  console.log('❌ Bun not found');
  console.log('   Install: curl -fsSL https://bun.sh/install | bash\n');
}

try {
  execSync('git --version', { stdio: 'pipe' });
  checks.git = true;
  console.log('✅ Git installed');
} catch {
  console.log('❌ Git not found\n');
}

if (process.env.SUI_PRIVATE_KEY) {
  checks.privateKey = true;
  console.log('✅ SUI_PRIVATE_KEY set');
} else {
  console.log('⚠️  SUI_PRIVATE_KEY not set');
  console.log('   Export with: export SUI_PRIVATE_KEY="suiprivkey..."\n');
}

if (existsSync('config/pools.testnet.json')) {
  checks.config = true;
  console.log('✅ Configuration exists');
} else {
  console.log('⚠️  Configuration not generated');
  console.log('   Run: task config:generate testnet\n');
}

console.log('\n═══════════════════════════════════════\n');

// Determine status
const allChecks = Object.values(checks).every(v => v);
const criticalChecks = checks.sui && checks.bun;

if (allChecks) {
  console.log('✅ All prerequisites met! Ready to deploy.\n');
  console.log('🚀 Next Steps:\n');
  console.log('1. Fund your wallet:');
  console.log('   sui client active-address  # Get your address');
  console.log('   # Request testnet SUI from Discord faucet\n');
  console.log('2. Update pool configuration:');
  console.log('   # Edit config/pools.testnet.json with real token addresses\n');
  console.log('3. Validate configuration:');
  console.log('   task config:validate\n');
  console.log('4. Deploy to testnet:');
  console.log('   task setup:testnet\n');
} else if (criticalChecks) {
  console.log('⚠️  Some optional prerequisites missing.\n');
  console.log('You can proceed, but should address the warnings.\n');
  console.log('🚀 Next Steps:\n');
  console.log('1. Set SUI_PRIVATE_KEY:');
  console.log('   sui keytool export --key-identity <address>');
  console.log('   export SUI_PRIVATE_KEY="suiprivkey..."\n');
  console.log('2. Generate configuration:');
  console.log('   task config:generate testnet\n');
  console.log('3. Continue with deployment:\n');
  console.log('   task setup:testnet\n');
} else {
  console.log('❌ Critical prerequisites missing.\n');
  console.log('Please install missing tools and try again.\n');
  console.log('📚 See: LAUNCH_CHECKLIST.md for detailed setup\n');
}

console.log('═══════════════════════════════════════\n');
console.log('📖 Documentation:\n');
console.log('• Quick Start: LAUNCH_CHECKLIST.md');
console.log('• Full Guide: DEPLOYMENT.md');
console.log('• Operations: RUNBOOK.md');
console.log('• Monitoring: MONITORING.md\n');
console.log('💡 Get help: https://github.com/TortoiseOS/hatch/issues\n');
