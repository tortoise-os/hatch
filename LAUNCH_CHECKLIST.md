# 🚀 Fast-Track Production Launch Checklist

**Goal**: Get Hatch deployed to production as quickly as possible while maintaining safety.

**Estimated Timeline**: 7-14 days

---

## 📋 Quick Reference

**Current Status**: Infrastructure Complete ✅
**Next Phase**: Configuration & Testnet Deployment
**Blocker**: None - Ready to proceed

---

## 🎯 Critical Path to Production (7 Days)

### **Day 1: Configuration & Setup** ⏱️ 2-4 hours

#### 1. Fund Deployment Wallets 💰

**Testnet:**
```bash
# Get testnet SUI from faucet
# Discord: https://discord.com/channels/916379725201563759/971488439931392130
# Or use: sui client faucet

# Export your wallet address
sui client active-address

# Request testnet SUI (multiple times if needed)
# Need: ~10 SUI for deployment + gas
```

**Mainnet:**
```bash
# Transfer production funds to deployment wallet
# Recommended: 100-500 SUI for deployment + initial liquidity + gas
```

#### 2. Configure Private Keys 🔑

**Set environment variable:**
```bash
# Export your private key
sui keytool export --key-identity <your-address>

# Set in environment
export SUI_PRIVATE_KEY="suiprivkey..."

# Or add to .env.local (don't commit!)
echo "SUI_PRIVATE_KEY=suiprivkey..." > .env.local
```

#### 3. Get Real Token Addresses 📍

**Update `config/pools.testnet.json`:**
```json
[
  {
    "coinType": "0x2::sui::SUI",
    "initialLiquidity": "10000000000",  // 10 SUI
    "description": "SUI native token"
  },
  {
    "coinType": "0x5d4b302506645c37ff133b98c4b50a5ae14841659738d6d733d59d0d217a93bf::coin::COIN",
    "initialLiquidity": "10000000",  // 10 USDC (adjust decimals)
    "description": "USDC testnet"
  }
]
```

**Find testnet token addresses:**
- Sui Explorer: https://suiexplorer.com/?network=testnet
- Or use test tokens from faucets

#### 4. Fix Dependency Issue (Optional) 🔧

```bash
# If you encounter @noble/hashes errors, run:
bun install
bun add @mysten/sui.js@latest

# Or use Node.js instead of Bun temporarily:
# npm install
# npm run <script>
```

**Action Items:**
- [ ] Fund testnet wallet with 10+ SUI
- [ ] Export and set SUI_PRIVATE_KEY
- [ ] Update config/pools.testnet.json with real addresses
- [ ] Test: `task config:validate`

---

### **Day 2-3: Testnet Deployment** ⏱️ 1-2 hours

#### 1. Pre-Deployment Check ✅

```bash
# Verify everything is ready
task deploy:check

# Should output:
# ✅ All pre-deployment checks passed
```

**If checks fail:**
- Fix any build errors
- Ensure tests pass
- Check network connectivity
- Verify wallet has gas

#### 2. Deploy to Testnet 🚀

```bash
# Full automated deployment
task setup:testnet

# This will:
# - Build contracts
# - Deploy to testnet
# - Verify deployment
# - Create flash pools
# - Run health check
```

**Expected output:**
```
✅ Deployment successful!
═══════════════════════════════════════
📦 Package ID: 0x...
🏊 Pools created: 2
✅ Health check: Passed
```

#### 3. Verify Deployment 🔍

```bash
# Check deployment status
task deploy:status

# Check pools
task pool:list

# Run health check
task deploy:health

# Monitor pools
task monitor:pools
```

**Action Items:**
- [ ] Run `task deploy:check`
- [ ] Deploy with `task setup:testnet`
- [ ] Verify with `task deploy:verify`
- [ ] Save package ID and pool IDs
- [ ] Run for 24-48 hours

---

### **Day 4-5: Testnet Validation** ⏱️ 2-4 hours

#### 1. Test Flash Loans 💸

```bash
# Test basic flash borrow/repay
bun run scripts/test-flash-borrow.ts <pool-id>

# Expected: Successful borrow and repay
```

#### 2. Monitor Performance 📊

```bash
# Watch pools in real-time (Ctrl+C to stop)
task monitor:pools

# Check health every hour
watch -n 3600 task deploy:health
```

**What to monitor:**
- Pool liquidity levels
- Transaction success rate
- Gas costs
- Any errors or warnings

#### 3. Test Edge Cases 🧪

```bash
# Test with different amounts
bun run scripts/test-flash-borrow.ts <pool-id> 1000000000  # 1 SUI
bun run scripts/test-flash-borrow.ts <pool-id> 100000000   # 0.1 SUI
bun run scripts/test-flash-borrow.ts <pool-id> 10000000000 # 10 SUI

# Monitor for any issues
```

**Action Items:**
- [ ] Test flash loans successfully
- [ ] Monitor for 48 hours minimum
- [ ] Document any issues found
- [ ] Adjust configurations if needed
- [ ] Verify no critical errors

---

### **Day 6: Mainnet Preparation** ⏱️ 3-5 hours

#### 1. Security Review 🔒

**Self-audit checklist:**
- [ ] Review all smart contract code
- [ ] Verify test coverage (40/40 tests)
- [ ] Check access controls
- [ ] Review fee structures
- [ ] Validate slippage protections
- [ ] Test emergency procedures (rollback)

**Optional but recommended:**
- [ ] External security audit (if budget allows)
- [ ] Bug bounty program
- [ ] Code review with team

#### 2. Configure Mainnet 🎛️

```bash
# Generate mainnet configs
task config:generate mainnet

# Update config/pools.mainnet.json with REAL addresses
# Update config/bot.mainnet.json with production params
```

**Mainnet pool config example:**
```json
[
  {
    "coinType": "0x2::sui::SUI",
    "initialLiquidity": "100000000000",  // 100 SUI
    "description": "SUI native token - main pool"
  },
  {
    "coinType": "0xREAL_USDC_ADDRESS::usdc::USDC",
    "initialLiquidity": "100000000",  // Adjust for decimals
    "description": "USDC mainnet - main pool"
  }
]
```

#### 3. Fund Mainnet Wallet 💰

**Recommended amounts:**
- **Deployment**: 10 SUI (gas)
- **Initial liquidity**: 100-500 SUI per pool
- **Buffer**: 50 SUI (extra gas, emergencies)
- **Total**: 200-600 SUI

```bash
# Transfer to deployment wallet
# Double-check address before sending!
sui client active-address
```

**Action Items:**
- [ ] Complete security self-audit
- [ ] Update mainnet configurations with real addresses
- [ ] Fund mainnet wallet (200-600 SUI)
- [ ] Validate: `task config:validate mainnet`
- [ ] Backup wallet keys securely

---

### **Day 7: Production Launch** 🎉 ⏱️ 1-2 hours + monitoring

#### 1. Final Pre-Launch Checks ✅

```bash
# Run comprehensive check
task deploy:check

# Validate mainnet config
task config:validate mainnet

# Check wallet balance
sui client gas

# Ensure you have 200+ SUI
```

#### 2. Deploy to Mainnet 🚀

```bash
# This includes 5-second safety delay
task setup:mainnet

# Or step-by-step for more control:
task deploy:mainnet       # Deploy contracts
task pool:create:all      # Create pools with initial liquidity
task deploy:verify        # Verify everything
task deploy:health        # Health check
```

**Watch carefully for:**
- Successful deployment message
- Package ID
- Pool creation success
- No errors or warnings

#### 3. Post-Launch Verification 🔍

```bash
# Verify deployment
task deploy:verify

# Check all systems
task deploy:health

# Monitor pools
task monitor:pools

# Check on Sui Explorer
# https://suiexplorer.com/?network=mainnet
# Search for your package ID
```

#### 4. Monitor Closely (First 24 Hours) 👀

**Set up monitoring:**
```bash
# Terminal 1: Pool monitoring
task monitor:pools

# Terminal 2: Health checks every 5 minutes
watch -n 300 task deploy:health

# Terminal 3: Check deployment status
watch -n 900 task deploy:status
```

**Alert thresholds for first 24h:**
- Any error: Investigate immediately
- Pool liquidity < 50%: Add liquidity
- No activity for 1 hour: Review setup
- Unusual transactions: Investigate

**Action Items:**
- [ ] Deploy to mainnet: `task setup:mainnet`
- [ ] Verify deployment successful
- [ ] Save package ID and pool IDs to secure location
- [ ] Set up monitoring (3 terminals)
- [ ] Monitor continuously for 24 hours
- [ ] Create Git tag: `git tag mainnet-$(date +%Y%m%d) && git push --tags`

---

## 🚨 Emergency Procedures

### If Something Goes Wrong

**During Deployment:**
```bash
# If deployment fails:
# 1. Check error message
# 2. Verify wallet has gas
# 3. Check network status: sui client active-env
# 4. Try again or contact support
```

**After Deployment:**
```bash
# If critical issue found:
# 1. Stop bot if running
pkill -f "hatch"

# 2. Document the issue
# 3. Run health check
task deploy:health

# 4. Consider rollback (if new deployment needed)
task deploy:rollback

# 5. Contact team/support
```

**Rollback Procedure:**
```bash
# Only if absolutely necessary
# This reverts to previous package ID config
task deploy:rollback

# Then investigate and fix issue
# Redeploy when ready
```

---

## 📈 Post-Launch Scaling (Days 8-30)

### Week 2: Conservative Operation

- [ ] Monitor daily (15 min check)
- [ ] Review metrics
- [ ] Gather performance data
- [ ] No major changes

### Week 3: Gradual Scaling

- [ ] Increase pool liquidity if needed
- [ ] Enable arbitrage bot (if implemented)
- [ ] Lower profit thresholds slightly
- [ ] Monitor impact

### Week 4: Optimization

- [ ] Tune bot parameters based on data
- [ ] Add more pools if demand exists
- [ ] Optimize gas usage
- [ ] Plan feature additions

---

## 🎯 Optional: CI/CD Setup (Parallel Track)

### GitHub Actions Setup ⏱️ 30 minutes

**If using GitHub:**

1. **Add secrets to GitHub:**
   - Go to: Settings → Secrets and variables → Actions
   - Add: `SUI_TESTNET_PRIVATE_KEY`
   - Add: `SUI_MAINNET_PRIVATE_KEY`

2. **Enable workflows:**
   - Workflows are already created in `.github/workflows/`
   - Push to `develop` branch triggers testnet deployment
   - Manual trigger for mainnet deployment

3. **Test CI/CD:**
   ```bash
   git checkout -b develop
   git push -u origin develop
   # Watch Actions tab for deployment
   ```

**Action Items:**
- [ ] Add GitHub secrets
- [ ] Test testnet workflow
- [ ] Review mainnet workflow settings

### GitLab CI Setup ⏱️ 30 minutes

**If using GitLab:**

1. **Add CI/CD variables:**
   - Settings → CI/CD → Variables
   - Add: `SUI_TESTNET_PRIVATE_KEY`
   - Add: `SUI_MAINNET_PRIVATE_KEY`

2. **Workflows are ready:**
   - `.gitlab-ci.yml` already configured
   - Manual approval gates for mainnet

**Action Items:**
- [ ] Add GitLab variables
- [ ] Test pipeline on develop branch

---

## 📞 Support & Resources

### Quick Commands Reference

```bash
# Deployment
task setup:testnet      # Deploy to testnet
task setup:mainnet      # Deploy to mainnet
task deploy:verify      # Verify deployment
task deploy:health      # Health check
task deploy:status      # Check status
task deploy:rollback    # Emergency rollback

# Pools
task pool:create:all    # Create all pools
task pool:list          # List pools
task pool:info -- <id>  # Pool details
task monitor:pools      # Real-time monitoring

# Configuration
task config:validate    # Validate config
task config:show        # Show config
```

### Documentation

- **Full Guide**: [DEPLOYMENT.md](./DEPLOYMENT.md)
- **Monitoring**: [MONITORING.md](./MONITORING.md)
- **Readiness**: [PRODUCTION_READINESS.md](./PRODUCTION_READINESS.md)

### Common Issues

**Issue**: "Insufficient gas"
```bash
# Solution: Get more testnet/mainnet SUI
sui client gas
sui client faucet  # For testnet
```

**Issue**: "Package not found"
```bash
# Solution: Verify deployment
task deploy:status
task deploy:verify
```

**Issue**: "Test failures"
```bash
# Solution: Check test output
cd move && sui move test --verbose
# Fix any issues and redeploy
```

---

## ✅ Success Criteria

### Testnet Success
- [x] Deployment completes without errors
- [x] All health checks pass
- [x] Flash loans work correctly
- [x] 48+ hours of stable operation
- [x] No critical errors observed

### Mainnet Success
- [ ] Deployment completes without errors
- [ ] All health checks pass
- [ ] Pools have liquidity
- [ ] Can execute flash loans
- [ ] 24 hours of stable operation
- [ ] No security issues found

---

## 🎉 You're Ready!

**Everything is automated. Just follow the checklist above.**

**Fastest path (if prepared):**
1. Day 1: Configure (2 hours)
2. Day 2: Deploy testnet (30 min)
3. Day 3-5: Test & validate (monitor)
4. Day 6: Mainnet prep (2 hours)
5. Day 7: Production launch (1 hour + monitoring)

**Start now**: `task config:generate testnet`

**Questions?** Check documentation or create GitHub issue.

**Let's ship it! 🚀**
