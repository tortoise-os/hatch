# Hatch Development Roadmap

> **Hatch** - Where advanced DeFi strategies hatch from Carapace's core infrastructure 🐣

## Overview

Hatch is TortoiseOS's advanced trading strategies platform, implementing:
- 🔥 **Flash Loans**: Capital-efficient leverage and arbitrage using Sui's hot potato pattern
- 🤖 **Arbitrage Bots**: Automated MEV capture across Sui DEX ecosystem
- 📈 **Leveraged Strategies**: Yield farming amplification and delta-neutral positions

**Integration Model**: Hatch builds ON TOP of Carapace, consuming it as a dependency without modifying core infrastructure.

---

## Current Status

### ✅ Completed (Week 1)

**Move Contracts**
- [x] Flash loan module with hot potato pattern (`flash_pool.move`)
- [x] Comprehensive flash loan tests (`flash_pool_tests.move`)
- [x] Leveraged farming strategy (`leveraged_farm.move`)
- [x] Position management with health factors
- [x] Liquidation logic

**Bot Infrastructure**
- [x] Bot application setup (`apps/bot/`)
- [x] DEX monitoring system (`dex-monitor.ts`)
- [x] Event subscription architecture
- [x] Price aggregation framework
- [x] Configuration system (`bot.config.json`)

**Documentation**
- [x] Comprehensive ROADMAP.md

---

## 🎯 Roadmap to Production

### Phase 1: Flash Loan Foundation (Weeks 1-2) ✅ CURRENT

**Objective**: Production-ready flash loan system integrated with Carapace

#### Week 1 ✅ DONE
- [x] Core flash loan module implementation
- [x] Hot potato pattern with fee calculation
- [x] Comprehensive test suite
- [x] Leveraged farming strategy
- [x] Bot monitoring infrastructure

#### Week 2
- [ ] **Carapace Integration**
  - [ ] Add `extract_flash()` to `carapace/move/sources/amm/pool.move`
  - [ ] Add `return_flash()` to `carapace/move/sources/amm/pool.move`
  - [ ] Update `Pool` struct to track flash loan state
  - [ ] Add flash loan events to Carapace

- [ ] **Flash Loan SDK** (`packages/strategy-sdk/`)
  - [ ] Create `flash-client.ts` for transaction building
  - [ ] Implement `buildFlashBorrowTx()`
  - [ ] Implement `buildFlashRepayTx()`
  - [ ] Add TypeScript types for flash loans

- [ ] **Testing & Deployment**
  - [ ] Integration tests with Carapace pools
  - [ ] Deploy flash pools to Sui testnet
  - [ ] End-to-end flash loan test script
  - [ ] Gas optimization benchmarks

**Deliverables**:
- Integrated flash loan system with Carapace
- TypeScript SDK for flash operations
- Deployed testnet contracts
- Complete test coverage

---

### Phase 2: Arbitrage Detection (Weeks 3-5)

**Objective**: Real-time arbitrage opportunity detection across Sui DEXs

#### Week 3: Real-Time Monitoring
- [ ] **Heimdahl Integration** (from Carapace Phase 1M)
  - [ ] Install Heimdahl CLI and SDK
  - [ ] Configure WebSocket event streams
  - [ ] Subscribe to swap events from all DEXs
  - [ ] Implement event filtering and parsing

- [ ] **Price Aggregation**
  - [ ] Fetch pool states from Cetus, Turbos, Aftermath
  - [ ] Calculate prices across all DEXs
  - [ ] Detect price discrepancies
  - [ ] Store historical price data

- [ ] **Database Setup**
  - [ ] PostgreSQL for pool states
  - [ ] Redis cache for real-time prices
  - [ ] Time-series data for analytics

#### Week 4: Profitability Engine
- [ ] **Profitability Calculator** (`apps/bot/src/strategy/profitability.ts`)
  - [ ] Fetch pool liquidity
  - [ ] Calculate optimal trade size (% of pool)
  - [ ] Simulate swap outputs with slippage
  - [ ] Estimate gas costs
  - [ ] Calculate net profit

- [ ] **Risk Manager** (`apps/bot/src/strategy/risk-manager.ts`)
  - [ ] Slippage risk assessment
  - [ ] Front-running detection
  - [ ] Position size limits
  - [ ] Daily loss limits

- [ ] **Opportunity Filtering**
  - [ ] Minimum profit threshold
  - [ ] Maximum slippage tolerance
  - [ ] Liquidity requirements
  - [ ] Gas cost considerations

#### Week 5: Dashboard & Monitoring
- [ ] **Web Dashboard** (`apps/web/app/arbitrage/`)
  - [ ] Real-time opportunity feed
  - [ ] Pool price comparison table
  - [ ] Profit/loss charts
  - [ ] Bot status indicators

- [ ] **Monitoring & Alerts**
  - [ ] Discord/Telegram bot integration
  - [ ] Email alerts for large opportunities
  - [ ] Error notifications
  - [ ] Performance metrics

**Deliverables**:
- Real-time arbitrage detection system
- Profitability calculation engine
- Risk management framework
- Monitoring dashboard

---

### Phase 3: Arbitrage Execution (Weeks 6-8)

**Objective**: On-chain arbitrage execution with flash loans

#### Week 6: On-Chain Executor
- [ ] **DEX Arbitrage Contract** (`move/sources/arbitrage/dex_arb.move`)
  - [ ] Cross-DEX swap execution
  - [ ] Flash loan integration
  - [ ] Multi-hop routing support
  - [ ] Profit extraction logic

- [ ] **Integration Modules**
  - [ ] Cetus integration (`cetus_adapter.move`)
  - [ ] Turbos integration (`turbos_adapter.move`)
  - [ ] Aftermath integration (`aftermath_adapter.move`)
  - [ ] TortoiseSwap integration (via Carapace)

- [ ] **Safety Mechanisms**
  - [ ] Slippage protection
  - [ ] Minimum profit checks
  - [ ] Reverting on unprofitable trades
  - [ ] Gas limit enforcement

#### Week 7: Transaction Builder
- [ ] **Execution SDK** (`packages/strategy-sdk/src/arbitrage/`)
  - [ ] `ArbitrageClient` class
  - [ ] PTB (Programmable Transaction Block) builder
  - [ ] Coin selection and merging
  - [ ] Gas estimation

- [ ] **Execution Engine** (`apps/bot/src/executor/`)
  - [ ] Transaction signing
  - [ ] Transaction broadcasting
  - [ ] Status tracking
  - [ ] Retry logic with exponential backoff

- [ ] **Simulation**
  - [ ] Dry-run mode for testing
  - [ ] Profitability validation
  - [ ] Backtesting framework

#### Week 8: Production Hardening
- [ ] **Error Handling**
  - [ ] Transaction failure recovery
  - [ ] Network error handling
  - [ ] State inconsistency detection
  - [ ] Circuit breakers

- [ ] **Performance Optimization**
  - [ ] Transaction parallelization
  - [ ] Nonce management
  - [ ] Gas price optimization
  - [ ] Latency reduction (<2s execution time)

- [ ] **Security**
  - [ ] Private key management (Nautilus TEE)
  - [ ] API key rotation
  - [ ] Rate limiting
  - [ ] Audit logging

**Deliverables**:
- On-chain arbitrage executor
- Complete SDK for arbitrage
- Production-ready bot
- Security hardening

---

### Phase 4: AI Optimization (Weeks 9-11)

**Objective**: AI-powered strategy optimization in TEE

#### Week 9: ML Infrastructure
- [ ] **Data Collection** (via Heimdahl - Carapace Phase 1M)
  - [ ] Historical swap data aggregation
  - [ ] Pool liquidity time series
  - [ ] Gas price patterns
  - [ ] Profitability metrics

- [ ] **Feature Engineering**
  - [ ] Price volatility indicators
  - [ ] Liquidity depth metrics
  - [ ] Time-of-day patterns
  - [ ] DEX-specific features

- [ ] **Training Pipeline**
  - [ ] Model training scripts
  - [ ] Validation framework
  - [ ] Backtesting system
  - [ ] Model versioning

#### Week 10: RL Optimizer (Nautilus TEE)
- [ ] **TEE Setup** (Carapace awesome-seal patterns)
  - [ ] Nautilus enclave configuration
  - [ ] Attestation verification
  - [ ] Secure key management
  - [ ] Model encryption (Seal SDK)

- [ ] **RL Agent** (`apps/bot/src/strategy/ml-optimizer.ts`)
  - [ ] State representation (pool states, prices, etc.)
  - [ ] Action space (trade size, timing)
  - [ ] Reward function (profit - risk)
  - [ ] PPO/DQN training loop

- [ ] **Model Integration**
  - [ ] Real-time inference in TEE
  - [ ] Model updates via Walrus Storage
  - [ ] Fallback to rule-based strategies
  - [ ] Performance tracking

#### Week 11: Strategy Refinement
- [ ] **Multi-Strategy Support**
  - [ ] Conservative strategy (low risk)
  - [ ] Aggressive strategy (high profit)
  - [ ] Balanced strategy (optimal risk/reward)
  - [ ] Dynamic strategy switching

- [ ] **Performance Analytics**
  - [ ] Strategy backtesting
  - [ ] Sharpe ratio calculation
  - [ ] Drawdown analysis
  - [ ] Profit attribution

- [ ] **Continuous Learning**
  - [ ] Online learning updates
  - [ ] Reward shaping
  - [ ] Model drift detection
  - [ ] A/B testing framework

**Deliverables**:
- RL-optimized arbitrage strategies
- TEE-secured ML inference
- Performance analytics dashboard
- Continuous improvement pipeline

---

### Phase 5: Advanced Features (Weeks 12-14)

**Objective**: Cross-chain arbitrage and advanced strategies

#### Week 12: Cross-Chain Infrastructure
- [ ] **Bridge Integration**
  - [ ] Wormhole bridge support
  - [ ] LayerZero integration
  - [ ] Bridge fee calculation
  - [ ] Cross-chain transaction tracking

- [ ] **Multi-Chain Monitoring**
  - [ ] Ethereum price feeds
  - [ ] Arbitrum monitoring
  - [ ] Base DEX tracking
  - [ ] Cross-chain price comparison

- [ ] **Cross-Chain Execution**
  - [ ] Bridge transaction builder
  - [ ] Atomic cross-chain swaps
  - [ ] Profit calculation with bridge fees
  - [ ] Execution timeout handling

#### Week 13: Delta-Neutral Strategies
- [ ] **Delta-Neutral Module** (`move/sources/strategies/delta_neutral.move`)
  - [ ] Long/short position pairing
  - [ ] Automated rebalancing
  - [ ] Funding rate arbitrage
  - [ ] Impermanent loss hedging

- [ ] **Perps Integration** (if available on Sui)
  - [ ] Perpetual futures contracts
  - [ ] Funding rate monitoring
  - [ ] Position management
  - [ ] Liquidation protection

#### Week 14: Testing & Optimization
- [ ] **Comprehensive Testing**
  - [ ] E2E arbitrage scenarios
  - [ ] Flash loan edge cases
  - [ ] Multi-strategy tests
  - [ ] Stress testing (high volume)

- [ ] **Gas Optimization**
  - [ ] Contract optimization
  - [ ] Transaction batching
  - [ ] Coin object management
  - [ ] Gas benchmarking

- [ ] **Security Audit Prep**
  - [ ] Code review
  - [ ] Invariant verification
  - [ ] Formal verification (Move Prover)
  - [ ] Bug bounty program

**Deliverables**:
- Cross-chain arbitrage system
- Delta-neutral strategies
- Production-ready platform
- Security audit documentation

---

### Phase 6: Mainnet Launch (Weeks 15-16)

**Objective**: Production deployment and monitoring

#### Week 15: Deployment
- [ ] **Mainnet Deployment**
  - [ ] Deploy flash pools to Sui mainnet
  - [ ] Deploy arbitrage contracts
  - [ ] Initialize strategy positions
  - [ ] Configure monitoring

- [ ] **Infrastructure Setup**
  - [ ] Production servers (AWS/GCP)
  - [ ] Database clusters
  - [ ] Redis cache
  - [ ] Load balancers

- [ ] **Monitoring & Alerts**
  - [ ] Application metrics (Datadog/New Relic)
  - [ ] Error tracking (Sentry)
  - [ ] Uptime monitoring (Pingdom)
  - [ ] Slack/Discord alerts

#### Week 16: Launch & Iteration
- [ ] **Soft Launch**
  - [ ] Limited capital deployment
  - [ ] Whitelist early users
  - [ ] Monitor performance
  - [ ] Collect feedback

- [ ] **Documentation**
  - [ ] User guides
  - [ ] API documentation
  - [ ] Video tutorials
  - [ ] FAQ section

- [ ] **Community Building**
  - [ ] Discord server
  - [ ] Twitter announcements
  - [ ] Partnership outreach
  - [ ] Bug bounty launch

**Deliverables**:
- Live mainnet deployment
- Production monitoring
- User documentation
- Community channels

---

## Integration Points with Carapace

### 1. Flash Loan Liquidity
```move
// In Carapace: carapace/move/sources/amm/pool.move
public fun extract_flash<X, Y>(
    pool: &mut Pool<X, Y>,
    amount: u64,
    ctx: &mut TxContext
): Coin<X> {
    // Extract liquidity for flash loan
}

public fun return_flash<X, Y>(
    pool: &mut Pool<X, Y>,
    repayment: Coin<X>,
    ctx: &TxContext
) {
    // Return liquidity + fee
}
```

### 2. Arbitrage Execution
```typescript
// In Hatch: apps/bot/src/executor/arbitrage-executor.ts
import { CarapaceClient } from '@carapace/sdk';

const carapacePool = await carapace.getPool(tokenPair);
const externalPool = await getExternalDexPool(tokenPair);

if (carapacePool.price < externalPool.price) {
  // Buy from Carapace, sell to external DEX
  await executeArbitrage(carapacePool, externalPool);
}
```

### 3. Yield Strategies
```move
// In Hatch: move/sources/strategies/leveraged_farm.move
use carapace::vault::{Self, Vault};

public fun deposit_leveraged<X>(
    vault: &mut Vault<X>,
    user_deposit: Coin<X>,
    leverage: u8,
    ctx: &mut TxContext
) {
    // Deposit to TortoiseVault with leverage
}
```

### 4. Oracle Integration
```typescript
// In Hatch: Shared oracle infrastructure
import { OracleClient } from '@carapace/sdk';

const oraclePrice = await oracle.getPrice('SUI/USDC');
const poolPrice = await pool.getPrice();

// Use for price validation and risk management
```

---

## Technology Stack

### Smart Contracts
| Layer | Technology |
|-------|-----------|
| **Language** | Sui Move |
| **Pattern** | Hot Potato (flash loans) |
| **Testing** | Sui Test Framework |
| **Verification** | Move Prover |

### Off-Chain Infrastructure
| Component | Technology |
|-----------|-----------|
| **Runtime** | Bun >= 1.1.0 |
| **Language** | TypeScript |
| **Monitoring** | Heimdahl.xyz |
| **Database** | PostgreSQL + Redis |
| **Cache** | Redis |
| **Logging** | Pino |
| **Metrics** | Prometheus + Grafana |

### AI/ML
| Component | Technology |
|-----------|-----------|
| **Framework** | PyTorch / TensorFlow |
| **TEE** | Nautilus |
| **Storage** | Walrus (encrypted with Seal) |
| **Encryption** | Seal Rust SDK |

---

## Success Metrics

### Technical KPIs
- [ ] Flash loan execution time < 500ms
- [ ] Arbitrage detection latency < 2s
- [ ] Bot uptime > 99.9%
- [ ] Average net profit per trade > $50
- [ ] Successful execution rate > 70%
- [ ] Gas cost per arbitrage < 0.5 SUI

### Business KPIs
- [ ] $1M+ in flash loan volume (first month)
- [ ] 100+ successful arbitrage trades (first week)
- [ ] $10K+ in arbitrage profits (first month)
- [ ] 50+ leveraged positions opened (first month)
- [ ] 5+ integrated DEXs

### Security KPIs
- [ ] Zero security incidents
- [ ] 100% test coverage for critical paths
- [ ] External security audit completed
- [ ] Bug bounty program active
- [ ] Zero loss of user funds

---

## Risk Mitigation

### Technical Risks
| Risk | Mitigation |
|------|-----------|
| Flash loan exploitation | Hot potato pattern prevents non-repayment |
| Front-running | Private mempools, batch processing (Percolator) |
| Price manipulation | Multi-oracle verification, circuit breakers |
| Smart contract bugs | Comprehensive testing, formal verification, audit |
| Bot downtime | Redundant servers, auto-restart, monitoring |

### Financial Risks
| Risk | Mitigation |
|------|-----------|
| Unprofitable trades | Simulation before execution, minimum profit checks |
| High slippage | Liquidity checks, maximum slippage limits |
| Gas price spikes | Dynamic gas estimation, profitability recalculation |
| Market volatility | Position limits, stop-loss mechanisms |

### Operational Risks
| Risk | Mitigation |
|------|-----------|
| Key compromise | Nautilus TEE, key rotation, MFA |
| API rate limits | Multiple RPC providers, backoff strategies |
| Database failure | Regular backups, read replicas |
| Network issues | Multiple RPC endpoints, failover logic |

---

## Lessons from Reference Projects

### From flashloan_masterclass (EVM → Sui)
✅ **Adapted**:
- Flash loan callback pattern → Hot potato pattern
- Leveraged yield farming logic
- Health factor calculation
- Liquidation mechanisms

✅ **Improved**:
- No reentrancy risk (Move's ownership model)
- Type-safe flash loans (generics)
- Compile-time repayment guarantees
- Lower gas costs on Sui

### From trading_bot_v3 (Ethereum → Sui)
✅ **Adapted**:
- Event-driven monitoring architecture
- Price difference calculation
- Profitability determination logic
- Configuration-based DEX management

✅ **Improved**:
- WebSocket + Heimdahl for real-time data
- Multi-DEX support (5+ Sui DEXs)
- AI-powered strategy optimization
- Sui's parallel execution advantage

---

## Next Immediate Actions

### This Week (Week 2)
1. **Integrate flash loans with Carapace pools**
   - Modify `carapace/move/sources/amm/pool.move`
   - Add flash loan extraction/return functions
   - Update tests

2. **Build TypeScript SDK**
   - Create `packages/strategy-sdk/`
   - Implement `FlashLoanClient`
   - Add transaction builders

3. **Deploy to testnet**
   - Publish flash pool contracts
   - Create test pools with liquidity
   - Run integration tests

4. **Set up monitoring**
   - Install Heimdahl CLI
   - Configure event subscriptions
   - Test price aggregation

### Next Week (Week 3)
1. **Heimdahl integration**
   - Real-time swap event monitoring
   - Multi-DEX price aggregation
   - Historical data collection

2. **Profitability calculator**
   - Liquidity-aware trade sizing
   - Slippage simulation
   - Gas cost estimation

3. **Dashboard development**
   - Opportunity feed UI
   - Pool comparison table
   - Bot status monitoring

---

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for development guidelines.

### Development Workflow
1. Fork the repository
2. Create a feature branch
3. Implement feature with tests
4. Run `bun test` and `task move:test`
5. Submit pull request

### Code Standards
- TypeScript strict mode
- Move best practices (hot potato, capabilities)
- 100% test coverage for critical paths
- Documentation for all public APIs

---

## License

MIT License - see [LICENSE](./LICENSE) file for details

---

**Built with slow and steady precision by the TortoiseOS team 🐢🚀**

**Last Updated**: 2025-10-27
**Status**: Phase 1 In Progress (Week 1 Complete)
**Next Milestone**: Carapace Integration (Week 2)
