# Hatch Deployment Guide

Complete guide for deploying Hatch flash loan and arbitrage protocol to Sui testnet and mainnet.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Configuration](#configuration)
- [Deployment Steps](#deployment-steps)
- [Post-Deployment Setup](#post-deployment-setup)
- [Verification](#verification)
- [Production Checklist](#production-checklist)
- [Monitoring](#monitoring)
- [Maintenance](#maintenance)
- [Troubleshooting](#troubleshooting)
- [Rollback Procedures](#rollback-procedures)

## Prerequisites

### System Requirements

- **Bun Runtime**: v1.0+ (`curl -fsSL https://bun.sh/install | bash`)
- **Sui CLI**: Latest version (`cargo install --locked --git https://github.com/MystenLabs/sui.git --branch mainnet sui`)
- **Node.js**: v18+ (for compatibility)
- **Git**: For version control

### Wallet Setup

1. **Create or import a Sui wallet:**
   ```bash
   # Create new wallet
   sui client new-address ed25519

   # Or import existing
   sui client import <private-key> ed25519
   ```

2. **Fund your wallet:**
   - **Testnet**: Get testnet SUI from [Sui Faucet](https://discord.com/channels/916379725201563759/971488439931392130)
   - **Mainnet**: Transfer production funds (minimum 100 SUI recommended for deployment + gas)

3. **Export private key:**
   ```bash
   sui keytool export --key-identity <address>
   ```

### Environment Configuration

1. **Set up environment variables:**
   ```bash
   export SUI_PRIVATE_KEY="your_private_key_here"
   export NETWORK="testnet"  # or "mainnet"
   ```

2. **Verify Sui configuration:**
   ```bash
   sui client active-env
   sui client gas
   ```

## Quick Start

### Testnet Deployment (Full Flow)

```bash
# 1. Generate configuration
task config:generate testnet

# 2. Review and update configs
# Edit: config/pools.testnet.json
# Edit: config/bot.testnet.json

# 3. Validate configuration
task config:validate

# 4. Deploy everything (contracts + pools)
task setup:testnet

# 5. Verify deployment
task deploy:verify

# 6. Check status
task deploy:status
```

### Mainnet Deployment (Full Flow)

```bash
# 1. Generate configuration
task config:generate mainnet

# 2. Review and update configs
# Edit: config/pools.mainnet.json
# Edit: config/bot.mainnet.json

# 3. Run security audit
task audit

# 4. Validate configuration
task config:validate

# 5. Deploy everything (includes 5-second safety delay)
task setup:mainnet

# 6. Verify deployment
task deploy:verify

# 7. Monitor
task deploy:status
```

## Configuration

### Pool Configuration

Edit `config/pools.{network}.json`:

```json
[
  {
    "coinType": "0x2::sui::SUI",
    "initialLiquidity": "100000000000",
    "description": "SUI native token pool"
  },
  {
    "coinType": "0x...",
    "initialLiquidity": "10000000000",
    "description": "USDC stablecoin pool"
  }
]
```

**Important Notes:**
- `coinType`: Full type identifier (e.g., `0x2::sui::SUI`)
- `initialLiquidity`: Amount in smallest unit (MIST for SUI, wei-equivalent for tokens)
- Ensure wallet has sufficient balance for all pools

### Bot Configuration

Edit `config/bot.{network}.json`:

```json
{
  "strategy": {
    "minProfitBps": 50,        // 0.5% minimum profit
    "maxFlashAmount": "100000000000",
    "maxGasPrice": "1000000000",
    "slippageTolerance": 100   // 1%
  },
  "monitoring": {
    "priceCheckInterval": 5000,
    "healthCheckInterval": 60000,
    "alertThreshold": 10000
  }
}
```

**Recommended Values:**

| Parameter | Testnet | Mainnet | Description |
|-----------|---------|---------|-------------|
| `minProfitBps` | 50 (0.5%) | 30 (0.3%) | Minimum profit to execute trade |
| `maxFlashAmount` | 100 SUI | 1000 SUI | Maximum flash loan size |
| `slippageTolerance` | 100 (1%) | 50 (0.5%) | Maximum acceptable slippage |
| `priceCheckInterval` | 5000ms | 1000ms | How often to check prices |

### Environment Variables

Copy and configure environment template:

```bash
cp .env.testnet.template .env.testnet
# or
cp .env.mainnet.template .env.mainnet
```

Required variables:
```bash
NETWORK=testnet
SUI_PRIVATE_KEY=suiprivkey...
API_PORT=3000
BOT_ENABLED=false  # Enable after testing
```

## Deployment Steps

### Step 1: Pre-Deployment Checks

```bash
# Run comprehensive checks
task deploy:check
```

This validates:
- ✅ Move contracts build successfully
- ✅ All tests pass (40/40)
- ✅ No security vulnerabilities
- ✅ Dependencies are up to date

### Step 2: Deploy Contracts

**Testnet:**
```bash
task deploy:testnet
```

**Mainnet:**
```bash
task deploy:mainnet
# ⚠️ Includes 5-second safety delay
```

The deployment process:
1. Switches to target network
2. Builds Move contracts
3. Publishes package
4. Extracts package ID and object IDs
5. Saves deployment info to `deployments/{network}.json`
6. Displays created objects

**Output Example:**
```
✅ Deployment successful!
═══════════════════════════════════════
📦 Package ID: 0xabcd...
📝 Created objects:
  - 0x2::package::UpgradeCap: 0x1234...
  - hatch::flash_pool::Registry: 0x5678...
```

### Step 3: Verify Deployment

```bash
task deploy:verify
```

Verifies:
- Package exists on-chain
- All modules are accessible
- Registry objects created
- No deployment errors

### Step 4: Create Flash Pools

**Option A: Create all configured pools**
```bash
task pool:create:all
```

**Option B: Create individual pool**
```bash
task pool:create -- 0x2::sui::SUI 100000000000
```

### Step 5: Verify Pools

```bash
# List all pools
task pool:list

# Check specific pool
task pool:info -- <pool-id>
```

## Post-Deployment Setup

### 1. Fund Flash Pools

Add additional liquidity to pools:

```bash
task pool:add-liquidity -- <pool-id> <amount>
```

**Recommended Initial Liquidity:**

| Network | SUI Pool | USDC Pool |
|---------|----------|-----------|
| Testnet | 100 SUI | 10,000 USDC |
| Mainnet | 1,000 SUI | 100,000 USDC |

### 2. Configure Arbitrage Bot

Update bot configuration with deployed pool IDs:

```bash
# Show current config
task config:show

# Update config/bot.{network}.json with:
# - Flash pool IDs
# - DEX pool addresses
# - Strategy parameters
```

### 3. Test Flash Loans

```bash
# Test basic borrow/repay
bun run scripts/test-flash-borrow.ts <pool-id>
```

### 4. Start Monitoring

```bash
# View deployment status
task deploy:status

# Monitor pools
task pool:list
```

## Verification

### Contract Verification Checklist

- [ ] Package exists on-chain
- [ ] All modules accessible
- [ ] Flash pools created
- [ ] Pool balances correct
- [ ] Fee parameters correct (0.05% = 5 bps)
- [ ] Registry initialized

### Pool Verification Checklist

For each pool:
- [ ] Pool ID saved to `deployments/{network}-pools.json`
- [ ] Initial liquidity deposited
- [ ] Pool not paused
- [ ] Fee rate correct
- [ ] Can query pool state

### Integration Verification

```bash
# Test flash loan
bun run scripts/test-flash-borrow.ts <pool-id>

# Test arbitrage simulation
bun run scripts/simulate-arbitrage.ts
```

## Production Checklist

### Security Audit

- [ ] Smart contracts reviewed
- [ ] All tests passing (40/40 tests)
- [ ] No compiler warnings (only expected lints)
- [ ] Dependencies audited (`task audit`)
- [ ] Private keys secured
- [ ] Access controls verified

### Configuration

- [ ] Network settings validated
- [ ] Pool configurations reviewed
- [ ] Bot parameters tuned
- [ ] Gas limits appropriate
- [ ] Slippage tolerances set
- [ ] Monitoring enabled

### Infrastructure

- [ ] API server deployed
- [ ] Database configured (if used)
- [ ] Redis configured (if used)
- [ ] Monitoring dashboard setup
- [ ] Alerting configured
- [ ] Backup procedures in place

### Testing

- [ ] Unit tests pass
- [ ] Integration tests pass
- [ ] E2E tests pass on testnet
- [ ] Flash loan tested
- [ ] Arbitrage simulation tested
- [ ] Error handling verified

### Documentation

- [ ] Deployment recorded
- [ ] Pool IDs documented
- [ ] API endpoints documented
- [ ] Runbooks created
- [ ] Team trained
- [ ] Emergency procedures defined

## Monitoring

### Real-time Monitoring

```bash
# Check deployment status
task deploy:status

# List pools and their state
task pool:list

# Monitor specific pool
watch -n 5 task pool:info -- <pool-id>
```

### Key Metrics to Monitor

**Flash Pools:**
- Total liquidity
- Utilization rate
- Fee revenue
- Number of loans
- Failed transactions

**Arbitrage Bot:**
- Profit/loss
- Success rate
- Gas usage
- Execution time
- Error rate

**System Health:**
- Transaction success rate
- Gas costs
- Network latency
- API response times

### Alerting Thresholds

Set up alerts for:
- Pool liquidity < 10% of initial
- Failed transactions > 5%
- Profit margin < min threshold
- Gas price > max threshold
- System errors

## Maintenance

### Regular Tasks

**Daily:**
- Check pool liquidity levels
- Review arbitrage profitability
- Monitor gas costs
- Check for errors

**Weekly:**
- Review fee revenue
- Analyze arbitrage patterns
- Update bot parameters
- Security scan

**Monthly:**
- Full security audit
- Dependency updates
- Performance optimization
- Backup verification

### Updating Pool Liquidity

```bash
# Add liquidity
task pool:add-liquidity -- <pool-id> <amount>

# Check new balance
task pool:info -- <pool-id>
```

### Upgrading Contracts

Sui supports package upgrades. To upgrade:

1. Update Move code
2. Build and test thoroughly
3. Publish upgrade
4. Verify upgrade successful
5. Update client code

```bash
# Build new version
task move:build

# Publish upgrade (requires UpgradeCap)
sui client upgrade --gas-budget 100000000
```

## Troubleshooting

### Common Issues

**Issue: Deployment fails with "Insufficient gas"**
```bash
# Solution: Increase gas budget
sui client publish --gas-budget 200000000
```

**Issue: Pool creation fails**
```bash
# Check wallet balance
sui client gas

# Verify network connectivity
sui client active-env

# Check deployment exists
cat deployments/{network}.json
```

**Issue: Flash loan fails**
```bash
# Check pool liquidity
task pool:info -- <pool-id>

# Verify flash amount < pool balance
# Ensure repayment includes fee (amount * 1.0005)
```

**Issue: Cannot find deployed package**
```bash
# Verify deployment
task deploy:verify

# Check network setting
echo $NETWORK

# View deployment info
task config:show
```

### Error Messages

| Error | Cause | Solution |
|-------|-------|----------|
| `EInsufficientLiquidity` | Pool balance too low | Add liquidity |
| `ERepaymentTooLow` | Fee not included | Add 0.05% fee |
| `EInvalidLeverage` | Leverage out of range | Use 1.5x-5x |
| `EUnauthorized` | Wrong caller | Use position owner |

### Getting Help

1. Check logs: `task docker:logs`
2. Review documentation: `docs/`
3. Check GitHub issues: https://github.com/TortoiseOS/hatch/issues
4. Community support: Discord/Telegram

## Rollback Procedures

### Emergency Pause

If issues detected:

```bash
# Pause bot
# Stop bot process or set BOT_ENABLED=false

# Pause pools (if pause functionality available)
# Call pause function via Sui CLI
```

### Reverting Deployment

1. **Stop all services**
   ```bash
   # Stop bot
   task bot:stop

   # Stop API
   pkill -f "bun run dev"
   ```

2. **Document issue**
   - Record error messages
   - Note affected transactions
   - Save logs

3. **Communicate**
   - Notify team
   - Update status page
   - Inform users if needed

4. **Restore previous state**
   ```bash
   # Use previous deployment
   cp deployments/{network}.json.backup deployments/{network}.json

   # Or redeploy from earlier commit
   git checkout <previous-commit>
   task deploy:testnet
   ```

### Recovery Checklist

- [ ] Identify root cause
- [ ] Stop affected services
- [ ] Secure funds if necessary
- [ ] Document incident
- [ ] Implement fix
- [ ] Test fix thoroughly
- [ ] Gradual rollout
- [ ] Monitor closely
- [ ] Post-mortem review

## Next Steps After Deployment

### Testnet

1. **Test all functionality**
   - Flash loans
   - Arbitrage execution
   - Pool management
   - Error handling

2. **Optimize parameters**
   - Min profit thresholds
   - Gas limits
   - Slippage tolerance

3. **Monitor for issues**
   - Run for 1-2 weeks
   - Collect metrics
   - Fix bugs

4. **Prepare for mainnet**
   - Security audit
   - Load testing
   - Documentation review

### Mainnet

1. **Start conservative**
   - Low liquidity initially
   - High profit thresholds
   - Manual approvals

2. **Gradual scaling**
   - Increase liquidity slowly
   - Lower thresholds gradually
   - Enable automation

3. **Continuous monitoring**
   - 24/7 monitoring
   - Alert system
   - On-call rotation

4. **Regular optimization**
   - Parameter tuning
   - Performance improvements
   - Feature additions

## Support & Resources

### Documentation
- **Flash Loans**: [FLASHLOAN.md](./FLASHLOAN.md)
- **DEX Integration**: [DEX_INTEGRATION.md](./DEX_INTEGRATION.md)
- **API Documentation**: [apps/api/README.md](./apps/api/README.md)

### Tools
- **Sui Explorer**: https://suiexplorer.com
- **Sui Vision**: https://suivision.xyz
- **Gas Price Tracker**: https://suiscan.xyz/mainnet/home

### Commands Reference

```bash
# Deployment
task deploy:testnet          # Deploy to testnet
task deploy:mainnet          # Deploy to mainnet
task deploy:verify           # Verify deployment
task deploy:status           # Check status

# Pools
task pool:create:all         # Create all pools
task pool:list               # List pools
task pool:info -- <id>       # Pool details
task pool:add-liquidity      # Add liquidity

# Configuration
task config:generate         # Generate configs
task config:validate         # Validate configs
task config:show             # Show current config

# Testing
task test                    # All tests
task move:test               # Move tests only
task integration:all         # Integration tests

# Monitoring
task bot:start               # Start bot
task heimdahl:monitor        # Monitor events
```

---

**Last Updated**: 2025-01-27
**Version**: 1.0.0
**Status**: Production Ready
