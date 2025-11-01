// Copyright (c) TortoiseOS
// SPDX-License-Identifier: MIT

/// Cross-DEX arbitrage executor using flash loans
/// Executes atomic arbitrage across multiple DEXs on Sui
module hatch::dex_arb {
    use sui::coin::{Self, Coin};
    use sui::event;
    use hatch::flash_pool::{Self, FlashPool};

    // ===== Errors =====

    /// Arbitrage was not profitable
    const EUnprofitable: u64 = 0;

    /// Slippage exceeded maximum tolerance
    const ESlippageExceeded: u64 = 1;

    // ===== Constants =====

    /// Maximum slippage in basis points (1% = 100 bp)
    const MAX_SLIPPAGE_BPS: u64 = 100;

    /// Basis points denominator
    const BPS_DENOMINATOR: u64 = 10000;

    // ===== Structs =====

    /// Arbitrage execution parameters
    public struct ArbitrageParams<phantom X, phantom Y> has drop {
        /// Amount to flash borrow
        flash_amount: u64,
        /// Minimum output amount (slippage protection)
        min_output: u64,
        /// Expected profit
        expected_profit: u64,
    }

    /// Arbitrage statistics
    public struct ArbitrageStats has key, store {
        id: UID,
        /// Total arbitrages executed
        total_executions: u64,
        /// Total volume traded
        total_volume: u64,
        /// Total profit earned
        total_profit: u64,
        /// Successful executions
        successful_executions: u64,
    }

    // ===== Events =====

    public struct ArbitrageExecuted<phantom X, phantom Y> has copy, drop {
        executor: address,
        amount: u64,
        profit: u64,
        dex_buy: vector<u8>,
        dex_sell: vector<u8>,
    }

    #[allow(unused_field)]
    public struct ArbitrageFailed<phantom X, phantom Y> has copy, drop {
        executor: address,
        amount: u64,
        reason: vector<u8>,
    }

    // ===== Initialization =====

    fun init(ctx: &mut TxContext) {
        let stats = ArbitrageStats {
            id: object::new(ctx),
            total_executions: 0,
            total_volume: 0,
            total_profit: 0,
            successful_executions: 0,
        };
        sui::transfer::share_object(stats);
    }

    // ===== Public Functions =====

    /// Execute cross-DEX arbitrage using flash loan
    ///
    /// Flow:
    /// 1. Flash borrow X from flash pool
    /// 2. Swap X → Y on DEX A (buy at lower price)
    /// 3. Swap Y → X on DEX B (sell at higher price)
    /// 4. Repay flash loan + fee
    /// 5. Keep profit
    ///
    /// Note: This is a simplified version. In production, you'd integrate
    /// with actual DEX modules (Cetus, Turbos, etc.)
    #[test_only]
    public fun execute_arbitrage<X, Y>(
        stats: &mut ArbitrageStats,
        flash_pool: &mut FlashPool<X>,
        params: ArbitrageParams<X, Y>,
        ctx: &mut TxContext
    ): Coin<X> {
        let ArbitrageParams { flash_amount, min_output, expected_profit: _ } = params;

        // Update stats
        stats.total_executions = stats.total_executions + 1;
        stats.total_volume = stats.total_volume + flash_amount;

        // 1. Flash borrow X
        let (mut flash_coins, flash_receipt) = flash_pool::flash_borrow(
            flash_pool,
            flash_amount,
            ctx
        );

        // 2. Swap X → Y on DEX A (simulated - would call actual DEX)
        let y_received = simulate_swap_x_to_y(flash_amount);

        // 3. Swap Y → X on DEX B (simulated - would call actual DEX)
        let x_received = simulate_swap_y_to_x(y_received);

        // Verify slippage protection
        assert!(x_received >= min_output, ESlippageExceeded);

        // 4. Calculate flash loan repayment
        let flash_fee = flash_pool::calculate_flash_fee(flash_amount);
        let repayment_amount = flash_amount + flash_fee;

        // Verify profitability
        assert!(x_received > repayment_amount, EUnprofitable);

        // For simulation: mint additional coins to represent arbitrage profit
        // In production, this would be the actual coins received from DEX swaps
        let profit_amount = x_received - flash_amount;
        let simulated_profit = coin::mint_for_testing<X>(profit_amount, ctx);
        coin::join(&mut flash_coins, simulated_profit);

        // 5. Repay flash loan
        let repayment = coin::split(&mut flash_coins, repayment_amount, ctx);
        flash_pool::flash_repay(flash_pool, repayment, flash_receipt, ctx);

        // Keep remaining as profit
        let profit_coin = flash_coins;

        // Update success stats
        stats.successful_executions = stats.successful_executions + 1;
        let actual_profit = coin::value(&profit_coin);
        stats.total_profit = stats.total_profit + actual_profit;

        // Emit event
        event::emit(ArbitrageExecuted<X, Y> {
            executor: tx_context::sender(ctx),
            amount: flash_amount,
            profit: actual_profit,
            dex_buy: b"DEX_A",
            dex_sell: b"DEX_B",
        });

        profit_coin
    }

    /// Execute arbitrage and transfer profit to executor
    #[test_only]
    #[allow(lint(self_transfer))]
    public fun execute_and_transfer<X, Y>(
        stats: &mut ArbitrageStats,
        flash_pool: &mut FlashPool<X>,
        flash_amount: u64,
        min_output: u64,
        expected_profit: u64,
        ctx: &mut TxContext
    ) {
        let params = ArbitrageParams<X, Y> {
            flash_amount,
            min_output,
            expected_profit,
        };

        let profit = execute_arbitrage(stats, flash_pool, params, ctx);
        sui::transfer::public_transfer(profit, tx_context::sender(ctx));
    }

    /// Calculate minimum output with slippage tolerance
    public fun calculate_min_output(
        expected_output: u64,
        slippage_bps: u64
    ): u64 {
        assert!(slippage_bps <= MAX_SLIPPAGE_BPS, ESlippageExceeded);

        // min_output = expected_output * (BPS_DENOMINATOR - slippage_bps) / BPS_DENOMINATOR
        (expected_output * (BPS_DENOMINATOR - slippage_bps)) / BPS_DENOMINATOR
    }

    /// Calculate expected profit from arbitrage
    public fun calculate_expected_profit(
        buy_amount: u64,
        buy_price: u64,  // Price on DEX A (buy from)
        sell_price: u64, // Price on DEX B (sell to)
        flash_fee_bps: u64
    ): u64 {
        // Expected output after buying and selling
        let expected_output = (buy_amount * sell_price) / buy_price;

        // Subtract flash fee
        let flash_fee = (buy_amount * flash_fee_bps) / BPS_DENOMINATOR;

        if (expected_output > buy_amount + flash_fee) {
            expected_output - buy_amount - flash_fee
        } else {
            0
        }
    }

    // ===== Simulation Functions (Replace with actual DEX calls) =====

    /// Simulate swap X → Y
    /// In production, this would call actual DEX modules
    #[test_only]
    fun simulate_swap_x_to_y(amount_in: u64): u64 {
        // Simulate 1% better price on DEX A
        // This is just for testing - replace with actual DEX integration
        (amount_in * 101) / 100
    }

    /// Simulate swap Y → X
    /// In production, this would call actual DEX modules
    #[test_only]
    fun simulate_swap_y_to_x(amount_in: u64): u64 {
        // Simulate selling at profit
        // This is just for testing - replace with actual DEX integration
        (amount_in * 102) / 100
    }

    // ===== View Functions =====

    /// Get total arbitrages executed
    public fun get_total_executions(stats: &ArbitrageStats): u64 {
        stats.total_executions
    }

    /// Get total volume traded
    public fun get_total_volume(stats: &ArbitrageStats): u64 {
        stats.total_volume
    }

    /// Get total profit earned
    public fun get_total_profit(stats: &ArbitrageStats): u64 {
        stats.total_profit
    }

    /// Get successful executions
    public fun get_successful_executions(stats: &ArbitrageStats): u64 {
        stats.successful_executions
    }

    /// Get success rate (in basis points)
    public fun get_success_rate(stats: &ArbitrageStats): u64 {
        if (stats.total_executions == 0) {
            return 0
        };
        (stats.successful_executions * BPS_DENOMINATOR) / stats.total_executions
    }

    // ===== Test Helpers =====

    #[test_only]
    public fun create_arbitrage_params<X, Y>(
        flash_amount: u64,
        min_output: u64,
        expected_profit: u64
    ): ArbitrageParams<X, Y> {
        ArbitrageParams {
            flash_amount,
            min_output,
            expected_profit,
        }
    }

    #[test_only]
    public fun init_for_testing(ctx: &mut TxContext) {
        init(ctx);
    }
}
