# Operations Runbook

Quick reference for operators managing Hatch in production.

## 🚨 Emergency Contacts

**On-Call Rotation**: [Add your on-call schedule]
**Escalation Path**: [Add escalation contacts]
**Slack Channel**: `#hatch-alerts`
**PagerDuty**: [Add PagerDuty integration]

---

## ⚡ Quick Actions

### Emergency Stop

```bash
# Stop arbitrage bot immediately
pkill -f "hatch"

# Verify stopped
ps aux | grep hatch
```

### Check System Health

```bash
# Comprehensive health check
task deploy:health

# Quick status
task deploy:status

# Pool monitoring
task pool:list
```

### Rollback Deployment

```bash
# Rollback to previous version
task deploy:rollback

# Verify rollback
task deploy:verify
```

---

## 📊 Daily Operations

### Morning Checks (5 minutes)

```bash
# 1. Health check
task deploy:health

# 2. Check pools
task pool:list

# 3. Review logs (if applicable)
tail -100 logs/health.log

# Expected: All systems healthy ✅
```

### Evening Checks (5 minutes)

```bash
# 1. Daily status
task deploy:status

# 2. Pool utilization
task pool:list

# 3. Note any warnings for tomorrow
```

---

## 🏥 Health Check Procedures

### System Health Levels

**🟢 Healthy**: All systems operational
- All metrics green
- No warnings
- Normal operation

**🟡 Warning**: Review required within 1 hour
- Low liquidity (< 20%)
- High utilization (> 80%)
- Minor errors

**🔴 Critical**: Immediate action required
- Pool drained
- Multiple failures
- Security alert

### Health Check Command

```bash
task deploy:health
```

**What it checks:**
- ✅ Network connectivity
- ✅ Package exists on-chain
- ✅ Modules accessible
- ✅ Pools healthy
- ✅ Configuration valid

### Response Matrix

| Status | Action | Response Time |
|--------|--------|---------------|
| 🟢 All Healthy | None | - |
| 🟡 1-2 Warnings | Review & document | < 1 hour |
| 🟡 3+ Warnings | Investigate | < 30 min |
| 🔴 Any Critical | Emergency response | Immediate |

---

## 💰 Pool Management

### Check Pool Status

```bash
# List all pools
task pool:list

# Detailed pool info
task pool:info -- <pool-id>

# Real-time monitoring
task monitor:pools
```

### Add Liquidity

```bash
# Add liquidity to specific pool
task pool:add-liquidity -- <pool-id> <amount>

# Example: Add 100 SUI
task pool:add-liquidity -- 0x... 100000000000
```

### Low Liquidity Alert

**Trigger**: Pool liquidity < 20% of initial

**Response:**
1. Check recent activity: `task pool:info -- <pool-id>`
2. Determine cause (high usage or drain?)
3. Add liquidity: `task pool:add-liquidity`
4. Monitor for 30 minutes
5. Document in incident log

### High Utilization Alert

**Trigger**: Utilization > 80%

**Response:**
1. Verify it's legitimate usage
2. Add more liquidity if needed
3. Monitor for patterns
4. Consider creating additional pool

---

## 🔧 Common Issues

### Issue: High Gas Costs

**Symptoms:**
- Gas costs eating into profits
- Transactions failing due to gas

**Diagnosis:**
```bash
# Check current gas prices
sui client gas

# Review recent transactions
# Check Sui Explorer: https://suiexplorer.com
```

**Resolution:**
1. Check network congestion
2. Increase max gas threshold in config
3. Or pause trading temporarily
4. Update `config/bot.mainnet.json`:
   ```json
   "strategy": {
     "maxGasPrice": "2000000000"  // Increase limit
   }
   ```

---

### Issue: Pool Low Liquidity

**Symptoms:**
- Pool balance < 10% of initial
- "Insufficient liquidity" errors

**Diagnosis:**
```bash
task pool:info -- <pool-id>
```

**Resolution:**
1. Add liquidity immediately
   ```bash
   task pool:add-liquidity -- <pool-id> <amount>
   ```
2. Investigate cause
3. Monitor for recurrence
4. Consider increasing initial liquidity

---

### Issue: Deployment Failed

**Symptoms:**
- Deployment script returns error
- Package not created

**Diagnosis:**
```bash
# Check wallet balance
sui client gas

# Check network
sui client active-env

# Review error message
```

**Resolution:**
1. Ensure wallet has sufficient gas (10+ SUI)
2. Verify network connectivity
3. Check Sui network status
4. Retry deployment:
   ```bash
   task deploy:testnet  # or mainnet
   ```
5. If still failing, check logs and contact support

---

### Issue: RPC Endpoint Down

**Symptoms:**
- Health check fails
- "Connection refused" errors
- Timeout errors

**Diagnosis:**
```bash
# Test RPC connectivity
curl https://fullnode.mainnet.sui.io/health

# Or for testnet
curl https://fullnode.testnet.sui.io/health
```

**Resolution:**
1. Check RPC endpoint status
2. Switch to backup RPC if available
3. Wait for RPC to recover
4. Update configuration:
   ```bash
   export SUI_RPC_URL="https://backup-rpc.example.com"
   ```

---

### Issue: Bot Not Trading

**Symptoms:**
- No trades for extended period
- Bot process running but idle

**Diagnosis:**
```bash
# Check bot process
ps aux | grep hatch

# Review bot logs
tail -100 logs/bot.log

# Check configuration
task config:show
```

**Resolution:**
1. Verify bot is running: `ps aux | grep hatch`
2. Check wallet has gas: `sui client gas`
3. Review profit thresholds (may be too high)
4. Check for opportunities:
   - Review DEX price differences
   - Verify market conditions
5. Adjust `config/bot.mainnet.json` if needed:
   ```json
   "strategy": {
     "minProfitBps": 30  // Lower threshold
   }
   ```
6. Restart bot: `task bot:start`

---

## 📝 Incident Response

### P0 - Critical (Immediate Response)

**Examples:**
- Complete system outage
- Security breach
- Flash pool drained
- Smart contract exploit

**Response Steps:**
1. **0-5 min**: Assess severity
   ```bash
   task deploy:health
   task pool:list
   ```

2. **5-10 min**: Execute emergency stop
   ```bash
   # Stop bot
   pkill -f "hatch"

   # Assess damage
   task deploy:status
   ```

3. **10-15 min**: Notify team
   - Post in #hatch-alerts
   - Page on-call engineer
   - Notify stakeholders

4. **15-30 min**: Implement mitigation
   - Rollback if needed: `task deploy:rollback`
   - Or fix and redeploy

5. **Post-incident**: Write post-mortem

---

### P1 - High (< 15 minutes)

**Examples:**
- Partial outage
- High error rate
- Multiple pool issues

**Response Steps:**
1. Run health check: `task deploy:health`
2. Identify affected components
3. Check recent changes
4. Implement fix
5. Verify resolution
6. Document in incident log

---

### P2 - Medium (< 1 hour)

**Examples:**
- Performance degradation
- Minor errors
- Configuration drift

**Response Steps:**
1. Investigate issue
2. Create ticket/issue
3. Schedule fix
4. Monitor for escalation

---

### P3 - Low (< 24 hours)

**Examples:**
- Warnings
- Optimization opportunities
- Documentation updates

**Response Steps:**
1. Document issue
2. Add to backlog
3. Address during maintenance

---

## 📅 Scheduled Maintenance

### Weekly Maintenance (15 minutes)

**Every Monday:**
```bash
# 1. Review metrics
task deploy:status
task pool:list

# 2. Check for updates
git pull
bun update

# 3. Review logs
tail -500 logs/health.log

# 4. Backup configurations
cp -r config/ backups/config-$(date +%Y%m%d)

# 5. Update documentation if needed
```

### Monthly Maintenance (1 hour)

**First Monday of month:**
```bash
# 1. Full security audit
task audit

# 2. Review and optimize configurations
task config:show
task config:validate

# 3. Update dependencies
bun update
sui client upgrade

# 4. Performance review
# - Review bot profitability
# - Analyze gas costs
# - Optimize parameters

# 5. Backup deployments
cp -r deployments/ backups/deployments-$(date +%Y%m%d)

# 6. Test rollback procedure (dry run)
# Document any issues
```

---

## 📊 Monitoring Dashboards

### Key Metrics to Watch

**Flash Pools:**
- Total liquidity: Real-time
- Utilization rate: Real-time
- 24h volume: Daily
- Fee revenue: Daily
- Success rate: Hourly

**System Health:**
- RPC latency: Real-time
- Transaction success rate: Hourly
- Gas costs: Real-time
- Error count: Real-time

**Financial:**
- Daily profit/loss
- Gas efficiency
- ROI tracking

### Dashboard Access

```bash
# Real-time pool monitoring
task monitor:pools

# Health monitoring (every minute)
watch -n 60 task deploy:health

# Status check (every 15 minutes)
watch -n 900 task deploy:status
```

---

## 🔐 Security Procedures

### Access Control

**Who has access:**
- Production keys: Team leads only
- Deployment access: DevOps team
- Monitoring: All team members
- Configuration: DevOps + leads

### Key Management

**Private keys stored:**
- Encrypted at rest
- Never in version control
- Backed up securely
- Rotated quarterly

**Access logs:**
- All deployments logged
- All configuration changes tracked
- Regular audit reviews

### Security Checks

**Daily:**
```bash
# Check for unusual activity
task pool:list
# Review transaction history on explorer
```

**Weekly:**
```bash
# Security audit
task audit
# Review access logs
# Check for vulnerabilities
```

---

## 📞 Escalation Path

### Level 1: On-Call Engineer
- **Response time**: 15 minutes
- **Handles**: P1-P3 incidents
- **Escalates**: P0 or can't resolve in 30 min

### Level 2: Team Lead
- **Response time**: 30 minutes
- **Handles**: P0 incidents, escalated P1
- **Escalates**: Security issues, major outages

### Level 3: Engineering Leadership
- **Response time**: 1 hour
- **Handles**: Critical security, major business impact
- **Escalates**: Executive team for major incidents

---

## 📚 Reference Links

**Quick Access:**
- Sui Explorer (Mainnet): https://suiexplorer.com/?network=mainnet
- Sui Explorer (Testnet): https://suiexplorer.com/?network=testnet
- Sui Vision: https://suivision.xyz
- Network Status: https://status.sui.io

**Documentation:**
- [Deployment Guide](./DEPLOYMENT.md)
- [Monitoring Guide](./MONITORING.md)
- [Launch Checklist](./LAUNCH_CHECKLIST.md)
- [Production Readiness](./PRODUCTION_READINESS.md)

**Support:**
- GitHub Issues: https://github.com/TortoiseOS/hatch/issues
- Team Chat: [Add Slack/Discord link]
- Emergency: [Add phone/pager]

---

**Last Updated**: 2025-01-27
**Version**: 1.0.0
**Maintained By**: Operations Team
