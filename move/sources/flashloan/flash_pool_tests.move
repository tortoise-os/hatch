// Copyright (c) TortoiseOS
// SPDX-License-Identifier: MIT

#[test_only]
module hatch::flash_pool_tests {
    use sui::coin::{Self, Coin};
    use sui::test_scenario::{Self as ts, Scenario};
    use sui::test_utils;
    use hatch::flash_pool::{Self, FlashPool, FlashLoan};

    // ===== Test Coins =====

    public struct USDC has drop {}
    public struct DAI has drop {}

    // ===== Test Setup =====

    const ADMIN: address = @0xAD;
    const USER: address = @0xB0B;
    const INITIAL_LIQUIDITY: u64 = 1_000_000_000; // 1000 USDC (6 decimals)
    const FLASH_AMOUNT: u64 = 100_000_000; // 100 USDC

    fun setup_pool(scenario: &mut Scenario) {
        ts::next_tx(scenario, ADMIN);
        {
            // Mint initial liquidity
            let liquidity = coin::mint_for_testing<USDC>(INITIAL_LIQUIDITY, ts::ctx(scenario));

            // Create and share pool
            flash_pool::create_and_share_pool(liquidity, ts::ctx(scenario));
        };
    }

    // ===== Basic Functionality Tests =====

    #[test]
    fun test_create_pool() {
        let mut scenario_val = ts::begin(ADMIN);
        let scenario = &mut scenario_val;

        setup_pool(scenario);

        ts::next_tx(scenario, ADMIN);
        {
            let mut pool = ts::take_shared<FlashPool<USDC>>(scenario);

            // Verify initial state
            assert!(flash_pool::get_liquidity(&pool) == INITIAL_LIQUIDITY, 0);
            assert!(flash_pool::get_fees_collected(&pool) == 0, 1);
            assert!(flash_pool::get_loans_issued(&pool) == 0, 2);
            assert!(flash_pool::get_total_volume(&pool) == 0, 3);

            ts::return_shared(pool);
        };

        ts::end(scenario_val);
    }

    #[test]
    fun test_flash_loan_basic() {
        let mut scenario_val = ts::begin(ADMIN);
        let scenario = &mut scenario_val;

        setup_pool(scenario);

        // User borrows via flash loan
        ts::next_tx(scenario, USER);
        {
            let mut pool = ts::take_shared<FlashPool<USDC>>(scenario);

            // Borrow
            let (mut borrowed_coin, receipt) = flash_pool::flash_borrow(
                &mut pool,
                FLASH_AMOUNT,
                ts::ctx(scenario)
            );

            // Verify borrowed amount
            assert!(coin::value(&borrowed_coin) == FLASH_AMOUNT, 0);

            // Calculate fee
            let fee = flash_pool::calculate_flash_fee(FLASH_AMOUNT);

            // Simulate using the borrowed funds (just mint fee for repayment)
            let mut fee_coin = coin::mint_for_testing<USDC>(fee, ts::ctx(scenario));
            coin::join(&mut borrowed_coin, fee_coin);

            // Repay
            flash_pool::flash_repay(&mut pool, borrowed_coin, receipt, ts::ctx(scenario));

            // Verify pool state after repayment
            assert!(flash_pool::get_liquidity(&pool) == INITIAL_LIQUIDITY + fee, 1);
            assert!(flash_pool::get_fees_collected(&pool) == fee, 2);
            assert!(flash_pool::get_loans_issued(&pool) == 1, 3);
            assert!(flash_pool::get_total_volume(&pool) == FLASH_AMOUNT, 4);

            ts::return_shared(pool);
        };

        ts::end(scenario_val);
    }

    #[test]
    fun test_multiple_flash_loans() {
        let mut scenario_val = ts::begin(ADMIN);
        let scenario = &mut scenario_val;

        setup_pool(scenario);

        // First loan
        ts::next_tx(scenario, USER);
        {
            let mut pool = ts::take_shared<FlashPool<USDC>>(scenario);
            let (mut borrowed, receipt) = flash_pool::flash_borrow(&mut pool, FLASH_AMOUNT, ts::ctx(scenario));
            let fee = flash_pool::calculate_flash_fee(FLASH_AMOUNT);
            let mut fee_coin = coin::mint_for_testing<USDC>(fee, ts::ctx(scenario));
            coin::join(&mut borrowed, fee_coin);
            flash_pool::flash_repay(&mut pool, borrowed, receipt, ts::ctx(scenario));
            ts::return_shared(pool);
        };

        // Second loan
        ts::next_tx(scenario, USER);
        {
            let mut pool = ts::take_shared<FlashPool<USDC>>(scenario);
            let (mut borrowed, receipt) = flash_pool::flash_borrow(&mut pool, FLASH_AMOUNT * 2, ts::ctx(scenario));
            let fee = flash_pool::calculate_flash_fee(FLASH_AMOUNT * 2);
            let mut fee_coin = coin::mint_for_testing<USDC>(fee, ts::ctx(scenario));
            coin::join(&mut borrowed, fee_coin);
            flash_pool::flash_repay(&mut pool, borrowed, receipt, ts::ctx(scenario));

            // Verify cumulative stats
            assert!(flash_pool::get_loans_issued(&pool) == 2, 0);
            assert!(flash_pool::get_total_volume(&pool) == FLASH_AMOUNT * 3, 1);

            ts::return_shared(pool);
        };

        ts::end(scenario_val);
    }

    #[test]
    fun test_add_remove_liquidity() {
        let mut scenario_val = ts::begin(ADMIN);
        let scenario = &mut scenario_val;

        setup_pool(scenario);

        // Add liquidity
        ts::next_tx(scenario, ADMIN);
        {
            let mut pool = ts::take_shared<FlashPool<USDC>>(scenario);
            let additional = coin::mint_for_testing<USDC>(500_000_000, ts::ctx(scenario));
            flash_pool::add_liquidity(&mut pool, additional);

            assert!(flash_pool::get_liquidity(&pool) == INITIAL_LIQUIDITY + 500_000_000, 0);

            ts::return_shared(pool);
        };

        // Remove liquidity
        ts::next_tx(scenario, ADMIN);
        {
            let mut pool = ts::take_shared<FlashPool<USDC>>(scenario);
            let withdrawn = flash_pool::remove_liquidity(&mut pool, 200_000_000, ts::ctx(scenario));

            assert!(coin::value(&withdrawn) == 200_000_000, 0);
            assert!(flash_pool::get_liquidity(&pool) == INITIAL_LIQUIDITY + 300_000_000, 1);

            test_utils::destroy(withdrawn);
            ts::return_shared(pool);
        };

        ts::end(scenario_val);
    }

    #[test]
    fun test_fee_calculation() {
        // Test 0.05% fee calculation
        assert!(flash_pool::calculate_flash_fee(100_000_000) == 50_000, 0); // 100 USDC -> 0.05 USDC fee
        assert!(flash_pool::calculate_flash_fee(1_000_000_000) == 500_000, 1); // 1000 USDC -> 0.5 USDC fee
        assert!(flash_pool::calculate_flash_fee(10_000) == 5, 2); // 0.01 USDC -> 0.000005 USDC fee
    }

    // ===== Error Tests =====

    #[test]
    #[expected_failure(abort_code = flash_pool::EInsufficientRepayment)]
    fun test_insufficient_repayment() {
        let mut scenario_val = ts::begin(ADMIN);
        let scenario = &mut scenario_val;

        setup_pool(scenario);

        ts::next_tx(scenario, USER);
        {
            let mut pool = ts::take_shared<FlashPool<USDC>>(scenario);
            let (mut borrowed, receipt) = flash_pool::flash_borrow(&mut pool, FLASH_AMOUNT, ts::ctx(scenario));

            // Try to repay without fee (should fail)
            flash_pool::flash_repay(&mut pool, borrowed, receipt, ts::ctx(scenario));

            ts::return_shared(pool);
        };

        ts::end(scenario_val);
    }

    #[test]
    #[expected_failure(abort_code = flash_pool::EInsufficientLiquidity)]
    fun test_insufficient_liquidity() {
        let mut scenario_val = ts::begin(ADMIN);
        let scenario = &mut scenario_val;

        setup_pool(scenario);

        ts::next_tx(scenario, USER);
        {
            let mut pool = ts::take_shared<FlashPool<USDC>>(scenario);

            // Try to borrow more than available (should fail)
            let (mut borrowed, receipt) = flash_pool::flash_borrow(
                &mut pool,
                INITIAL_LIQUIDITY + 1,
                ts::ctx(scenario)
            );

            // Cleanup
            let fee = flash_pool::calculate_flash_fee(INITIAL_LIQUIDITY + 1);
            let mut fee_coin = coin::mint_for_testing<USDC>(fee, ts::ctx(scenario));
            coin::join(&mut borrowed, fee_coin);
            flash_pool::flash_repay(&mut pool, borrowed, receipt, ts::ctx(scenario));

            ts::return_shared(pool);
        };

        ts::end(scenario_val);
    }

    #[test]
    #[expected_failure(abort_code = flash_pool::EZeroAmount)]
    fun test_zero_amount_borrow() {
        let mut scenario_val = ts::begin(ADMIN);
        let scenario = &mut scenario_val;

        setup_pool(scenario);

        ts::next_tx(scenario, USER);
        {
            let mut pool = ts::take_shared<FlashPool<USDC>>(scenario);

            // Try to borrow zero amount (should fail)
            let (mut borrowed, receipt) = flash_pool::flash_borrow(&mut pool, 0, ts::ctx(scenario));

            // Cleanup
            flash_pool::flash_repay(&mut pool, borrowed, receipt, ts::ctx(scenario));

            ts::return_shared(pool);
        };

        ts::end(scenario_val);
    }

    // ===== Advanced Scenario Tests =====

    #[test]
    fun test_arbitrage_scenario() {
        // Simulate an arbitrage scenario using flash loan
        let mut scenario_val = ts::begin(ADMIN);
        let scenario = &mut scenario_val;

        setup_pool(scenario);

        ts::next_tx(scenario, USER);
        {
            let mut pool = ts::take_shared<FlashPool<USDC>>(scenario);

            // 1. Flash borrow 100 USDC
            let (mut borrowed, receipt) = flash_pool::flash_borrow(&mut pool, FLASH_AMOUNT, ts::ctx(scenario));

            // 2. Simulate arbitrage profit (10% profit for this test)
            let profit = coin::mint_for_testing<USDC>(10_000_000, ts::ctx(scenario)); // 10 USDC profit
            coin::join(&mut borrowed, profit);

            // 3. Add flash fee
            let fee = flash_pool::calculate_flash_fee(FLASH_AMOUNT);
            let mut fee_coin = coin::mint_for_testing<USDC>(fee, ts::ctx(scenario));
            coin::join(&mut borrowed, fee_coin);

            // 4. Repay loan
            flash_pool::flash_repay(&mut pool, borrowed, receipt, ts::ctx(scenario));

            ts::return_shared(pool);
        };

        ts::end(scenario_val);
    }

    // ===== Edge Case Tests =====

    #[test]
    fun test_dust_amount_flash_loan() {
        // Test borrowing very small amounts (1 unit)
        let mut scenario_val = ts::begin(ADMIN);
        let scenario = &mut scenario_val;

        setup_pool(scenario);

        ts::next_tx(scenario, USER);
        {
            let mut pool = ts::take_shared<FlashPool<USDC>>(scenario);

            // Borrow just 1 unit (0.000001 USDC with 6 decimals)
            let (mut borrowed, receipt) = flash_pool::flash_borrow(&mut pool, 1, ts::ctx(scenario));

            assert!(coin::value(&borrowed) == 1, 0);

            // Fee should be 0 for dust amounts (5 bps of 1 = 0)
            let fee = flash_pool::calculate_flash_fee(1);
            assert!(fee == 0, 1);

            // Repay (no fee needed for dust)
            flash_pool::flash_repay(&mut pool, borrowed, receipt, ts::ctx(scenario));

            ts::return_shared(pool);
        };

        ts::end(scenario_val);
    }

    #[test]
    fun test_max_pool_capacity_borrow() {
        // Test borrowing exact pool capacity
        let mut scenario_val = ts::begin(ADMIN);
        let scenario = &mut scenario_val;

        setup_pool(scenario);

        ts::next_tx(scenario, USER);
        {
            let mut pool = ts::take_shared<FlashPool<USDC>>(scenario);

            // Borrow entire pool
            let (mut borrowed, receipt) = flash_pool::flash_borrow(
                &mut pool,
                INITIAL_LIQUIDITY,
                ts::ctx(scenario)
            );

            assert!(coin::value(&borrowed) == INITIAL_LIQUIDITY, 0);
            assert!(flash_pool::get_liquidity(&pool) == 0, 1);

            // Add fee and repay
            let fee = flash_pool::calculate_flash_fee(INITIAL_LIQUIDITY);
            let mut fee_coin = coin::mint_for_testing<USDC>(fee, ts::ctx(scenario));
            coin::join(&mut borrowed, fee_coin);

            flash_pool::flash_repay(&mut pool, borrowed, receipt, ts::ctx(scenario));

            ts::return_shared(pool);
        };

        ts::end(scenario_val);
    }

    #[test]
    fun test_consecutive_flash_loans_same_tx() {
        // Test multiple flash loans in succession (simulating complex strategy)
        let mut scenario_val = ts::begin(ADMIN);
        let scenario = &mut scenario_val;

        setup_pool(scenario);

        ts::next_tx(scenario, USER);
        {
            let mut pool = ts::take_shared<FlashPool<USDC>>(scenario);

            // First loan
            let (mut borrowed1, receipt1) = flash_pool::flash_borrow(&mut pool, 100_000_000, ts::ctx(scenario));
            let fee1 = flash_pool::calculate_flash_fee(100_000_000);
            let mut fee_coin1 = coin::mint_for_testing<USDC>(fee1, ts::ctx(scenario));
            coin::join(&mut borrowed1, fee_coin1);
            flash_pool::flash_repay(&mut pool, borrowed1, receipt1, ts::ctx(scenario));

            // Second loan (larger)
            let (mut borrowed2, receipt2) = flash_pool::flash_borrow(&mut pool, 500_000_000, ts::ctx(scenario));
            let fee2 = flash_pool::calculate_flash_fee(500_000_000);
            let mut fee_coin2 = coin::mint_for_testing<USDC>(fee2, ts::ctx(scenario));
            coin::join(&mut borrowed2, fee_coin2);
            flash_pool::flash_repay(&mut pool, borrowed2, receipt2, ts::ctx(scenario));

            // Verify stats
            assert!(flash_pool::get_loans_issued(&pool) == 2, 0);
            assert!(flash_pool::get_total_volume(&pool) == 600_000_000, 1);

            ts::return_shared(pool);
        };

        ts::end(scenario_val);
    }

    #[test]
    fun test_fee_accumulation() {
        // Test that fees properly accumulate over multiple loans
        let mut scenario_val = ts::begin(ADMIN);
        let scenario = &mut scenario_val;

        setup_pool(scenario);

        let expected_fee1 = flash_pool::calculate_flash_fee(100_000_000);
        let expected_fee2 = flash_pool::calculate_flash_fee(200_000_000);
        let expected_fee3 = flash_pool::calculate_flash_fee(300_000_000);

        // Execute 3 flash loans
        let mut i = 0;
        while (i < 3) {
            ts::next_tx(scenario, USER);
            {
                let mut pool = ts::take_shared<FlashPool<USDC>>(scenario);
                let amount = (i + 1) * 100_000_000;
                let (mut borrowed, receipt) = flash_pool::flash_borrow(&mut pool, amount, ts::ctx(scenario));
                let fee = flash_pool::calculate_flash_fee(amount);
                let mut fee_coin = coin::mint_for_testing<USDC>(fee, ts::ctx(scenario));
                coin::join(&mut borrowed, fee_coin);
                flash_pool::flash_repay(&mut pool, borrowed, receipt, ts::ctx(scenario));
                ts::return_shared(pool);
            };
            i = i + 1;
        };

        // Verify total fees
        ts::next_tx(scenario, USER);
        {
            let pool = ts::take_shared<FlashPool<USDC>>(scenario);
            let total_fees = flash_pool::get_fees_collected(&pool);
            let expected_total = expected_fee1 + expected_fee2 + expected_fee3;
            assert!(total_fees == expected_total, 0);
            ts::return_shared(pool);
        };

        ts::end(scenario_val);
    }

    #[test]
    fun test_liquidity_grows_with_fees() {
        // Test that pool liquidity increases with accumulated fees
        let mut scenario_val = ts::begin(ADMIN);
        let scenario = &mut scenario_val;

        setup_pool(scenario);

        ts::next_tx(scenario, USER);
        {
            let mut pool = ts::take_shared<FlashPool<USDC>>(scenario);
            let initial_liquidity = flash_pool::get_liquidity(&pool);

            let (mut borrowed, receipt) = flash_pool::flash_borrow(&mut pool, FLASH_AMOUNT, ts::ctx(scenario));
            let fee = flash_pool::calculate_flash_fee(FLASH_AMOUNT);
            let mut fee_coin = coin::mint_for_testing<USDC>(fee, ts::ctx(scenario));
            coin::join(&mut borrowed, fee_coin);
            flash_pool::flash_repay(&mut pool, borrowed, receipt, ts::ctx(scenario));

            let final_liquidity = flash_pool::get_liquidity(&pool);
            assert!(final_liquidity == initial_liquidity + fee, 0);

            ts::return_shared(pool);
        };

        ts::end(scenario_val);
    }
}
