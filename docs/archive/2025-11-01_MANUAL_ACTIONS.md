# 📋 Manual Actions Required

> **⚠️ DEPRECATED**: This checklist has been integrated into:
> - [docs/launch-strategies/LAUNCH_CHECKLIST.md](../launch-strategies/LAUNCH_CHECKLIST.md)
> - [docs/guides/DEPLOYMENT.md](../guides/DEPLOYMENT.md)

This document lists all actions **YOU** need to take to complete production deployment.
Everything else is automated.

---

## 🎯 Your Action Items

### 1. Fund Deployment Wallets (30 minutes)

**Testnet:**
```bash
# Get your wallet address
sui client active-address

# Request testnet SUI from Discord faucet
# Discord: https://discord.com/channels/916379725201563759/971488439931392130
# Need: 10+ SUI

# Verify balance
sui client gas
```

**Mainnet** (when ready):
```bash
# Transfer 200-600 SUI to deployment wallet
# Recommended: 100 SUI deployment + 100-500 SUI liquidity
```

**Status**: [ ] Testnet wallet funded | [ ] Mainnet wallet funded

---

### 2. Configure Private Keys (5 minutes)

```bash
# Export your private key
sui keytool export --key-identity <your-address>

# Set environment variable
export SUI_PRIVATE_KEY="suiprivkey..."

# Or create .env.local (don't commit!)
echo "SUI_PRIVATE_KEY=suiprivkey..." > .env.local
```

**Status**: [ ] Private key exported | [ ] Environment variable set

---

### 3. Update Pool Configurations (15 minutes)

**Edit `config/pools.testnet.json`:**

```json
[
  {
    "coinType": "0x2::sui::SUI",
    "initialLiquidity": "10000000000",
    "description": "SUI native token"
  },
  {
    "coinType": "YOUR_TOKEN_ADDRESS_HERE",
    "initialLiquidity": "10000000",
    "description": "USDC or other token"
  }
]
```

**Find testnet token addresses:**
- Use: `task tokens:testnet` for guidance
- Sui Explorer: https://suiexplorer.com/?network=testnet
- Or start with just SUI for testing

**Status**: [ ] Config updated | [ ] Config validated with `task config:validate`

---

### 4. Run Pre-Deployment Checks (5 minutes)

```bash
# This checks everything is ready
task deploy:check

# Should output: "✅ All checks passed"
```

**Status**: [ ] Pre-deployment checks passed

---

### 5. Deploy to Testnet (30 minutes)

```bash
# Automated deployment
task setup:testnet

# Expected output:
# ✅ Deployment successful
# 📦 Package ID: 0x...
# 🏊 Pools created: X
```

**Save these values:**
- Package ID: `________________`
- Pool IDs: `________________`

**Status**: [ ] Deployed | [ ] Package ID saved | [ ] Pool IDs saved

---

### 6. Monitor Testnet (48+ hours)

```bash
# Terminal 1: Real-time pool monitoring
task monitor:pools

# Terminal 2: Health checks
watch -n 300 task deploy:health

# Test flash loans
bun run scripts/test-flash-borrow.ts <pool-id>
```

**Check for:**
- [ ] No critical errors
- [ ] Flash loans work correctly
- [ ] Pool liquidity stable
- [ ] Gas costs reasonable

**Status**: [ ] Monitoring active | [ ] Tested for 48+ hours | [ ] No issues found

---

### 7. Prepare for Mainnet (2 hours)

**Update mainnet configuration:**
```bash
task config:generate mainnet

# Edit config/pools.mainnet.json with REAL mainnet addresses
# Edit config/bot.mainnet.json with production parameters

task config:validate mainnet
```

**Fund mainnet wallet:**
- Transfer 200-600 SUI
- Verify: `sui client gas`

**Security review:**
- [ ] Review smart contract code
- [ ] External audit (optional but recommended)
- [ ] Test all emergency procedures
- [ ] Backup wallet keys securely

**Status**: [ ] Mainnet config ready | [ ] Wallet funded | [ ] Security reviewed

---

### 8. Deploy to Mainnet (1 hour + monitoring)

```bash
# Includes 5-second safety delay
task setup:mainnet

# Watch output carefully
# Save Package ID and Pool IDs
```

**Post-deployment:**
```bash
# Verify
task deploy:verify

# Monitor continuously for 24 hours
task monitor:pools
watch -n 300 task deploy:health
```

**Status**: [ ] Deployed to mainnet | [ ] Monitoring active | [ ] No issues first 24h

---

### 9. Optional: CI/CD Setup (30 minutes)

**GitHub:**
- Settings → Secrets → Add `SUI_TESTNET_PRIVATE_KEY`
- Settings → Secrets → Add `SUI_MAINNET_PRIVATE_KEY`
- Push to `develop` branch to trigger testnet deployment

**GitLab:**
- Settings → CI/CD → Variables
- Add same secrets
- Pipeline will run automatically

**Status**: [ ] GitHub secrets added | [ ] GitLab variables added | [ ] CI/CD tested

---

## 🚨 Emergency Contacts

**If something goes wrong:**

1. **Stop immediately**: `pkill -f "hatch"`
2. **Run health check**: `task deploy:health`
3. **Check documentation**: RUNBOOK.md
4. **Create GitHub issue**: https://github.com/TortoiseOS/hatch/issues
5. **Rollback if needed**: `task deploy:rollback`

---

## ✅ Quick Checklist

**Day 1:**
- [ ] Fund testnet wallet (10+ SUI)
- [ ] Set SUI_PRIVATE_KEY
- [ ] Update config/pools.testnet.json
- [ ] Run `task config:validate`

**Day 2:**
- [ ] Run `task deploy:check`
- [ ] Deploy: `task setup:testnet`
- [ ] Save package ID and pool IDs
- [ ] Start monitoring

**Days 3-5:**
- [ ] Monitor continuously
- [ ] Test flash loans
- [ ] Check for any errors
- [ ] Document any issues

**Day 6:**
- [ ] Update mainnet configs
- [ ] Fund mainnet wallet (200-600 SUI)
- [ ] Run security review
- [ ] Validate: `task config:validate mainnet`

**Day 7:**
- [ ] Deploy: `task setup:mainnet`
- [ ] Verify: `task deploy:verify`
- [ ] Monitor 24/7 for first day
- [ ] Create deployment tag in git

---

## 📚 Next Steps

After successful mainnet deployment:

**Week 2:**
- Monitor daily (15 min)
- Review metrics
- No major changes

**Week 3:**
- Add more liquidity if needed
- Enable arbitrage bot (if ready)
- Lower thresholds slightly

**Week 4:**
- Optimize based on data
- Add features
- Scale operations

---

**Everything else is automated. You've got this! 🚀**

For help: `task quick-start` or read [LAUNCH_CHECKLIST.md](./LAUNCH_CHECKLIST.md)
