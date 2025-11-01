#!/usr/bin/env bun

/**
 * LP Returns Calculator for Hatch
 *
 * Calculate expected returns for liquidity providers
 *
 * Usage:
 *   bun run scripts/calculate-lp-returns.ts [lp-amount] [daily-volume] [lp-fee-share]
 */

console.log('\n💎 Hatch LP Returns Calculator\n');
console.log('═'.repeat(70));

const lpAmount = parseFloat(process.argv[2] || '10000'); // $10K default
const dailyVolume = parseFloat(process.argv[3] || '500000'); // $500K default
const lpFeeSharePercent = parseFloat(process.argv[4] || '80'); // 80% to LPs

console.log('\n📊 Input Parameters:');
console.log(`   LP Investment: $${lpAmount.toLocaleString()}`);
console.log(`   Expected Daily Flash Loan Volume: $${(dailyVolume / 1000).toFixed(0)}K`);
console.log(`   LP Fee Share: ${lpFeeSharePercent}%`);

// Flash loan fee is 0.05% = 0.0005
const flashLoanFeeRate = 0.0005;
const lpFeeShare = lpFeeSharePercent / 100;

// Calculate daily fees
const dailyTotalFees = dailyVolume * flashLoanFeeRate;
const dailyLpFees = dailyTotalFees * lpFeeShare;

// Assuming LP has 100% of pool (worst case for dilution)
// In reality, if there are other LPs, they split the fees proportionally
const dailyLpReturn = dailyLpFees; // If they are 100% of pool
const monthlyLpReturn = dailyLpReturn * 30;
const yearlyLpReturn = dailyLpReturn * 365;

// Calculate returns
const dailyReturnPercent = (dailyLpReturn / lpAmount) * 100;
const monthlyReturnPercent = (monthlyLpReturn / lpAmount) * 100;
const yearlyReturnPercent = (yearlyLpReturn / lpAmount) * 100;

console.log('\n\n💰 LP RETURNS (100% of Pool Liquidity)');
console.log('─'.repeat(70));

console.log('\n   Fee Breakdown:');
console.log(`     Total flash loan fees: $${dailyTotalFees.toFixed(2)}/day`);
console.log(`     LP share (${lpFeeSharePercent}%): $${dailyLpFees.toFixed(2)}/day`);
console.log(`     Protocol share (${100 - lpFeeSharePercent}%): $${(dailyTotalFees - dailyLpFees).toFixed(2)}/day`);

console.log('\n   Your Returns:');
console.log(`     Daily: $${dailyLpReturn.toFixed(2)} (${dailyReturnPercent.toFixed(3)}%)`);
console.log(`     Monthly: $${monthlyLpReturn.toFixed(2)} (${monthlyReturnPercent.toFixed(2)}%)`);
console.log(`     Yearly: $${yearlyLpReturn.toFixed(2)} (${yearlyReturnPercent.toFixed(1)}%)`);

console.log('\n   APY: ${yearlyReturnPercent.toFixed(0)}%');

// Calculate with different pool sizes (dilution scenarios)
console.log('\n\n📊 DILUTION SCENARIOS');
console.log('─'.repeat(70));
console.log('\nIf other LPs join, fees are split proportionally:\n');

const poolSizes = [lpAmount, lpAmount * 2, lpAmount * 5, lpAmount * 10];

poolSizes.forEach(totalPoolSize => {
  const yourShare = lpAmount / totalPoolSize;
  const yourDailyFees = dailyLpFees * yourShare;
  const yourMonthlyFees = yourDailyFees * 30;
  const yourMonthlyReturn = (yourMonthlyFees / lpAmount) * 100;
  const yourApy = (yourMonthlyFees * 12 / lpAmount) * 100;

  console.log(`   Total Pool: $${(totalPoolSize / 1000).toFixed(0)}K (your share: ${(yourShare * 100).toFixed(1)}%)`);
  console.log(`     Your monthly fees: $${yourMonthlyFees.toFixed(2)}`);
  console.log(`     Your monthly return: ${yourMonthlyReturn.toFixed(2)}%`);
  console.log(`     Your APY: ${yourApy.toFixed(0)}%\n`);
});

// Volume scenarios
console.log('\n\n📈 VOLUME SCENARIOS (100% of Pool)');
console.log('─'.repeat(70));

const volumeScenarios = [
  { label: 'Conservative', volume: dailyVolume * 0.5 },
  { label: 'Base Case', volume: dailyVolume },
  { label: 'Moderate', volume: dailyVolume * 2 },
  { label: 'Optimistic', volume: dailyVolume * 5 },
  { label: 'Moon', volume: dailyVolume * 10 },
];

volumeScenarios.forEach(({ label, volume }) => {
  const fees = volume * flashLoanFeeRate * lpFeeShare;
  const monthlyFees = fees * 30;
  const monthlyReturn = (monthlyFees / lpAmount) * 100;
  const apy = monthlyReturn * 12;

  console.log(`\n   ${label} ($${(volume / 1000).toFixed(0)}K/day volume):`);
  console.log(`     Daily fees: $${fees.toFixed(2)}`);
  console.log(`     Monthly fees: $${monthlyFees.toFixed(2)}`);
  console.log(`     Monthly return: ${monthlyReturn.toFixed(2)}%`);
  console.log(`     APY: ${apy.toFixed(0)}%`);
});

// Time to double investment
console.log('\n\n⏰ TIME TO DOUBLE INVESTMENT');
console.log('─'.repeat(70));

const monthsToDouble = 100 / monthlyReturnPercent;

console.log(`\n   At base case volume ($${(dailyVolume / 1000).toFixed(0)}K/day):`);
console.log(`     Monthly return: ${monthlyReturnPercent.toFixed(2)}%`);
console.log(`     Months to 2x: ${monthsToDouble.toFixed(1)} months`);
console.log(`     Months to 5x: ${(monthsToDouble * 2.32).toFixed(1)} months`);
console.log(`     Months to 10x: ${(monthsToDouble * 3.32).toFixed(1)} months`);

// Risk-adjusted returns
console.log('\n\n⚖️  RISK ASSESSMENT');
console.log('─'.repeat(70));

console.log('\n   ✅ Advantages:');
console.log('     - No impermanent loss (single-asset pool)');
console.log('     - No loan defaults (flash loans are atomic)');
console.log('     - Withdraw anytime (no lock period)');
console.log('     - Passive income (automated)');
console.log('     - Transparent on-chain');

console.log('\n   ⚠️  Risks:');
console.log('     - Smart contract risk (code bugs)');
console.log('     - Volume risk (lower than projected)');
console.log('     - Competition risk (other protocols)');
console.log('     - Platform risk (Sui network issues)');

console.log('\n   🛡️  Mitigations:');
console.log('     - Open source code (auditable)');
console.log('     - Testnet period (battle-tested)');
console.log('     - Start small (test with smaller amount)');
console.log('     - Monitor regularly (withdraw if needed)');

// Comparison with alternatives
console.log('\n\n📊 COMPARISON WITH ALTERNATIVES');
console.log('─'.repeat(70));

const alternatives = [
  { name: 'Staking SUI', apy: 3, risk: 'Low' },
  { name: 'DEX LP (stable pairs)', apy: 10, risk: 'Low-Medium' },
  { name: 'DEX LP (volatile pairs)', apy: 50, risk: 'High (IL)' },
  { name: 'Lending protocols', apy: 8, risk: 'Medium' },
  { name: 'Hatch Flash Loans', apy: yearlyReturnPercent, risk: 'Medium' },
];

console.log('\n');
alternatives.forEach(({ name, apy, risk }) => {
  const indicator = name.includes('Hatch') ? '👉' : '  ';
  console.log(`   ${indicator} ${name.padEnd(30)} ${apy.toFixed(0).padStart(4)}% APY    Risk: ${risk}`);
});

// Summary
console.log('\n\n' + '═'.repeat(70));
console.log('💎 SUMMARY');
console.log('═'.repeat(70));

console.log(`\n   Your Investment: $${lpAmount.toLocaleString()}`);
console.log(`   Expected APY: ${yearlyReturnPercent.toFixed(0)}%`);
console.log(`   Monthly Earnings: $${monthlyLpReturn.toFixed(2)}`);
console.log(`   Break-even Time: ${(lpAmount / monthlyLpReturn).toFixed(1)} months to recover capital`);

if (yearlyReturnPercent > 100) {
  console.log('\n   ✅ Excellent returns! Significantly above market alternatives.');
} else if (yearlyReturnPercent > 50) {
  console.log('\n   ✅ Very good returns! Competitive with high-yield DeFi.');
} else if (yearlyReturnPercent > 20) {
  console.log('\n   ✅ Good returns! Above traditional finance.');
} else {
  console.log('\n   ⚠️  Returns depend heavily on volume. May need higher volume.');
}

console.log('\n💡 Key Insights:');
console.log(`   - Returns scale linearly with volume`);
console.log(`   - Early LPs benefit from higher fee share`);
console.log(`   - No impermanent loss risk`);
console.log(`   - Withdraw anytime if returns don\'t meet expectations`);

console.log('\n🎯 To improve returns:');
console.log('   1. Participate during early LP bonus period (higher fee share)');
console.log('   2. Help promote protocol to increase volume');
console.log('   3. Provide liquidity in high-demand assets');
console.log('   4. Monitor and optimize based on actual volumes');

console.log('\n' + '═'.repeat(70));
console.log('\n💡 Customize: bun run scripts/calculate-lp-returns.ts <lp-amount> <daily-volume> <lp-fee-share>');
console.log('   Example: bun run scripts/calculate-lp-returns.ts 50000 1000000 90\n');
console.log('   (Calculates returns for $50K LP with $1M daily volume and 90% fee share)\n');
