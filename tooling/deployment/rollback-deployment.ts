#!/usr/bin/env bun

/**
 * Rollback to a previous deployment
 *
 * Usage:
 *   bun run scripts/rollback-deployment.ts [testnet|mainnet] [backup-file]
 */

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';

const NETWORK = (process.argv[2] || process.env.NETWORK || 'testnet') as 'testnet' | 'mainnet';
const BACKUP_FILE = process.argv[3];

interface DeploymentInfo {
  network: string;
  packageId: string;
  timestamp: string;
  deployedModules: string[];
}

async function listBackups(): Promise<string[]> {
  const deploymentsDir = join(process.cwd(), 'deployments');

  if (!existsSync(deploymentsDir)) {
    return [];
  }

  const files = readdirSync(deploymentsDir);
  const backups = files.filter(f =>
    f.startsWith(`${NETWORK}.`) &&
    f.endsWith('.backup.json')
  );

  return backups.sort().reverse(); // Most recent first
}

async function createBackup(current: DeploymentInfo) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = join(
    process.cwd(),
    `deployments/${NETWORK}.${timestamp}.backup.json`
  );

  writeFileSync(backupPath, JSON.stringify(current, null, 2));
  console.log(`✅ Current deployment backed up to: ${backupPath}`);
}

async function main() {
  console.log('🔄 Deployment Rollback');
  console.log('═══════════════════════════════════════');
  console.log(`Network: ${NETWORK}`);
  console.log();

  try {
    // 1. Load current deployment
    const currentPath = join(process.cwd(), `deployments/${NETWORK}.json`);

    if (!existsSync(currentPath)) {
      console.error(`❌ No current deployment found for ${NETWORK}`);
      process.exit(1);
    }

    const current: DeploymentInfo = JSON.parse(
      readFileSync(currentPath, 'utf-8')
    );

    console.log('📦 Current Deployment:');
    console.log(`   Package ID: ${current.packageId}`);
    console.log(`   Deployed: ${new Date(current.timestamp).toLocaleString()}`);
    console.log();

    // 2. List available backups
    const backups = await listBackups();

    if (backups.length === 0) {
      console.error('❌ No backups available');
      console.log('\n💡 Backups are created automatically before rollback');
      console.log('   Cannot rollback without a previous deployment');
      process.exit(1);
    }

    // 3. Select backup
    let selectedBackup: string;

    if (BACKUP_FILE) {
      selectedBackup = BACKUP_FILE;
      if (!existsSync(join(process.cwd(), 'deployments', selectedBackup))) {
        console.error(`❌ Backup file not found: ${selectedBackup}`);
        process.exit(1);
      }
    } else {
      console.log('📋 Available backups:');
      backups.forEach((backup, i) => {
        console.log(`   ${i + 1}. ${backup}`);
      });
      console.log();

      // Use most recent backup
      selectedBackup = backups[0];
      console.log(`   Using most recent: ${selectedBackup}`);
    }

    const backupPath = join(process.cwd(), 'deployments', selectedBackup);
    const backup: DeploymentInfo = JSON.parse(
      readFileSync(backupPath, 'utf-8')
    );

    console.log();
    console.log('🔙 Rollback Target:');
    console.log(`   Package ID: ${backup.packageId}`);
    console.log(`   Deployed: ${new Date(backup.timestamp).toLocaleString()}`);
    console.log();

    // 4. Confirm rollback
    if (NETWORK === 'mainnet') {
      console.log('⚠️  WARNING: Rolling back MAINNET deployment');
      console.log('   This will restore the previous package ID');
      console.log('   Press Ctrl+C to cancel...');
      await new Promise(resolve => setTimeout(resolve, 5000));
    }

    // 5. Create backup of current
    console.log('\n💾 Backing up current deployment...');
    await createBackup(current);

    // 6. Restore backup
    console.log('\n🔄 Restoring previous deployment...');
    writeFileSync(currentPath, JSON.stringify(backup, null, 2));

    console.log('\n✅ Rollback complete!');
    console.log('═══════════════════════════════════════');
    console.log('\n📊 Restored Deployment:');
    console.log(`   Package ID: ${backup.packageId}`);
    console.log(`   Timestamp: ${new Date(backup.timestamp).toLocaleString()}`);
    console.log();

    // 7. Next steps
    console.log('⚠️  Important Next Steps:');
    console.log('   1. Update client configurations with old package ID');
    console.log('   2. Stop any running bots/services');
    console.log('   3. Verify package exists on-chain:');
    console.log(`      sui client object ${backup.packageId}`);
    console.log('   4. Test critical functionality');
    console.log('   5. Gradually restart services');
    console.log();
    console.log('💡 To verify:');
    console.log('   task deploy:verify');
    console.log('   task deploy:status');

  } catch (error) {
    console.error('\n❌ Rollback failed:', error);
    process.exit(1);
  }
}

main();
