#!/usr/bin/env bun

/**
 * Interactive Financial Calculator for Hatch
 *
 * Usage:
 *   bun run scripts/calculate-financials.ts
 */

console.log('\n💰 Hatch Financial Calculator\n');
console.log('═'.repeat(60));

// Input parameters
const suiPrice = parseFloat(process.argv[2] || '3.50');
const monthlyFlashVolume = parseFloat(process.argv[3] || '15000000'); // $15M default
const dailyArbTrades = parseInt(process.argv[4] || '50');
const avgArbProfit = parseFloat(process.argv[5] || '25');
const operationLevel = process.argv[6] || 'bootstrap'; // minimal, bootstrap, professional

console.log('\n📊 Input Parameters:');
console.log(`   SUI Price: $${suiPrice.toFixed(2)}`);
console.log(`   Monthly Flash Loan Volume: $${(monthlyFlashVolume / 1e6).toFixed(1)}M`);
console.log(`   Daily Arbitrage Trades: ${dailyArbTrades}`);
console.log(`   Avg Arbitrage Profit: $${avgArbProfit}`);
console.log(`   Operation Level: ${operationLevel}`);

// Cost Calculations
console.log('\n\n💸 MONTHLY COSTS');
console.log('─'.repeat(60));

let infrastructureCost = 0;
let gasCost = 0;
let securityCost = 0;
let teamCost = 0;
let marketingCost = 0;

if (operationLevel === 'minimal') {
  infrastructureCost = 0;
  gasCost = 50;
  securityCost = 0;
  teamCost = 0;
  marketingCost = 0;
} else if (operationLevel === 'bootstrap') {
  infrastructureCost = 300;
  gasCost = 200;
  securityCost = 600;
  teamCost = 0;
  marketingCost = 500;
} else if (operationLevel === 'professional') {
  infrastructureCost = 300;
  gasCost = 1000;
  securityCost = 2000;
  teamCost = 8000;
  marketingCost = 5000;
}

// Calculate gas for arbitrage
const arbGasPerTrade = 0.002; // SUI
const monthlyArbGas = dailyArbTrades * 30 * arbGasPerTrade * suiPrice;
gasCost += monthlyArbGas;

console.log(`   Infrastructure: $${infrastructureCost.toFixed(2)}`);
console.log(`   Gas Costs: $${gasCost.toFixed(2)}`);
console.log(`   Security: $${securityCost.toFixed(2)}`);
console.log(`   Team: $${teamCost.toFixed(2)}`);
console.log(`   Marketing: $${marketingCost.toFixed(2)}`);

const totalCosts = infrastructureCost + gasCost + securityCost + teamCost + marketingCost;
console.log(`\n   📊 Total Monthly Costs: $${totalCosts.toFixed(2)}`);

// Revenue Calculations
console.log('\n\n💰 MONTHLY REVENUE');
console.log('─'.repeat(60));

// Flash loan revenue (0.05% fee)
const flashLoanRevenue = monthlyFlashVolume * 0.0005;
console.log(`   Flash Loan Fees (0.05%): $${flashLoanRevenue.toFixed(2)}`);
console.log(`     Volume: $${(monthlyFlashVolume / 1e6).toFixed(1)}M`);
console.log(`     Daily: $${(monthlyFlashVolume / 30 / 1000).toFixed(0)}K`);

// Arbitrage revenue
const arbSuccessRate = 0.80; // 80% success rate
const successfulTrades = dailyArbTrades * arbSuccessRate;
const dailyArbRevenue = successfulTrades * avgArbProfit;
const monthlyArbRevenue = dailyArbRevenue * 30;
console.log(`\n   Arbitrage Profits: $${monthlyArbRevenue.toFixed(2)}`);
console.log(`     Trades/day: ${dailyArbTrades} (${(arbSuccessRate * 100).toFixed(0)}% success)`);
console.log(`     Avg profit: $${avgArbProfit}/trade`);
console.log(`     Daily revenue: $${dailyArbRevenue.toFixed(2)}`);

const totalRevenue = flashLoanRevenue + monthlyArbRevenue;
console.log(`\n   📊 Total Monthly Revenue: $${totalRevenue.toFixed(2)}`);

// Profitability
console.log('\n\n📈 PROFITABILITY');
console.log('─'.repeat(60));

const monthlyProfit = totalRevenue - totalCosts;
const roi = ((monthlyProfit / totalCosts) * 100);
const profitMargin = ((monthlyProfit / totalRevenue) * 100);

console.log(`   Monthly Profit: $${monthlyProfit.toFixed(2)}`);
console.log(`   ROI: ${roi.toFixed(1)}%`);
console.log(`   Profit Margin: ${profitMargin.toFixed(1)}%`);

// Break-even
const breakEvenVolume = totalCosts / 0.0005;
console.log(`\n   Break-even Flash Loan Volume: $${(breakEvenVolume / 1e6).toFixed(2)}M`);
console.log(`   Current vs Break-even: ${((monthlyFlashVolume / breakEvenVolume) * 100).toFixed(0)}%`);

// Annual projection
console.log('\n\n📅 ANNUAL PROJECTION');
console.log('─'.repeat(60));

const annualRevenue = totalRevenue * 12;
const annualCosts = totalCosts * 12;
const annualProfit = monthlyProfit * 12;

console.log(`   Annual Revenue: $${(annualRevenue / 1000).toFixed(1)}K`);
console.log(`   Annual Costs: $${(annualCosts / 1000).toFixed(1)}K`);
console.log(`   Annual Profit: $${(annualProfit / 1000).toFixed(1)}K`);

// TVL Requirements
console.log('\n\n🏦 TVL REQUIREMENTS');
console.log('─'.repeat(60));

const dailyFlashVolume = monthlyFlashVolume / 30;
const utilizationRate = 0.10; // 10% utilization
const requiredPoolSize = dailyFlashVolume / utilizationRate;
const recommendedTVL = requiredPoolSize * 1.5; // 50% buffer

console.log(`   Daily Flash Volume: $${(dailyFlashVolume / 1000).toFixed(0)}K`);
console.log(`   Assumed Utilization: ${(utilizationRate * 100).toFixed(0)}%`);
console.log(`   Required Pool Size: $${(requiredPoolSize / 1e6).toFixed(1)}M`);
console.log(`   Recommended TVL: $${(recommendedTVL / 1e6).toFixed(1)}M`);

// Summary
console.log('\n\n' + '═'.repeat(60));
console.log('📊 SUMMARY');
console.log('═'.repeat(60));

if (monthlyProfit > 0) {
  console.log(`\n✅ PROFITABLE: $${monthlyProfit.toFixed(2)}/month`);
  console.log(`   - ROI: ${roi.toFixed(0)}%`);
  console.log(`   - Annual: $${(annualProfit / 1000).toFixed(0)}K`);
  console.log(`   - Margin: ${profitMargin.toFixed(0)}%`);
} else {
  console.log(`\n❌ NOT PROFITABLE: -$${Math.abs(monthlyProfit).toFixed(2)}/month`);
  console.log(`   - Need ${(breakEvenVolume / monthlyFlashVolume).toFixed(1)}x more volume`);
  console.log(`   - Or reduce costs by $${Math.abs(monthlyProfit).toFixed(2)}`);
}

console.log('\n💡 Recommendations:');
if (operationLevel === 'minimal') {
  console.log('   - Great for starting! Low risk, immediate profit.');
  console.log('   - Focus on growing flash loan volume.');
  console.log('   - Consider enabling arbitrage bot.');
} else if (operationLevel === 'bootstrap') {
  console.log('   - Good balance of cost vs capability.');
  console.log('   - Scale liquidity as volume grows.');
  console.log('   - Monitor ROI closely.');
} else {
  console.log('   - Ensure volume justifies team costs.');
  console.log('   - Focus on automation and efficiency.');
  console.log('   - Consider revenue diversification.');
}

console.log('\n📈 Next Steps:');
console.log('   1. Review FINANCIAL_MODEL.md for detailed analysis');
console.log('   2. Adjust parameters based on market conditions');
console.log('   3. Start with minimal operation and scale up');
console.log('   4. Monitor metrics: task monitor:pools');

console.log('\n' + '═'.repeat(60));
console.log('\n💡 Customize: bun run scripts/calculate-financials.ts <sui-price> <monthly-volume> <daily-arb-trades> <avg-arb-profit> <operation-level>');
console.log('   Example: bun run scripts/calculate-financials.ts 4.00 30000000 100 30 bootstrap\n');
