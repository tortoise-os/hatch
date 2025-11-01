#!/usr/bin/env bun

/**
 * Break-even Calculator for Hatch
 *
 * Usage:
 *   bun run scripts/calculate-breakeven.ts [monthly-costs] [current-volume]
 */

console.log('\n⚖️  Hatch Break-Even Calculator\n');
console.log('═'.repeat(60));

const monthlyCosts = parseFloat(process.argv[2] || '1600'); // Default: bootstrap costs
const currentVolume = parseFloat(process.argv[3] || '15000000'); // Default: $15M

console.log('\n📊 Input Parameters:');
console.log(`   Monthly Operating Costs: $${monthlyCosts.toFixed(2)}`);
console.log(`   Current Flash Loan Volume: $${(currentVolume / 1e6).toFixed(1)}M/month`);

// Flash loan fee is 0.05% = 0.0005
const flashLoanFee = 0.0005;

// Calculate break-even volume
const breakEvenVolume = monthlyCosts / flashLoanFee;

console.log('\n\n💰 FLASH LOAN BREAK-EVEN');
console.log('─'.repeat(60));

console.log(`   Flash Loan Fee: ${(flashLoanFee * 100).toFixed(3)}% (${flashLoanFee * 10000} basis points)`);
console.log(`   Break-even Volume: $${(breakEvenVolume / 1e6).toFixed(2)}M/month`);
console.log(`   Break-even Daily: $${(breakEvenVolume / 30 / 1000).toFixed(0)}K/day`);

// Current status
const currentRevenue = currentVolume * flashLoanFee;
const currentProfit = currentRevenue - monthlyCosts;
const percentOfBreakEven = (currentVolume / breakEvenVolume) * 100;

console.log('\n\n📈 CURRENT STATUS');
console.log('─'.repeat(60));

console.log(`   Current Volume: $${(currentVolume / 1e6).toFixed(1)}M/month`);
console.log(`   Current Revenue: $${currentRevenue.toFixed(2)}/month`);
console.log(`   Current Costs: $${monthlyCosts.toFixed(2)}/month`);

if (currentProfit >= 0) {
  console.log(`   ✅ Current Profit: $${currentProfit.toFixed(2)}/month`);
  console.log(`   Status: ${percentOfBreakEven.toFixed(0)}% above break-even`);
} else {
  console.log(`   ❌ Current Loss: $${Math.abs(currentProfit).toFixed(2)}/month`);
  console.log(`   Status: ${percentOfBreakEven.toFixed(0)}% of break-even volume`);
}

// Volume needed for profitability targets
console.log('\n\n🎯 PROFITABILITY TARGETS');
console.log('─'.repeat(60));

const targets = [
  { profit: 1000, label: 'Modest' },
  { profit: 5000, label: 'Good' },
  { profit: 10000, label: 'Great' },
  { profit: 50000, label: 'Excellent' },
  { profit: 100000, label: 'Outstanding' },
];

targets.forEach(({ profit, label }) => {
  const targetRevenue = monthlyCosts + profit;
  const targetVolume = targetRevenue / flashLoanFee;

  console.log(`\n   ${label} ($${(profit / 1000).toFixed(0)}K profit/month):`);
  console.log(`     Required Volume: $${(targetVolume / 1e6).toFixed(1)}M/month`);
  console.log(`     Daily Volume: $${(targetVolume / 30 / 1000).toFixed(0)}K/day`);
  console.log(`     vs Current: ${(currentVolume >= targetVolume ? '✅' : '❌')} ${((currentVolume / targetVolume) * 100).toFixed(0)}%`);
});

// Time to break-even
if (currentProfit < 0) {
  console.log('\n\n⏱️  TIME TO BREAK-EVEN');
  console.log('─'.repeat(60));

  const volumeDeficit = breakEvenVolume - currentVolume;

  // Assume different growth rates
  const growthScenarios = [
    { rate: 0.10, label: 'Conservative (10%/month)' },
    { rate: 0.25, label: 'Moderate (25%/month)' },
    { rate: 0.50, label: 'Aggressive (50%/month)' },
    { rate: 1.00, label: 'Rapid (100%/month)' },
  ];

  growthScenarios.forEach(({ rate, label }) => {
    let months = 0;
    let volume = currentVolume;

    while (volume < breakEvenVolume && months < 24) {
      volume *= (1 + rate);
      months++;
    }

    if (months < 24) {
      console.log(`   ${label}: ${months} month${months === 1 ? '' : 's'}`);
    } else {
      console.log(`   ${label}: >24 months (may need cost reduction)`);
    }
  });
}

// Cost reduction scenarios
console.log('\n\n💸 COST REDUCTION SCENARIOS');
console.log('─'.repeat(60));

const costReductions = [10, 25, 50, 75];

costReductions.forEach(percent => {
  const reducedCosts = monthlyCosts * (1 - percent / 100);
  const newBreakEven = reducedCosts / flashLoanFee;

  console.log(`\n   ${percent}% cost reduction ($${reducedCosts.toFixed(0)}/month):`);
  console.log(`     New break-even: $${(newBreakEven / 1e6).toFixed(2)}M/month`);
  console.log(`     vs Current: ${(currentVolume >= newBreakEven ? '✅ Profitable' : `❌ Need ${((newBreakEven / currentVolume - 1) * 100).toFixed(0)}% more volume`)}`);
});

// TVL requirements
console.log('\n\n🏦 TVL REQUIREMENTS FOR BREAK-EVEN');
console.log('─'.repeat(60));

const utilizationRates = [0.05, 0.10, 0.20, 0.30];

utilizationRates.forEach(rate => {
  const dailyBreakEvenVolume = breakEvenVolume / 30;
  const requiredTVL = dailyBreakEvenVolume / rate;

  console.log(`   ${(rate * 100).toFixed(0)}% utilization: $${(requiredTVL / 1e6).toFixed(1)}M TVL`);
});

// Summary
console.log('\n\n' + '═'.repeat(60));
console.log('📊 SUMMARY');
console.log('═'.repeat(60));

if (currentProfit >= 0) {
  console.log('\n✅ Already profitable!');
  console.log(`   Current profit: $${currentProfit.toFixed(2)}/month`);
  console.log(`   Above break-even by: ${((currentVolume / breakEvenVolume - 1) * 100).toFixed(0)}%`);
  console.log('\n💡 Focus on scaling volume to increase profits.');
} else {
  console.log('\n⚠️  Not yet profitable');
  console.log(`   Current loss: $${Math.abs(currentProfit).toFixed(2)}/month`);
  console.log(`   Need: ${((breakEvenVolume / currentVolume - 1) * 100).toFixed(0)}% more volume`);
  console.log('\n💡 Options:');
  console.log('   1. Grow volume (marketing, partnerships)');
  console.log('   2. Reduce costs (optimize operations)');
  console.log('   3. Add revenue streams (arbitrage bot)');
}

console.log('\n📈 Key Metrics:');
console.log(`   Break-even Volume: $${(breakEvenVolume / 1e6).toFixed(2)}M/month`);
console.log(`   Current Volume: $${(currentVolume / 1e6).toFixed(1)}M/month (${percentOfBreakEven.toFixed(0)}%)`);
console.log(`   Monthly Costs: $${monthlyCosts.toFixed(2)}`);

console.log('\n' + '═'.repeat(60));
console.log('\n💡 Customize: bun run scripts/calculate-breakeven.ts <monthly-costs> <current-volume>');
console.log('   Example: bun run scripts/calculate-breakeven.ts 5000 20000000\n');
