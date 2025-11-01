#!/usr/bin/env bun

/**
 * Get detailed information about a flash pool
 *
 * Usage:
 *   bun run scripts/pool-info.ts <pool-id> [network]
 */

import { SuiClient, getFullnodeUrl } from '@mysten/sui.js/client';

const POOL_ID = process.argv[2];
const NETWORK = (process.argv[3] || process.env.NETWORK || 'testnet') as 'testnet' | 'mainnet';

async function main() {
  if (!POOL_ID) {
    console.error('❌ Pool ID required');
    console.log('\nUsage: bun run scripts/pool-info.ts <pool-id> [network]');
    process.exit(1);
  }

  console.log('🏊 Flash Pool Information');
  console.log('═══════════════════════════════════════');
  console.log(`Network: ${NETWORK}`);
  console.log(`Pool ID: ${POOL_ID}`);
  console.log();

  try {
    const client = new SuiClient({ url: getFullnodeUrl(NETWORK) });

    // Fetch pool object
    const pool = await client.getObject({
      id: POOL_ID,
      options: {
        showContent: true,
        showOwner: true,
        showType: true,
      },
    });

    if (!pool.data) {
      console.error('❌ Pool not found');
      process.exit(1);
    }

    console.log('📊 Pool Details:');
    console.log(`   Type: ${pool.data.type}`);
    console.log(`   Owner: ${pool.data.owner}`);

    if (pool.data.content && 'fields' in pool.data.content) {
      const fields = pool.data.content.fields as any;

      console.log('\n💰 Liquidity:');
      console.log(`   Balance: ${fields.balance || 'N/A'}`);
      console.log(`   Total Borrowed: ${fields.total_borrowed || 'N/A'}`);
      console.log(`   Total Fees: ${fields.total_fees || 'N/A'}`);

      console.log('\n⚙️  Configuration:');
      console.log(`   Fee BPS: ${fields.fee_bps || 'N/A'}`);
      console.log(`   Paused: ${fields.paused || 'false'}`);

      if (fields.stats) {
        console.log('\n📈 Statistics:');
        console.log(`   Total Loans: ${fields.stats.total_loans || 'N/A'}`);
        console.log(`   Total Volume: ${fields.stats.total_volume || 'N/A'}`);
      }
    }

    // Get dynamic fields if any
    console.log('\n🔍 Dynamic Fields:');
    const dynamicFields = await client.getDynamicFields({
      parentId: POOL_ID,
    });

    if (dynamicFields.data.length > 0) {
      dynamicFields.data.forEach((field, i) => {
        console.log(`   ${i + 1}. ${field.name}`);
      });
    } else {
      console.log('   None');
    }

    console.log('\n═══════════════════════════════════════');

  } catch (error) {
    console.error('\n❌ Error:', error);
    process.exit(1);
  }
}

main();
