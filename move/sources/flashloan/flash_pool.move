// Copyright (c) TortoiseOS
// SPDX-License-Identifier: MIT

/// Flash loan implementation using the "hot potato" pattern
/// Ensures loans MUST be repaid within the same transaction
module hatch::flash_pool {
    use sui::coin::{Self, Coin};
    use sui::balance::{Self, Balance};
    use sui::event;

    // ===== Errors =====

    /// Insufficient repayment amount (must include fee)
    const EInsufficientRepayment: u64 = 0;

    /// Pool has insufficient liquidity for flash loan
    const EInsufficientLiquidity: u64 = 1;

    /// Flash loan amount is zero
    const EZeroAmount: u64 = 2;

    // ===== Constants =====

    /// Flash loan fee in basis points (0.05% = 5 bp)
    const FLASH_FEE_BPS: u64 = 5;

    /// Basis points denominator
    const BPS_DENOMINATOR: u64 = 10000;

    // ===== Structs =====

    /// Hot potato receipt - MUST be consumed in the same transaction
    /// This is the key pattern that ensures flash loans are always repaid
    public struct FlashLoan<phantom X> {
        /// Amount borrowed (excluding fee)
        amount: u64,
        /// Fee amount to be paid
        fee: u64,
        /// Pool ID this loan came from
        pool_id: ID,
    }

    /// Flash loan pool holding liquidity
    /// This can integrate with Carapace pools or be standalone
    public struct FlashPool<phantom X> has key, store {
        id: UID,
        /// Available liquidity for flash loans
        balance: Balance<X>,
        /// Total fees collected
        fees_collected: u64,
        /// Total flash loans issued
        loans_issued: u64,
        /// Total volume borrowed
        total_volume: u64,
    }

    // ===== Events =====

    public struct FlashLoanBorrowed<phantom X> has copy, drop {
        pool_id: ID,
        amount: u64,
        fee: u64,
        borrower: address,
    }

    public struct FlashLoanRepaid<phantom X> has copy, drop {
        pool_id: ID,
        amount: u64,
        fee: u64,
        borrower: address,
    }

    // ===== Public Functions =====

    /// Create a new flash loan pool
    public fun create_pool<X>(
        initial_liquidity: Coin<X>,
        ctx: &mut TxContext
    ): FlashPool<X> {
        FlashPool {
            id: object::new(ctx),
            balance: coin::into_balance(initial_liquidity),
            fees_collected: 0,
            loans_issued: 0,
            total_volume: 0,
        }
    }

    /// Borrow coins via flash loan
    /// Returns the borrowed coins and a hot potato receipt that MUST be consumed
    public fun flash_borrow<X>(
        pool: &mut FlashPool<X>,
        amount: u64,
        ctx: &mut TxContext
    ): (Coin<X>, FlashLoan<X>) {
        // Validate amount
        assert!(amount > 0, EZeroAmount);
        assert!(balance::value(&pool.balance) >= amount, EInsufficientLiquidity);

        // Calculate fee
        let fee = calculate_flash_fee(amount);

        // Extract coins from pool
        let borrowed_balance = balance::split(&mut pool.balance, amount);
        let borrowed_coin = coin::from_balance(borrowed_balance, ctx);

        // Update pool stats
        pool.loans_issued = pool.loans_issued + 1;
        pool.total_volume = pool.total_volume + amount;

        // Emit event
        event::emit(FlashLoanBorrowed<X> {
            pool_id: object::uid_to_inner(&pool.id),
            amount,
            fee,
            borrower: tx_context::sender(ctx),
        });

        // Create hot potato receipt
        let receipt = FlashLoan {
            amount,
            fee,
            pool_id: object::uid_to_inner(&pool.id),
        };

        (borrowed_coin, receipt)
    }

    /// Repay the flash loan with fee
    /// This function consumes the hot potato, completing the loan
    public fun flash_repay<X>(
        pool: &mut FlashPool<X>,
        repayment: Coin<X>,
        receipt: FlashLoan<X>,
        ctx: &TxContext
    ) {
        let FlashLoan { amount, fee, pool_id } = receipt;

        // Verify this is the correct pool
        assert!(pool_id == object::uid_to_inner(&pool.id), EInsufficientRepayment);

        // Verify repayment amount includes fee
        let repayment_value = coin::value(&repayment);
        assert!(repayment_value >= amount + fee, EInsufficientRepayment);

        // Return funds to pool
        let repayment_balance = coin::into_balance(repayment);
        balance::join(&mut pool.balance, repayment_balance);

        // Track fees
        pool.fees_collected = pool.fees_collected + fee;

        // Emit event
        event::emit(FlashLoanRepaid<X> {
            pool_id,
            amount,
            fee,
            borrower: tx_context::sender(ctx),
        });
    }

    /// Add liquidity to flash pool
    public fun add_liquidity<X>(
        pool: &mut FlashPool<X>,
        liquidity: Coin<X>,
    ) {
        let balance = coin::into_balance(liquidity);
        balance::join(&mut pool.balance, balance);
    }

    /// Remove liquidity from flash pool (admin only in production)
    public fun remove_liquidity<X>(
        pool: &mut FlashPool<X>,
        amount: u64,
        ctx: &mut TxContext
    ): Coin<X> {
        assert!(balance::value(&pool.balance) >= amount, EInsufficientLiquidity);
        let withdrawn = balance::split(&mut pool.balance, amount);
        coin::from_balance(withdrawn, ctx)
    }

    // ===== View Functions =====

    /// Calculate flash loan fee for a given amount
    public fun calculate_flash_fee(amount: u64): u64 {
        // Fee = amount * FLASH_FEE_BPS / BPS_DENOMINATOR
        // 0.05% = 5 bp = 5 / 10000
        (amount * FLASH_FEE_BPS) / BPS_DENOMINATOR
    }

    /// Get pool liquidity
    public fun get_liquidity<X>(pool: &FlashPool<X>): u64 {
        balance::value(&pool.balance)
    }

    /// Get total fees collected
    public fun get_fees_collected<X>(pool: &FlashPool<X>): u64 {
        pool.fees_collected
    }

    /// Get total loans issued
    public fun get_loans_issued<X>(pool: &FlashPool<X>): u64 {
        pool.loans_issued
    }

    /// Get total volume
    public fun get_total_volume<X>(pool: &FlashPool<X>): u64 {
        pool.total_volume
    }

    /// Get pool ID
    public fun get_pool_id<X>(pool: &FlashPool<X>): ID {
        object::uid_to_inner(&pool.id)
    }

    // ===== Entry Functions =====

    /// Create and share a flash pool
    #[allow(lint(share_owned))]
    public fun create_and_share_pool<X>(
        initial_liquidity: Coin<X>,
        ctx: &mut TxContext
    ) {
        let pool = create_pool(initial_liquidity, ctx);
        sui::transfer::share_object(pool);
    }
}
