// Copyright (c) TortoiseOS
// SPDX-License-Identifier: MIT

/// DEX Adapter Interface
/// Defines the common interface for interacting with different DEXs on Sui
/// This allows the arbitrage executor to work with multiple DEXs uniformly
module hatch::dex_adapter {
    use std::vector;

    // ===== Structs =====

    /// Route information for multi-hop swaps
    public struct SwapRoute has copy, drop, store {
        /// DEX name/identifier
        dex: vector<u8>,
        /// Pool ID to use for this hop
        pool_id: address,
        /// Whether this is a direct swap (true) or needs intermediate token
        is_direct: bool,
    }

    /// Swap parameters
    public struct SwapParams has copy, drop, store {
        /// Minimum amount out (slippage protection)
        min_amount_out: u64,
        /// Maximum amount in (for exact output swaps)
        max_amount_in: u64,
        /// Deadline timestamp
        deadline: u64,
        /// Route to use (for multi-hop swaps)
        route: vector<SwapRoute>,
    }

    /// Quote result from a DEX
    public struct QuoteResult has copy, drop, store {
        /// Expected amount out
        amount_out: u64,
        /// Price impact (in basis points)
        price_impact: u64,
        /// Fee amount
        fee: u64,
        /// DEX name
        dex: vector<u8>,
    }

    // ===== Public View Functions =====

    /// Get amount out for a given swap
    public fun get_amount_out(params: &SwapParams): u64 {
        params.min_amount_out
    }

    /// Get amount in for a given swap
    public fun get_amount_in(params: &SwapParams): u64 {
        params.max_amount_in
    }

    /// Get swap deadline
    public fun get_deadline(params: &SwapParams): u64 {
        params.deadline
    }

    /// Get quote result amount
    public fun quote_amount_out(quote: &QuoteResult): u64 {
        quote.amount_out
    }

    /// Get quote price impact
    public fun quote_price_impact(quote: &QuoteResult): u64 {
        quote.price_impact
    }

    /// Get quote fee
    public fun quote_fee(quote: &QuoteResult): u64 {
        quote.fee
    }

    // ===== Constructor Functions =====

    /// Create swap parameters
    public fun create_swap_params(
        min_amount_out: u64,
        max_amount_in: u64,
        deadline: u64,
    ): SwapParams {
        SwapParams {
            min_amount_out,
            max_amount_in,
            deadline,
            route: vector::empty(),
        }
    }

    /// Create swap route
    public fun create_swap_route(
        dex: vector<u8>,
        pool_id: address,
        is_direct: bool,
    ): SwapRoute {
        SwapRoute {
            dex,
            pool_id,
            is_direct,
        }
    }

    /// Add route to swap params
    public fun add_route(params: &mut SwapParams, route: SwapRoute) {
        vector::push_back(&mut params.route, route);
    }

    /// Create quote result
    public fun create_quote(
        amount_out: u64,
        price_impact: u64,
        fee: u64,
        dex: vector<u8>,
    ): QuoteResult {
        QuoteResult {
            amount_out,
            price_impact,
            fee,
            dex,
        }
    }

    // ===== Helper Functions =====

    /// Check if route is empty
    public fun is_direct_swap(params: &SwapParams): bool {
        vector::is_empty(&params.route)
    }

    /// Get route count
    public fun route_count(params: &SwapParams): u64 {
        vector::length(&params.route)
    }
}
