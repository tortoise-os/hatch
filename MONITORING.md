# Production Monitoring Guide

Comprehensive monitoring setup for Hatch flash loan and arbitrage protocol on Sui.

## Table of Contents

- [Overview](#overview)
- [Metrics to Monitor](#metrics-to-monitor)
- [Monitoring Tools](#monitoring-tools)
- [Alert Configuration](#alert-configuration)
- [Dashboard Setup](#dashboard-setup)
- [Incident Response](#incident-response)

## Overview

Production monitoring is critical for:
- Detecting anomalies and security issues
- Tracking profitability and performance
- Ensuring system health
- Meeting SLAs

## Metrics to Monitor

### 1. Flash Loan Metrics

**Pool Health:**
```bash
# Check pool liquidity
task pool:list

# Monitor specific pool
watch -n 10 task pool:info -- <pool-id>
```

Key metrics:
- **Total Liquidity**: Available funds in pool
- **Utilization Rate**: Borrowed / Total liquidity
- **Fee Revenue**: Total fees collected
- **Loan Count**: Number of flash loans executed
- **Success Rate**: Successful loans / Total attempts

**Alert Thresholds:**
- Liquidity < 10% of initial: **WARNING**
- Utilization > 80%: **WARNING**
- Failed loans > 5%: **CRITICAL**
- No activity for 1 hour: **INFO**

### 2. Arbitrage Bot Metrics

**Profitability:**
- Profit per trade (in SUI/USDC)
- Total profit (24h, 7d, 30d)
- Average profit margin (bps)
- Gas costs vs profit ratio

**Performance:**
- Execution time per trade
- Latency from opportunity detection to execution
- Success rate
- Slippage encountered

**Activity:**
- Opportunities detected
- Trades executed
- Trades skipped (insufficient profit)
- Errors encountered

**Alert Thresholds:**
- Profit margin < min threshold: **WARNING**
- Gas costs > 50% of profit: **WARNING**
- Success rate < 90%: **CRITICAL**
- No trades for 1 hour: **WARNING**
- Consecutive failures > 5: **CRITICAL**

### 3. System Health Metrics

**Blockchain Connectivity:**
```bash
# Run health check
task deploy:health

# Continuous monitoring
watch -n 30 bun run scripts/health-check.ts
```

Metrics:
- RPC endpoint latency
- Transaction success rate
- Gas price trends
- Network congestion

**Alert Thresholds:**
- RPC latency > 5s: **WARNING**
- RPC latency > 15s: **CRITICAL**
- Tx success rate < 95%: **WARNING**
- Gas price > max threshold: **WARNING**

### 4. Financial Metrics

**Daily Tracking:**
- Total revenue
- Total gas costs
- Net profit
- ROI percentage

**Position Tracking (Leveraged Farming):**
- Total Value Locked (TVL)
- Number of active positions
- Average leverage used
- Positions near liquidation
- Liquidations executed

**Alert Thresholds:**
- Daily loss: **CRITICAL**
- TVL drop > 20%: **WARNING**
- Positions near liquidation > 10: **WARNING**

## Monitoring Tools

### 1. Built-in Scripts

**Health Check:**
```bash
# Run comprehensive health check
bun run scripts/health-check.ts mainnet

# Schedule with cron (every 5 minutes)
*/5 * * * * cd /path/to/hatch && bun run scripts/health-check.ts mainnet >> logs/health.log 2>&1
```

**Deployment Status:**
```bash
# Check deployment status
bun run scripts/deployment-status.ts

# Monitor pools
bun run scripts/list-pools.ts mainnet
```

### 2. Sui Explorer Integration

Monitor on-chain activity:
- **Sui Explorer**: https://suiexplorer.com
- **Sui Vision**: https://suivision.xyz
- **Sui Scan**: https://suiscan.xyz

Track:
- Package transactions
- Pool interactions
- Gas usage
- Event emissions

### 3. Heimdahl Event Monitoring

Heimdahl provides real-time event monitoring for Sui:

```bash
# Install Heimdahl CLI
npm install -g @heimdahl/cli

# Monitor flash loan events
heimdahl monitor \
  --package <package-id> \
  --module flash_pool \
  --event FlashLoanExecuted
```

**Example monitoring script:**

```typescript
// scripts/monitor-events.ts
import { SuiClient } from '@mysten/sui.js/client';

const client = new SuiClient({ url: 'https://fullnode.mainnet.sui.io' });
const packageId = process.env.PACKAGE_ID!;

async function monitorEvents() {
  const events = await client.queryEvents({
    query: {
      MoveEventModule: {
        package: packageId,
        module: 'flash_pool',
      },
    },
    order: 'descending',
    limit: 50,
  });

  for (const event of events.data) {
    console.log('Event:', event);
    // Process and alert on events
  }
}

setInterval(monitorEvents, 10000); // Every 10 seconds
```

### 4. Prometheus & Grafana

**Setup Prometheus Exporter:**

```typescript
// monitoring/prometheus-exporter.ts
import { Counter, Gauge, Registry } from 'prom-client';
import express from 'express';

const register = new Registry();

// Define metrics
const flashLoansTotal = new Counter({
  name: 'hatch_flash_loans_total',
  help: 'Total number of flash loans',
  labelNames: ['status', 'pool'],
  registers: [register],
});

const poolLiquidity = new Gauge({
  name: 'hatch_pool_liquidity',
  help: 'Current pool liquidity',
  labelNames: ['pool', 'coin_type'],
  registers: [register],
});

const arbProfitTotal = new Counter({
  name: 'hatch_arbitrage_profit_total',
  help: 'Total arbitrage profit',
  labelNames: ['pair'],
  registers: [register],
});

// Update metrics periodically
async function updateMetrics() {
  // Fetch pool data and update gauges
  // Track flash loans and update counters
  // Monitor arbitrage and update profit
}

setInterval(updateMetrics, 30000);

// Expose metrics endpoint
const app = express();
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

app.listen(9090, () => {
  console.log('Metrics server listening on :9090');
});
```

**Grafana Dashboard:**

Create dashboard with panels for:
1. Flash Loan Volume (time series)
2. Pool Liquidity Levels (gauge)
3. Arbitrage Profit (counter)
4. Success Rates (percentage)
5. Gas Costs (time series)
6. Active Positions (gauge)

### 5. Custom Alert System

**Email/Slack Alerts:**

```typescript
// monitoring/alerts.ts
import nodemailer from 'nodemailer';
import { WebClient } from '@slack/web-api';

interface Alert {
  severity: 'info' | 'warning' | 'critical';
  component: string;
  message: string;
  details?: any;
}

async function sendAlert(alert: Alert) {
  if (alert.severity === 'critical') {
    await sendSlackAlert(alert);
    await sendEmailAlert(alert);
    await sendPagerDutyAlert(alert);
  } else if (alert.severity === 'warning') {
    await sendSlackAlert(alert);
  }
}

async function sendSlackAlert(alert: Alert) {
  const slack = new WebClient(process.env.SLACK_TOKEN);

  await slack.chat.postMessage({
    channel: '#hatch-alerts',
    text: `[${alert.severity.toUpperCase()}] ${alert.component}: ${alert.message}`,
    attachments: [{
      color: alert.severity === 'critical' ? 'danger' : 'warning',
      fields: Object.entries(alert.details || {}).map(([key, value]) => ({
        title: key,
        value: String(value),
        short: true,
      })),
    }],
  });
}

async function sendEmailAlert(alert: Alert) {
  const transporter = nodemailer.createTransporter({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  await transporter.sendMail({
    from: 'alerts@hatch.protocol',
    to: process.env.ALERT_EMAIL,
    subject: `[${alert.severity.toUpperCase()}] Hatch Alert: ${alert.component}`,
    text: `${alert.message}\n\nDetails: ${JSON.stringify(alert.details, null, 2)}`,
  });
}
```

## Alert Configuration

### Alert Rules

**Critical Alerts (immediate action required):**
- Flash pool drained (liquidity < 1%)
- Multiple consecutive failed transactions
- Security anomaly detected
- Position liquidation cascade
- RPC endpoint down
- Bot stuck/not responding

**Warning Alerts (review within 1 hour):**
- Low pool liquidity (< 10%)
- High gas costs (> threshold)
- Low profit margins
- Unusual trading patterns
- Configuration drift

**Info Alerts (review within 24 hours):**
- Daily summary reports
- Metric thresholds reached
- Successful deployments
- Routine maintenance reminders

### Alert Channels

1. **PagerDuty**: Critical alerts only
2. **Slack #alerts**: Critical + Warning
3. **Email**: All alert types + daily digests
4. **SMS**: Critical alerts for on-call team

## Dashboard Setup

### Real-time Dashboard

Create a monitoring dashboard with:

**Pool Status Panel:**
```
╔═══════════════════════════════════╗
║  Flash Pool: SUI                  ║
║  Liquidity: 1,234.56 SUI          ║
║  Utilization: 23.4%               ║
║  24h Volume: 45,678.90 SUI        ║
║  Fee Revenue: 22.84 SUI           ║
║  Status: ✅ Healthy               ║
╚═══════════════════════════════════╝
```

**Arbitrage Performance:**
```
╔═══════════════════════════════════╗
║  Arbitrage Bot Status             ║
║  Last Trade: 2m ago               ║
║  24h Profit: +123.45 SUI          ║
║  24h Trades: 87                   ║
║  Success Rate: 94.2%              ║
║  Avg Profit: 1.42 SUI/trade       ║
║  Status: ✅ Active                ║
╚═══════════════════════════════════╝
```

**System Health:**
```
╔═══════════════════════════════════╗
║  System Health                    ║
║  RPC Latency: 234ms               ║
║  Tx Success: 98.7%                ║
║  Gas Price: 1,000 MIST            ║
║  Uptime: 7d 14h 23m               ║
║  Status: ✅ Operational           ║
╚═══════════════════════════════════╝
```

### Implementation

```bash
# Create monitoring directory
mkdir -p monitoring

# Start monitoring stack
docker-compose -f monitoring/docker-compose.yml up -d
```

**docker-compose.yml:**
```yaml
version: '3'

services:
  prometheus:
    image: prom/prometheus:latest
    ports:
      - "9090:9090"
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml
      - prometheus-data:/prometheus

  grafana:
    image: grafana/grafana:latest
    ports:
      - "3000:3000"
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=admin
    volumes:
      - grafana-data:/var/lib/grafana
      - ./dashboards:/etc/grafana/provisioning/dashboards

  alertmanager:
    image: prom/alertmanager:latest
    ports:
      - "9093:9093"
    volumes:
      - ./alertmanager.yml:/etc/alertmanager/alertmanager.yml

volumes:
  prometheus-data:
  grafana-data:
```

## Incident Response

### Incident Severity Levels

**P0 - Critical (response time: immediate)**
- Complete system outage
- Security breach
- Flash pool drained
- Smart contract exploit

**P1 - High (response time: < 15 minutes)**
- Partial outage
- Multiple failures
- Abnormal behavior
- High error rates

**P2 - Medium (response time: < 1 hour)**
- Performance degradation
- Minor errors
- Configuration issues

**P3 - Low (response time: < 24 hours)**
- Warnings
- Optimization opportunities
- Documentation updates

### Response Procedures

**P0 Incident Response:**
1. **Immediate**: Page on-call engineer
2. **0-5 min**: Assess severity and scope
3. **5-10 min**: Execute emergency procedures:
   - Stop bot if needed
   - Pause pools if vulnerable
   - Roll back deployment if necessary
4. **10-15 min**: Notify stakeholders
5. **15-30 min**: Implement mitigation
6. **Post-incident**: Write post-mortem

**Emergency Commands:**
```bash
# Stop arbitrage bot
pkill -f "hatch-bot"

# Rollback deployment
task deploy:rollback

# Check system health
task deploy:health

# View recent transactions
sui client object <package-id>
```

### On-Call Playbook

**Common Issues:**

1. **High Gas Costs**
   - Check: Network congestion
   - Action: Increase max gas threshold or pause trading
   - Command: Update `config/bot.mainnet.json`

2. **Low Pool Liquidity**
   - Check: Recent flash loans
   - Action: Add liquidity
   - Command: `task pool:add-liquidity -- <pool-id> <amount>`

3. **RPC Failures**
   - Check: RPC endpoint status
   - Action: Switch to backup RPC
   - Command: Update `SUI_RPC_URL` in environment

4. **Bot Not Trading**
   - Check: Bot logs, configuration, gas balance
   - Action: Restart bot or adjust parameters
   - Command: `task bot:start`

## Best Practices

1. **Proactive Monitoring**
   - Set up alerts before issues occur
   - Monitor trends, not just absolute values
   - Regular health checks (automated)

2. **Alert Fatigue Prevention**
   - Tune thresholds carefully
   - Group related alerts
   - Implement alert suppression during maintenance

3. **Documentation**
   - Keep runbooks up to date
   - Document all incidents
   - Share learnings with team

4. **Testing**
   - Test alert systems regularly
   - Simulate incidents
   - Practice incident response

5. **Continuous Improvement**
   - Review metrics weekly
   - Optimize thresholds based on data
   - Add new metrics as needed

---

**Related Documentation:**
- [Deployment Guide](./DEPLOYMENT.md)
- [Flash Loan Guide](./FLASHLOAN.md)
- [DEX Integration](./DEX_INTEGRATION.md)
