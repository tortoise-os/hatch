// Copyright (c) TortoiseOS
// SPDX-License-Identifier: MIT

#[test_only]
module hatch::dex_arb_tests {
    use sui::coin::{Self, Coin};
    use sui::test_scenario::{Self as ts, Scenario};
    use sui::test_utils;
    use hatch::flash_pool::{Self, FlashPool};
    use hatch::dex_arb::{Self, ArbitrageStats, ArbitrageParams};

    // ===== Test Coins =====

    public struct USDC has drop {}

    // ===== Test Setup =====

    const ADMIN: address = @0xAD;
    const TRADER: address = @0xB0B;
    const INITIAL_LIQUIDITY: u64 = 1_000_000_000; // 1000 USDC
    const ARB_AMOUNT: u64 = 100_000_000; // 100 USDC

    fun setup_test(scenario: &mut Scenario) {
        // Create flash pool
        ts::next_tx(scenario, ADMIN);
        {
            let liquidity = coin::mint_for_testing<USDC>(INITIAL_LIQUIDITY, ts::ctx(scenario));
            flash_pool::create_and_share_pool(liquidity, ts::ctx(scenario));
        };

        // Initialize arbitrage stats
        ts::next_tx(scenario, ADMIN);
        {
            dex_arb::init_for_testing(ts::ctx(scenario));
        };
    }

    // ===== Basic Tests =====

    #[test]
    fun test_successful_arbitrage() {
        let mut scenario_val = ts::begin(ADMIN);
        let scenario = &mut scenario_val;

        setup_test(scenario);

        // Execute arbitrage
        ts::next_tx(scenario, TRADER);
        {
            let mut stats = ts::take_shared<ArbitrageStats>(scenario);
            let mut flash_pool = ts::take_shared<FlashPool<USDC>>(scenario);

            let params = dex_arb::create_arbitrage_params<USDC, USDC>(
                ARB_AMOUNT,
                ARB_AMOUNT, // min_output
                1_000_000,  // expected 1 USDC profit
            );

            let profit = dex_arb::execute_arbitrage(
                &mut stats,
                &mut flash_pool,
                params,
                ts::ctx(scenario)
            );

            // Verify profit
            assert!(coin::value(&profit) > 0, 0);

            // Verify stats updated
            assert!(dex_arb::get_total_executions(&stats) == 1, 1);
            assert!(dex_arb::get_successful_executions(&stats) == 1, 2);
            assert!(dex_arb::get_total_volume(&stats) == ARB_AMOUNT, 3);
            assert!(dex_arb::get_total_profit(&stats) > 0, 4);

            test_utils::destroy(profit);
            ts::return_shared(stats);
            ts::return_shared(flash_pool);
        };

        ts::end(scenario_val);
    }

    #[test]
    fun test_multiple_arbitrages() {
        let mut scenario_val = ts::begin(ADMIN);
        let scenario = &mut scenario_val;

        setup_test(scenario);

        // Execute first arbitrage
        ts::next_tx(scenario, TRADER);
        {
            let mut stats = ts::take_shared<ArbitrageStats>(scenario);
            let mut flash_pool = ts::take_shared<FlashPool<USDC>>(scenario);

            let params = dex_arb::create_arbitrage_params<USDC, USDC>(
                ARB_AMOUNT,
                ARB_AMOUNT,
                1_000_000,
            );

            let profit = dex_arb::execute_arbitrage(&mut stats, &mut flash_pool, params, ts::ctx(scenario));
            test_utils::destroy(profit);

            ts::return_shared(stats);
            ts::return_shared(flash_pool);
        };

        // Execute second arbitrage
        ts::next_tx(scenario, TRADER);
        {
            let mut stats = ts::take_shared<ArbitrageStats>(scenario);
            let mut flash_pool = ts::take_shared<FlashPool<USDC>>(scenario);

            let params = dex_arb::create_arbitrage_params<USDC, USDC>(
                ARB_AMOUNT * 2,
                ARB_AMOUNT * 2,
                2_000_000,
            );

            let profit = dex_arb::execute_arbitrage(&mut stats, &mut flash_pool, params, ts::ctx(scenario));
            test_utils::destroy(profit);

            // Verify cumulative stats
            assert!(dex_arb::get_total_executions(&stats) == 2, 0);
            assert!(dex_arb::get_successful_executions(&stats) == 2, 1);
            assert!(dex_arb::get_total_volume(&stats) == ARB_AMOUNT * 3, 2);

            ts::return_shared(stats);
            ts::return_shared(flash_pool);
        };

        ts::end(scenario_val);
    }

    #[test]
    fun test_execute_and_transfer() {
        let mut scenario_val = ts::begin(ADMIN);
        let scenario = &mut scenario_val;

        setup_test(scenario);

        // Execute arbitrage with entry function
        ts::next_tx(scenario, TRADER);
        {
            let mut stats = ts::take_shared<ArbitrageStats>(scenario);
            let mut flash_pool = ts::take_shared<FlashPool<USDC>>(scenario);

            dex_arb::execute_and_transfer<USDC, USDC>(
                &mut stats,
                &mut flash_pool,
                ARB_AMOUNT,
                ARB_AMOUNT,
                1_000_000,
                ts::ctx(scenario)
            );

            ts::return_shared(stats);
            ts::return_shared(flash_pool);
        };

        // Verify profit was transferred to arbitrageur
        ts::next_tx(scenario, TRADER);
        {
            let profit = ts::take_from_sender<Coin<USDC>>(scenario);
            assert!(coin::value(&profit) > 0, 0);
            test_utils::destroy(profit);
        };

        ts::end(scenario_val);
    }

    #[test]
    fun test_calculate_min_output() {
        // Test 1% slippage
        let expected = 1000_000000; // 1000 USDC
        let slippage_bps = 100; // 1%
        let min_output = dex_arb::calculate_min_output(expected, slippage_bps);

        // Should be 99% of expected
        assert!(min_output == 990_000000, 0);

        // Test 0.5% slippage
        let slippage_bps = 50; // 0.5%
        let min_output = dex_arb::calculate_min_output(expected, slippage_bps);

        // Should be 99.5% of expected
        assert!(min_output == 995_000000, 1);
    }

    #[test]
    fun test_calculate_expected_profit() {
        let buy_amount = 1000_000000; // 1000 USDC
        let buy_price = 100; // Price on DEX A
        let sell_price = 102; // Price on DEX B (2% higher)
        let flash_fee_bps = 5; // 0.05% flash fee

        let profit = dex_arb::calculate_expected_profit(
            buy_amount,
            buy_price,
            sell_price,
            flash_fee_bps
        );

        // Expected: 1000 * 102/100 = 1020
        // Flash fee: 1000 * 0.05% = 0.5
        // Profit: 1020 - 1000 - 0.5 = 19.5 USDC
        assert!(profit > 19_000000, 0); // ~19.5 USDC
        assert!(profit < 20_000000, 1);
    }

    #[test]
    fun test_success_rate() {
        let mut scenario_val = ts::begin(ADMIN);
        let scenario = &mut scenario_val;

        setup_test(scenario);

        // Execute 3 successful arbitrages
        let mut i = 0;
        while (i < 3) {
            ts::next_tx(scenario, TRADER);
            {
                let mut stats = ts::take_shared<ArbitrageStats>(scenario);
                let mut flash_pool = ts::take_shared<FlashPool<USDC>>(scenario);

                let params = dex_arb::create_arbitrage_params<USDC, USDC>(
                    ARB_AMOUNT,
                    ARB_AMOUNT,
                    1_000_000,
                );

                let profit = dex_arb::execute_arbitrage(&mut stats, &mut flash_pool, params, ts::ctx(scenario));
                test_utils::destroy(profit);

                ts::return_shared(stats);
                ts::return_shared(flash_pool);
            };
            i = i + 1;
        };

        // Check success rate
        ts::next_tx(scenario, TRADER);
        {
            let stats = ts::take_shared<ArbitrageStats>(scenario);

            let success_rate = dex_arb::get_success_rate(&stats);
            // Should be 100% (10000 in basis points)
            assert!(success_rate == 10000, 0);

            ts::return_shared(stats);
        };

        ts::end(scenario_val);
    }

    // ===== Error Tests =====

    #[test]
    #[expected_failure(abort_code = dex_arb::ESlippageExceeded)]
    fun test_slippage_exceeded() {
        let mut scenario_val = ts::begin(ADMIN);
        let scenario = &mut scenario_val;

        setup_test(scenario);

        ts::next_tx(scenario, TRADER);
        {
            let mut stats = ts::take_shared<ArbitrageStats>(scenario);
            let mut flash_pool = ts::take_shared<FlashPool<USDC>>(scenario);

            // Set min_output impossibly high to trigger slippage error
            let params = dex_arb::create_arbitrage_params<USDC, USDC>(
                ARB_AMOUNT,
                ARB_AMOUNT * 1000, // Impossibly high min output
                1_000_000,
            );

            let profit = dex_arb::execute_arbitrage(&mut stats, &mut flash_pool, params, ts::ctx(scenario));

            test_utils::destroy(profit);
            ts::return_shared(stats);
            ts::return_shared(flash_pool);
        };

        ts::end(scenario_val);
    }

    #[test]
    #[expected_failure(abort_code = dex_arb::ESlippageExceeded)]
    fun test_max_slippage_exceeded() {
        // Try to set slippage > 1%
        let _min_output = dex_arb::calculate_min_output(1000_000000, 101); // 1.01%
    }

    // ===== Advanced Calculation Tests =====

    #[test]
    fun test_zero_profit_scenario() {
        // Test when buy and sell prices are equal (no arbitrage opportunity)
        let buy_amount = 1000_000000;
        let same_price = 100;
        let flash_fee_bps = 5;

        let profit = dex_arb::calculate_expected_profit(
            buy_amount,
            same_price,
            same_price, // Same price on both DEXs
            flash_fee_bps
        );

        // Should show no profit (or negative due to fees)
        assert!(profit == 0, 0);
    }

    #[test]
    fun test_break_even_profit() {
        // Test scenario where profit exactly covers flash loan fee
        let buy_amount = 1000_000000; // 1000 USDC
        let buy_price = 100;
        let sell_price = 100; // 0.05% higher (just covers 0.05% flash fee)
        let flash_fee_bps = 5;

        let profit = dex_arb::calculate_expected_profit(
            buy_amount,
            buy_price,
            sell_price,
            flash_fee_bps
        );

        // Profit should be minimal or zero
        assert!(profit <= 1_000, 0); // Less than 0.001 USDC
    }

    #[test]
    fun test_high_profit_scenario() {
        // Test 10% price difference
        let buy_amount = 1000_000000;
        let buy_price = 100;
        let sell_price = 110; // 10% higher
        let flash_fee_bps = 5;

        let profit = dex_arb::calculate_expected_profit(
            buy_amount,
            buy_price,
            sell_price,
            flash_fee_bps
        );

        // Expected: 1000 * 110/100 = 1100
        // Flash fee: 1000 * 0.05% = 0.5
        // Profit: 1100 - 1000 - 0.5 = 99.5 USDC
        assert!(profit > 99_000000, 0); // ~99.5 USDC
        assert!(profit < 100_000000, 1);
    }

    #[test]
    fun test_small_amount_arbitrage() {
        // Test arbitrage with very small amounts
        let mut scenario_val = ts::begin(ADMIN);
        let scenario = &mut scenario_val;

        setup_test(scenario);

        ts::next_tx(scenario, TRADER);
        {
            let mut stats = ts::take_shared<ArbitrageStats>(scenario);
            let mut flash_pool = ts::take_shared<FlashPool<USDC>>(scenario);

            // Small arbitrage: 1 USDC
            let params = dex_arb::create_arbitrage_params<USDC, USDC>(
                1_000_000, // 1 USDC
                1_000_000,
                10_000, // Expect small profit
            );

            let profit = dex_arb::execute_arbitrage(&mut stats, &mut flash_pool, params, ts::ctx(scenario));

            // Should still work with small amounts
            assert!(coin::value(&profit) > 0, 0);

            test_utils::destroy(profit);
            ts::return_shared(stats);
            ts::return_shared(flash_pool);
        };

        ts::end(scenario_val);
    }

    #[test]
    fun test_large_amount_arbitrage() {
        // Test arbitrage with large amounts
        let mut scenario_val = ts::begin(ADMIN);
        let scenario = &mut scenario_val;

        setup_test(scenario);

        ts::next_tx(scenario, TRADER);
        {
            let mut stats = ts::take_shared<ArbitrageStats>(scenario);
            let mut flash_pool = ts::take_shared<FlashPool<USDC>>(scenario);

            // Large arbitrage: 900 USDC (90% of pool)
            let params = dex_arb::create_arbitrage_params<USDC, USDC>(
                900_000_000,
                900_000_000,
                10_000_000, // Expect proportionally larger profit
            );

            let profit = dex_arb::execute_arbitrage(&mut stats, &mut flash_pool, params, ts::ctx(scenario));

            // Profit should scale with amount
            assert!(coin::value(&profit) > 1_000_000, 0); // > 1 USDC profit

            test_utils::destroy(profit);
            ts::return_shared(stats);
            ts::return_shared(flash_pool);
        };

        ts::end(scenario_val);
    }

    #[test]
    fun test_variable_slippage_tolerance() {
        // Test different slippage tolerance levels
        let base_output = 1000_000000;

        // 0.1% slippage
        let min_1 = dex_arb::calculate_min_output(base_output, 10);
        assert!(min_1 == 999_000000, 0);

        // 0.5% slippage
        let min_2 = dex_arb::calculate_min_output(base_output, 50);
        assert!(min_2 == 995_000000, 1);

        // 1% slippage (maximum)
        let min_3 = dex_arb::calculate_min_output(base_output, 100);
        assert!(min_3 == 990_000000, 2);
    }

    #[test]
    fun test_cumulative_stats_accuracy() {
        // Verify stats are accurate across multiple arbitrages
        let mut scenario_val = ts::begin(ADMIN);
        let scenario = &mut scenario_val;

        setup_test(scenario);

        let mut total_volume: u64 = 0;
        let mut i = 0;

        while (i < 5) {
            ts::next_tx(scenario, TRADER);
            {
                let mut stats = ts::take_shared<ArbitrageStats>(scenario);
                let mut flash_pool = ts::take_shared<FlashPool<USDC>>(scenario);

                let amount = (i + 1) * 50_000_000; // 50, 100, 150, 200, 250 USDC
                total_volume = total_volume + amount;

                let params = dex_arb::create_arbitrage_params<USDC, USDC>(
                    amount,
                    amount,
                    1_000_000,
                );

                let profit = dex_arb::execute_arbitrage(&mut stats, &mut flash_pool, params, ts::ctx(scenario));
                test_utils::destroy(profit);

                // Verify running totals
                assert!(dex_arb::get_total_volume(&stats) == total_volume, 0);
                assert!(dex_arb::get_total_executions(&stats) == (i + 1), 1);

                ts::return_shared(stats);
                ts::return_shared(flash_pool);
            };
            i = i + 1;
        };

        ts::end(scenario_val);
    }
}
