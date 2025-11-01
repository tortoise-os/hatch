#!/usr/bin/env bun

/**
 * Revenue Projection Calculator for Hatch
 *
 * Usage:
 *   bun run scripts/project-revenue.ts [starting-volume] [growth-rate] [months]
 */

console.log('\n📈 Hatch Revenue Projection Calculator\n');
console.log('═'.repeat(70));

const startingVolume = parseFloat(process.argv[2] || '1000000'); // $1M default
const monthlyGrowthRate = parseFloat(process.argv[3] || '0.30'); // 30% default
const months = parseInt(process.argv[4] || '12'); // 12 months default

console.log('\n📊 Projection Parameters:');
console.log(`   Starting Monthly Volume: $${(startingVolume / 1e6).toFixed(1)}M`);
console.log(`   Monthly Growth Rate: ${(monthlyGrowthRate * 100).toFixed(0)}%`);
console.log(`   Projection Period: ${months} months`);

const flashLoanFee = 0.0005; // 0.05%

// Arbitrage assumptions
const dailyArbTrades = {
  month1: 5,
  month3: 50,
  month6: 200,
  month12: 500,
};

const avgArbProfit = 25; // $25 per trade
const arbSuccessRate = 0.80; // 80%

console.log('\n\n📅 MONTHLY PROJECTIONS');
console.log('─'.repeat(70));
console.log('Month | Flash Volume | Flash Rev | Arb Rev   | Total Rev | Cumulative');
console.log('─'.repeat(70));

let cumulativeRevenue = 0;
let currentVolume = startingVolume;

const projections = [];

for (let month = 1; month <= months; month++) {
  // Flash loan revenue
  const flashRevenue = currentVolume * flashLoanFee;

  // Arbitrage revenue (scales with time)
  let tradesPerDay = dailyArbTrades.month1;
  if (month >= 12) tradesPerDay = dailyArbTrades.month12;
  else if (month >= 6) tradesPerDay = dailyArbTrades.month6;
  else if (month >= 3) tradesPerDay = dailyArbTrades.month3;

  // Interpolate between milestones
  if (month < 3) {
    tradesPerDay = dailyArbTrades.month1 + ((dailyArbTrades.month3 - dailyArbTrades.month1) / 2) * ((month - 1) / 2);
  } else if (month < 6) {
    tradesPerDay = dailyArbTrades.month3 + ((dailyArbTrades.month6 - dailyArbTrades.month3) / 3) * ((month - 3) / 3);
  } else if (month < 12) {
    tradesPerDay = dailyArbTrades.month6 + ((dailyArbTrades.month12 - dailyArbTrades.month6) / 6) * ((month - 6) / 6);
  }

  const arbRevenue = tradesPerDay * avgArbProfit * arbSuccessRate * 30;

  // Total revenue
  const totalRevenue = flashRevenue + arbRevenue;
  cumulativeRevenue += totalRevenue;

  // Store for later analysis
  projections.push({
    month,
    volume: currentVolume,
    flashRevenue,
    arbRevenue,
    totalRevenue,
    cumulative: cumulativeRevenue,
  });

  // Print row
  console.log(
    `${month.toString().padStart(5)} | ` +
    `$${(currentVolume / 1e6).toFixed(1)}M`.padEnd(12) + ' | ' +
    `$${(flashRevenue / 1000).toFixed(1)}K`.padEnd(9) + ' | ' +
    `$${(arbRevenue / 1000).toFixed(1)}K`.padEnd(9) + ' | ' +
    `$${(totalRevenue / 1000).toFixed(1)}K`.padEnd(9) + ' | ' +
    `$${(cumulativeRevenue / 1000).toFixed(0)}K`
  );

  // Grow volume for next month
  currentVolume *= (1 + monthlyGrowthRate);
}

// Summary statistics
console.log('─'.repeat(70));

const firstMonth = projections[0];
const lastMonth = projections[projections.length - 1];
const avgMonthlyRevenue = cumulativeRevenue / months;

console.log('\n\n📊 SUMMARY STATISTICS');
console.log('─'.repeat(70));

console.log('\n💰 Revenue:');
console.log(`   First Month: $${(firstMonth.totalRevenue / 1000).toFixed(1)}K`);
console.log(`   Last Month: $${(lastMonth.totalRevenue / 1000).toFixed(1)}K`);
console.log(`   Average Monthly: $${(avgMonthlyRevenue / 1000).toFixed(1)}K`);
console.log(`   Total (${months} months): $${(cumulativeRevenue / 1000).toFixed(0)}K`);
console.log(`   Annualized (last month): $${(lastMonth.totalRevenue * 12 / 1e6).toFixed(2)}M`);

console.log('\n📈 Growth:');
console.log(`   Volume Growth: ${((lastMonth.volume / firstMonth.volume - 1) * 100).toFixed(0)}%`);
console.log(`   Revenue Growth: ${((lastMonth.totalRevenue / firstMonth.totalRevenue - 1) * 100).toFixed(0)}%`);
console.log(`   Monthly Rate: ${(monthlyGrowthRate * 100).toFixed(0)}%`);

// Breakdown
const totalFlashRevenue = projections.reduce((sum, p) => sum + p.flashRevenue, 0);
const totalArbRevenue = projections.reduce((sum, p) => sum + p.arbRevenue, 0);

console.log('\n💵 Revenue Breakdown:');
console.log(`   Flash Loans: $${(totalFlashRevenue / 1000).toFixed(0)}K (${((totalFlashRevenue / cumulativeRevenue) * 100).toFixed(0)}%)`);
console.log(`   Arbitrage: $${(totalArbRevenue / 1000).toFixed(0)}K (${((totalArbRevenue / cumulativeRevenue) * 100).toFixed(0)}%)`);

// Quarterly breakdown
if (months >= 3) {
  console.log('\n\n📅 QUARTERLY BREAKDOWN');
  console.log('─'.repeat(70));

  for (let quarter = 1; quarter <= Math.ceil(months / 3); quarter++) {
    const startMonth = (quarter - 1) * 3;
    const endMonth = Math.min(quarter * 3, months);
    const quarterProj = projections.slice(startMonth, endMonth);

    const quarterRevenue = quarterProj.reduce((sum, p) => sum + p.totalRevenue, 0);
    const avgVolume = quarterProj.reduce((sum, p) => sum + p.volume, 0) / quarterProj.length;

    console.log(`\n   Q${quarter} (Months ${startMonth + 1}-${endMonth}):`);
    console.log(`     Revenue: $${(quarterRevenue / 1000).toFixed(0)}K`);
    console.log(`     Avg Volume: $${(avgVolume / 1e6).toFixed(1)}M/month`);
    console.log(`     Monthly Avg: $${(quarterRevenue / quarterProj.length / 1000).toFixed(1)}K`);
  }
}

// Profitability scenarios
console.log('\n\n💰 PROFITABILITY SCENARIOS');
console.log('─'.repeat(70));

const costScenarios = [
  { name: 'Minimal', cost: 500 },
  { name: 'Bootstrap', cost: 2000 },
  { name: 'Professional', cost: 15000 },
];

costScenarios.forEach(scenario => {
  const monthBreakEven = projections.findIndex(p => p.totalRevenue >= scenario.cost);

  console.log(`\n   ${scenario.name} ($${scenario.cost}/month costs):`);

  if (monthBreakEven === -1) {
    console.log(`     Break-even: Not reached in ${months} months`);
  } else {
    console.log(`     Break-even: Month ${monthBreakEven + 1}`);

    const profitableMonths = projections.slice(monthBreakEven);
    const totalProfit = profitableMonths.reduce((sum, p) => sum + (p.totalRevenue - scenario.cost), 0);

    console.log(`     Profitable months: ${profitableMonths.length}`);
    console.log(`     Total profit: $${(totalProfit / 1000).toFixed(0)}K`);
    console.log(`     Final month profit: $${((lastMonth.totalRevenue - scenario.cost) / 1000).toFixed(1)}K`);
  }
});

// TVL requirements
console.log('\n\n🏦 TVL REQUIREMENTS');
console.log('─'.repeat(70));

const milestones = [
  { month: 1, proj: projections[0] },
  { month: 3, proj: projections[Math.min(2, projections.length - 1)] },
  { month: 6, proj: projections[Math.min(5, projections.length - 1)] },
  { month: 12, proj: projections[Math.min(11, projections.length - 1)] },
];

console.log('\nAssuming 10% daily pool utilization:\n');

milestones.forEach(({ month, proj }) => {
  if (proj) {
    const dailyVolume = proj.volume / 30;
    const requiredTVL = dailyVolume / 0.10; // 10% utilization

    console.log(`   Month ${month}: $${(requiredTVL / 1e6).toFixed(1)}M TVL`);
  }
});

// Recommendations
console.log('\n\n' + '═'.repeat(70));
console.log('💡 RECOMMENDATIONS');
console.log('═'.repeat(70));

if (startingVolume < 1000000) {
  console.log('\n⚠️  Low starting volume (<$1M/month)');
  console.log('   - Focus on user acquisition');
  console.log('   - Partner with other protocols');
  console.log('   - Offer incentives for early users');
}

if (monthlyGrowthRate < 0.20) {
  console.log('\n⚠️  Slow growth rate (<20%/month)');
  console.log('   - Increase marketing efforts');
  console.log('   - Improve product features');
  console.log('   - Analyze competition');
}

if (monthlyGrowthRate > 0.50) {
  console.log('\n✅ High growth rate (>50%/month)');
  console.log('   - Excellent! Plan for scaling');
  console.log('   - Increase liquidity proactively');
  console.log('   - Hire team for support');
}

console.log('\n📈 Growth Strategy:');
console.log('   1. Start conservative, prove product-market fit');
console.log('   2. Invest profits into marketing and development');
console.log('   3. Scale infrastructure as volume grows');
console.log('   4. Diversify revenue streams early');

console.log('\n🎯 Next Steps:');
console.log('   1. Set realistic volume targets for Month 1');
console.log('   2. Track actual vs projected monthly');
console.log('   3. Adjust strategy based on performance');
console.log('   4. Re-project quarterly with updated data');

console.log('\n' + '═'.repeat(70));
console.log('\n💡 Customize: bun run scripts/project-revenue.ts <starting-volume> <growth-rate> <months>');
console.log('   Example: bun run scripts/project-revenue.ts 5000000 0.40 18\n');
console.log('   (Projects $5M starting volume, 40% growth, 18 months)\n');
