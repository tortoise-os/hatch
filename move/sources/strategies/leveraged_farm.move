// Copyright (c) TortoiseOS
// SPDX-License-Identifier: MIT

/// Leveraged yield farming using flash loans
/// Allows users to amplify their farming positions without additional capital
module hatch::leveraged_farm {
    use sui::coin::{Self, Coin};
    use sui::balance::{Self, Balance};
    use sui::event;
    use hatch::flash_pool::{Self, FlashPool};

    // ===== Errors =====

    /// Invalid leverage multiplier
    const EInvalidLeverage: u64 = 0;

    /// Position is undercollateralized
    const EUndercollateralized: u64 = 1;

    /// Unauthorized access to position
    const EUnauthorized: u64 = 2;

    // ===== Constants =====

    /// Minimum leverage (1.5x)
    const MIN_LEVERAGE: u8 = 15; // 1.5x in deci-units

    /// Maximum leverage (5x)
    const MAX_LEVERAGE: u8 = 50; // 5x in deci-units

    /// Leverage multiplier (10 for deci-units)
    const LEVERAGE_MULTIPLIER: u64 = 10;

    /// Liquidation threshold (80% collateral ratio)
    const LIQUIDATION_THRESHOLD: u64 = 8000; // In basis points

    /// Basis points denominator
    const BPS_DENOMINATOR: u64 = 10000;

    // ===== Structs =====

    /// Leveraged position tracking
    public struct LeveragedPosition<phantom X> has key, store {
        id: UID,
        /// Owner of the position
        owner: address,
        /// Total collateral deposited (user deposit + borrowed)
        total_collateral: u64,
        /// Amount borrowed via flash loan
        debt: u64,
        /// Leverage multiplier (in deci-units, e.g., 30 = 3x)
        leverage: u8,
        /// Accumulated yield
        yield_earned: Balance<X>,
        /// Health factor (basis points)
        health_factor: u64,
    }

    /// Position registry
    public struct PositionRegistry has key {
        id: UID,
        /// Total positions created
        total_positions: u64,
        /// Total value locked
        tvl: u64,
    }

    // ===== Events =====

    public struct PositionOpened<phantom X> has copy, drop {
        position_id: ID,
        owner: address,
        collateral: u64,
        debt: u64,
        leverage: u8,
    }

    public struct PositionClosed<phantom X> has copy, drop {
        position_id: ID,
        owner: address,
        final_value: u64,
        profit_loss: u64,
    }

    public struct PositionLiquidated<phantom X> has copy, drop {
        position_id: ID,
        owner: address,
        debt: u64,
        liquidator: address,
    }

    // ===== Initialization =====

    /// Initialize the position registry (called once)
    fun init(ctx: &mut TxContext) {
        let registry = PositionRegistry {
            id: object::new(ctx),
            total_positions: 0,
            tvl: 0,
        };
        sui::transfer::share_object(registry);
    }

    // ===== Public Functions =====

    /// Open a leveraged position using flash loan
    ///
    /// Example: User deposits 100 USDC with 3x leverage
    /// 1. Flash borrow 200 USDC (3x - 1 = 2x user deposit)
    /// 2. Deposit all 300 USDC to yield farm
    /// 3. Borrow 200 USDC against the deposit
    /// 4. Repay flash loan with borrowed funds
    public fun open_position<X>(
        registry: &mut PositionRegistry,
        flash_pool: &mut FlashPool<X>,
        mut user_deposit: Coin<X>,
        leverage: u8, // e.g., 30 for 3x leverage
        ctx: &mut TxContext
    ): LeveragedPosition<X> {
        // Validate leverage
        assert!(leverage >= MIN_LEVERAGE && leverage <= MAX_LEVERAGE, EInvalidLeverage);

        let user_amount = coin::value(&user_deposit);

        // Calculate amount to borrow: user_amount * (leverage / 10 - 1)
        let borrow_multiplier = ((leverage as u64) - LEVERAGE_MULTIPLIER);
        let flash_amount = (user_amount * borrow_multiplier) / LEVERAGE_MULTIPLIER;

        // 1. Flash borrow
        let (flash_coins, flash_receipt) = flash_pool::flash_borrow(
            flash_pool,
            flash_amount,
            ctx
        );

        // 2. Combine user deposit + flash borrowed funds
        coin::join(&mut user_deposit, flash_coins);
        let total_collateral = coin::value(&user_deposit);

        // 3. For this example, we'll store the collateral in the position
        // In production, this would be deposited to a yield vault
        let mut collateral_balance = coin::into_balance(user_deposit);

        // 4. Extract funds to repay flash loan (simulating borrowing from vault)
        let repayment_amount = flash_amount + flash_pool::calculate_flash_fee(flash_amount);
        let repayment_balance = balance::split(&mut collateral_balance, repayment_amount);
        let repayment_coin = coin::from_balance(repayment_balance, ctx);

        // 5. Repay flash loan
        flash_pool::flash_repay(flash_pool, repayment_coin, flash_receipt, ctx);

        // 6. Create position
        let mut position = LeveragedPosition {
            id: object::new(ctx),
            owner: tx_context::sender(ctx),
            total_collateral: balance::value(&collateral_balance),
            debt: flash_amount,
            leverage,
            yield_earned: balance::zero<X>(),
            health_factor: calculate_health_factor(
                balance::value(&collateral_balance),
                flash_amount
            ),
        };

        // Store collateral in position
        balance::join(&mut position.yield_earned, collateral_balance);

        // Update registry
        registry.total_positions = registry.total_positions + 1;
        registry.tvl = registry.tvl + total_collateral;

        // Emit event
        event::emit(PositionOpened<X> {
            position_id: object::uid_to_inner(&position.id),
            owner: tx_context::sender(ctx),
            collateral: total_collateral,
            debt: flash_amount,
            leverage,
        });

        position
    }

    /// Close a leveraged position
    public fun close_position<X>(
        registry: &mut PositionRegistry,
        position: LeveragedPosition<X>,
        ctx: &mut TxContext
    ): Coin<X> {
        let LeveragedPosition {
            id,
            owner,
            total_collateral,
            debt,
            leverage: _,
            yield_earned,
            health_factor: _,
        } = position;

        // Verify ownership
        assert!(owner == tx_context::sender(ctx), EUnauthorized);

        // Calculate final value
        let final_value = balance::value(&yield_earned);

        // Update registry
        registry.tvl = if (registry.tvl >= total_collateral) {
            registry.tvl - total_collateral
        } else {
            0
        };

        // Emit event
        event::emit(PositionClosed<X> {
            position_id: object::uid_to_inner(&id),
            owner,
            final_value,
            profit_loss: if (final_value > debt) { final_value - debt } else { 0 },
        });

        object::delete(id);

        // Return remaining funds to user
        coin::from_balance(yield_earned, ctx)
    }

    /// Liquidate an undercollateralized position
    public fun liquidate_position<X>(
        registry: &mut PositionRegistry,
        position: LeveragedPosition<X>,
        ctx: &mut TxContext
    ): Coin<X> {
        // Check if position is liquidatable
        assert!(position.health_factor < LIQUIDATION_THRESHOLD, EUndercollateralized);

        let position_id = object::uid_to_inner(&position.id);
        let debt = position.debt;
        let owner = position.owner;

        // Close position and extract collateral
        let collateral = close_position(registry, position, ctx);

        // Emit liquidation event
        event::emit(PositionLiquidated<X> {
            position_id,
            owner,
            debt,
            liquidator: tx_context::sender(ctx),
        });

        collateral
    }

    // ===== View Functions =====

    /// Calculate health factor for a position
    /// Health factor = (collateral_value / debt_value) * BPS_DENOMINATOR
    public fun calculate_health_factor(collateral: u64, debt: u64): u64 {
        if (debt == 0) {
            return BPS_DENOMINATOR // 100% healthy if no debt
        };
        (collateral * BPS_DENOMINATOR) / debt
    }

    /// Get position details
    public fun get_position_owner<X>(position: &LeveragedPosition<X>): address {
        position.owner
    }

    public fun get_position_collateral<X>(position: &LeveragedPosition<X>): u64 {
        position.total_collateral
    }

    public fun get_position_debt<X>(position: &LeveragedPosition<X>): u64 {
        position.debt
    }

    public fun get_position_leverage<X>(position: &LeveragedPosition<X>): u8 {
        position.leverage
    }

    public fun get_position_health<X>(position: &LeveragedPosition<X>): u64 {
        position.health_factor
    }

    public fun is_liquidatable<X>(position: &LeveragedPosition<X>): bool {
        position.health_factor < LIQUIDATION_THRESHOLD
    }

    public fun get_total_positions(registry: &PositionRegistry): u64 {
        registry.total_positions
    }

    public fun get_tvl(registry: &PositionRegistry): u64 {
        registry.tvl
    }

    // ===== Entry Functions =====

    /// Open position and transfer to sender
    #[allow(lint(self_transfer))]
    public fun open_and_transfer_position<X>(
        registry: &mut PositionRegistry,
        flash_pool: &mut FlashPool<X>,
        user_deposit: Coin<X>,
        leverage: u8,
        ctx: &mut TxContext
    ) {
        let position = open_position(registry, flash_pool, user_deposit, leverage, ctx);
        sui::transfer::transfer(position, tx_context::sender(ctx));
    }

    // ===== Test Helpers =====

    #[test_only]
    public fun init_for_testing(ctx: &mut TxContext) {
        init(ctx);
    }
}
