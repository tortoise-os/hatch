// Copyright (c) TortoiseOS
// SPDX-License-Identifier: MIT

import { SuiClient, SuiEvent } from '@mysten/sui.js/client';
import type { EventId } from '@mysten/sui.js/client';
import pino from 'pino';
import config from '../config/bot.config.json';

const logger = pino({
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'HH:MM:ss',
    },
  },
});

export interface TokenPair {
  tokenA: string;
  tokenASymbol: string;
  tokenB: string;
  tokenBSymbol: string;
}

export interface PoolState {
  poolId: string;
  dex: string;
  tokenPair: TokenPair;
  reserveA: bigint;
  reserveB: bigint;
  price: number;
  lastUpdate: number;
}

export interface ArbitrageOpportunity {
  poolA: PoolState;
  poolB: PoolState;
  tokenPair: TokenPair;
  priceDiff: number;
  priceDiffPercent: number;
  estimatedProfit: bigint;
  buyFrom: string;
  sellTo: string;
}

export class DexMonitor {
  private client: SuiClient;
  private pools: Map<string, PoolState> = new Map();
  private isMonitoring: boolean = false;

  constructor(rpcUrl: string) {
    this.client = new SuiClient({ url: rpcUrl });
  }

  /**
   * Start monitoring DEX pools for price changes
   */
  async start(): Promise<void> {
    logger.info('🚀 Starting DEX monitor...');

    this.isMonitoring = true;

    // Initialize pool states
    await this.initializePools();

    // Subscribe to swap events
    await this.subscribeToSwapEvents();

    // Start price polling as fallback
    this.startPricePolling();

    logger.info('✅ DEX monitor started successfully');
  }

  /**
   * Stop monitoring
   */
  stop(): void {
    this.isMonitoring = false;
    logger.info('🛑 DEX monitor stopped');
  }

  /**
   * Initialize pool states by fetching current data
   */
  private async initializePools(): Promise<void> {
    logger.info('🔄 Initializing pool states...');

    for (const [dexName, dexConfig] of Object.entries(config.DEXES)) {
      if (!dexConfig.ENABLED || !dexConfig.PACKAGE_ID) {
        continue;
      }

      for (const pair of config.TOKEN_PAIRS) {
        if (!pair.ENABLED) continue;

        try {
          const tokenA = config.TOKENS[pair.TOKEN_A];
          const tokenB = config.TOKENS[pair.TOKEN_B];

          // In production, fetch actual pool data
          // For now, initialize with placeholder
          const poolId = `${dexName}_${pair.TOKEN_A}_${pair.TOKEN_B}`;

          this.pools.set(poolId, {
            poolId,
            dex: dexName,
            tokenPair: {
              tokenA: tokenA.ADDRESS,
              tokenASymbol: tokenA.SYMBOL,
              tokenB: tokenB.ADDRESS,
              tokenBSymbol: tokenB.SYMBOL,
            },
            reserveA: 0n,
            reserveB: 0n,
            price: 0,
            lastUpdate: Date.now(),
          });

          logger.debug(`Initialized pool: ${poolId}`);
        } catch (error) {
          logger.error(
            `Failed to initialize pool for ${dexName} ${pair.TOKEN_A}/${pair.TOKEN_B}:`,
            error
          );
        }
      }
    }

    logger.info(`✅ Initialized ${this.pools.size} pools`);
  }

  /**
   * Subscribe to swap events from all DEXs
   */
  private async subscribeToSwapEvents(): Promise<void> {
    if (!config.MONITORING.WEB_SOCKET_ENABLED) {
      logger.info('⚠️  WebSocket monitoring disabled');
      return;
    }

    logger.info('🔌 Subscribing to swap events...');

    for (const [dexName, dexConfig] of Object.entries(config.DEXES)) {
      if (!dexConfig.ENABLED || !dexConfig.PACKAGE_ID) {
        continue;
      }

      try {
        // Subscribe to swap events
        const filter = {
          MoveEventType: `${dexConfig.PACKAGE_ID}::pool::SwapEvent`,
        };

        const unsubscribe = await this.client.subscribeEvent({
          filter,
          onMessage: (event: SuiEvent) => {
            this.handleSwapEvent(event, dexName);
          },
        });

        logger.info(`✅ Subscribed to ${dexName} swap events`);
      } catch (error) {
        logger.error(`Failed to subscribe to ${dexName} events:`, error);
      }
    }
  }

  /**
   * Handle swap event and update pool state
   */
  private async handleSwapEvent(event: SuiEvent, dex: string): Promise<void> {
    try {
      logger.debug(`📊 Swap event from ${dex}:`, event.parsedJson);

      // Update pool state based on event
      // This is a simplified version - real implementation would parse actual event data
      const poolId = `${dex}_SUI_USDC`; // Placeholder

      // Check for arbitrage opportunities
      const opportunities = await this.detectArbitrage();

      if (opportunities.length > 0) {
        logger.info(`🎯 Found ${opportunities.length} arbitrage opportunities`);
        for (const opp of opportunities) {
          this.logOpportunity(opp);
        }
      }
    } catch (error) {
      logger.error('Error handling swap event:', error);
    }
  }

  /**
   * Start polling for price updates
   */
  private startPricePolling(): void {
    setInterval(async () => {
      if (!this.isMonitoring) return;

      try {
        await this.updateAllPrices();
        const opportunities = await this.detectArbitrage();

        if (opportunities.length > 0) {
          logger.info(`🎯 Found ${opportunities.length} arbitrage opportunities`);
          for (const opp of opportunities) {
            this.logOpportunity(opp);
          }
        }
      } catch (error) {
        logger.error('Error during price polling:', error);
      }
    }, config.MONITORING.POLL_INTERVAL_MS);
  }

  /**
   * Update prices for all pools
   */
  private async updateAllPrices(): Promise<void> {
    // In production, fetch actual pool data from chain
    // For now, simulate price updates
    for (const [poolId, pool] of this.pools.entries()) {
      pool.lastUpdate = Date.now();
    }
  }

  /**
   * Detect arbitrage opportunities across DEXs
   */
  private async detectArbitrage(): Promise<ArbitrageOpportunity[]> {
    const opportunities: ArbitrageOpportunity[] = [];

    // Group pools by token pair
    const poolsByPair = new Map<string, PoolState[]>();

    for (const pool of this.pools.values()) {
      const pairKey = `${pool.tokenPair.tokenASymbol}/${pool.tokenPair.tokenBSymbol}`;
      const pools = poolsByPair.get(pairKey) || [];
      pools.push(pool);
      poolsByPair.set(pairKey, pools);
    }

    // Compare prices across DEXs for each pair
    for (const [pairKey, pools] of poolsByPair.entries()) {
      if (pools.length < 2) continue;

      for (let i = 0; i < pools.length; i++) {
        for (let j = i + 1; j < pools.length; j++) {
          const poolA = pools[i];
          const poolB = pools[j];

          // Skip if no price data
          if (poolA.price === 0 || poolB.price === 0) continue;

          const priceDiff = Math.abs(poolA.price - poolB.price);
          const avgPrice = (poolA.price + poolB.price) / 2;
          const priceDiffPercent = (priceDiff / avgPrice) * 100;

          // Check if price difference exceeds threshold
          if (priceDiffPercent >= config.PROJECT_SETTINGS.PRICE_DIFFERENCE) {
            opportunities.push({
              poolA,
              poolB,
              tokenPair: poolA.tokenPair,
              priceDiff,
              priceDiffPercent,
              estimatedProfit: 0n, // Calculate in profitability module
              buyFrom: poolA.price < poolB.price ? poolA.dex : poolB.dex,
              sellTo: poolA.price < poolB.price ? poolB.dex : poolA.dex,
            });
          }
        }
      }
    }

    return opportunities;
  }

  /**
   * Log arbitrage opportunity
   */
  private logOpportunity(opp: ArbitrageOpportunity): void {
    logger.info('─────────────────────────────────────────');
    logger.info(`🎯 ARBITRAGE OPPORTUNITY`);
    logger.info(
      `Pair: ${opp.tokenPair.tokenASymbol}/${opp.tokenPair.tokenBSymbol}`
    );
    logger.info(`Buy from: ${opp.buyFrom} @ ${opp.poolA.price}`);
    logger.info(`Sell to: ${opp.sellTo} @ ${opp.poolB.price}`);
    logger.info(`Price Difference: ${opp.priceDiffPercent.toFixed(2)}%`);
    logger.info('─────────────────────────────────────────');
  }

  /**
   * Get all monitored pools
   */
  getPools(): PoolState[] {
    return Array.from(this.pools.values());
  }

  /**
   * Get pool by ID
   */
  getPool(poolId: string): PoolState | undefined {
    return this.pools.get(poolId);
  }
}
