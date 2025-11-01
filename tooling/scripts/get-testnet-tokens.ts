#!/usr/bin/env bun

/**
 * Helper script to find testnet token addresses
 *
 * Usage:
 *   bun run scripts/get-testnet-tokens.ts
 */

console.log('🔍 Testnet Token Addresses\n');
console.log('═══════════════════════════════════════\n');

console.log('📍 Native SUI:');
console.log('   Type: 0x2::sui::SUI');
console.log('   Always available on testnet\n');

console.log('📍 Common Testnet Tokens:\n');

console.log('1. USDC (Example testnet address):');
console.log('   0x5d4b302506645c37ff133b98c4b50a5ae14841659738d6d733d59d0d217a93bf::coin::COIN');
console.log('   Note: This is an example, verify on Sui Explorer\n');

console.log('2. Find more tokens:');
console.log('   • Sui Explorer: https://suiexplorer.com/?network=testnet');
console.log('   • Search for "coin" or "token"');
console.log('   • Look for verified contracts\n');

console.log('3. Create your own test token:');
console.log('   • Deploy a simple coin module');
console.log('   • Use for testing flash loans\n');

console.log('═══════════════════════════════════════\n');

console.log('💡 Quick Start:\n');
console.log('1. Update config/pools.testnet.json:');
console.log('   [');
console.log('     {');
console.log('       "coinType": "0x2::sui::SUI",');
console.log('       "initialLiquidity": "10000000000"  // 10 SUI');
console.log('     }');
console.log('   ]\n');

console.log('2. Validate: task config:validate\n');
console.log('3. Deploy: task setup:testnet\n');
