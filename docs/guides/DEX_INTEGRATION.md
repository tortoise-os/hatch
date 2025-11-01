# DEX Integration Guide

This document explains how to integrate with DEX protocols for flash loan arbitrage on Sui.

## Overview

The Hatch protocol provides a flexible adapter system for integrating with multiple DEX protocols. This allows the arbitrage executor to work with different AMMs uniformly.

## Architecture

```
┌─────────────────┐
│  Arbitrage Bot  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ DEX Adapter API │ ◄── Common interface for all DEXs
└────────┬────────┘
         │
    ┌────┴────┬──────────┐
    ▼         ▼          ▼
┌───────┐ ┌────────┐ ┌──────────┐
│ Cetus │ │ Turbos │ │ Aftermath│
└───────┘ └────────┘ └──────────┘
```

## Available Adapters

### 1. Cetus Adapter (`hatch::cetus_adapter`)

**Protocol:** Concentrated liquidity AMM
**Website:** https://cetus.zone

**Key Features:**
- Multiple fee tiers (0.01%, 0.05%, 0.3%, 1%)
- Tick-based pricing
- Capital efficient liquidity

**Usage:**
```move
use hatch::cetus_adapter;
use hatch::dex_adapter;

// Get quote for swap
let quote = cetus_adapter::get_quote_x_to_y<USDC, SUI>(
    amount_in,
    fee_tier,
    sqrt_price,
    liquidity
);

// Execute swap (requires actual Cetus pool integration)
let coin_out = cetus_adapter::swap_x_to_y<USDC, SUI>(
    &mut pool,
    coin_in,
    params,
    ctx
);
```

**Fee Tiers:**
- `FEE_TIER_100`: 0.01% (1 basis point)
- `FEE_TIER_500`: 0.05% (5 basis points)
- `FEE_TIER_3000`: 0.3% (30 basis points)
- `FEE_TIER_10000`: 1% (100 basis points)

### 2. Turbos Adapter (`hatch::turbos_adapter`)

**Protocol:** Constant product AMM
**Website:** https://turbos.finance

**Key Features:**
- Standard x*y=k formula
- 0.3% swap fee
- Simple reserves-based pricing

**Usage:**
```move
use hatch::turbos_adapter;

// Get quote
let (reserve_x, reserve_y) = turbos_adapter::get_reserves(&pool);
let quote = turbos_adapter::get_quote_x_to_y<USDC, SUI>(
    reserve_x,
    reserve_y,
    amount_in,
    fee_bps
);

// Execute swap
let coin_out = turbos_adapter::swap_x_to_y<USDC, SUI>(
    &mut pool,
    coin_in,
    params,
    ctx
);
```

**Pricing Formula:**
```
amount_out = (reserve_out * amount_in * 997) / (reserve_in * 1000 + amount_in * 997)
```

## Integration Steps

### Step 1: Add DEX Module Dependencies

Update your `Move.toml`:
```toml
[addresses]
cetus = "0x..." # Cetus package address
turbos = "0x..." # Turbos package address

[dependencies]
Cetus = { git = "https://github.com/CetusProtocol/cetus-core", subdir = "sui", rev = "main" }
Turbos = { git = "https://github.com/turbos-finance/turbos-clmm", subdir = "sui", rev = "main" }
```

### Step 2: Import Actual DEX Modules

Replace placeholder functions with real DEX calls:

```move
// Example: Cetus integration
module hatch::cetus_adapter {
    use cetus::pool;  // Import actual Cetus module

    public fun swap_x_to_y<X, Y>(
        pool: &mut pool::Pool<X, Y>,
        coin_in: Coin<X>,
        params: SwapParams,
        ctx: &mut TxContext
    ): Coin<Y> {
        // Call actual Cetus swap function
        pool::swap_a_b(pool, coin_in, params.min_amount_out, ctx)
    }
}
```

### Step 3: Build Arbitrage Strategy

```move
use hatch::flash_pool;
use hatch::cetus_adapter;
use hatch::turbos_adapter;
use hatch::dex_adapter;

public fun execute_cross_dex_arbitrage<X, Y>(
    flash_pool: &mut FlashPool<X>,
    cetus_pool: &mut CetusPool,
    turbos_pool: &mut TurbosPool,
    amount: u64,
    ctx: &mut TxContext
): Coin<X> {
    // 1. Flash borrow
    let (flash_coins, receipt) = flash_pool::flash_borrow(flash_pool, amount, ctx);

    // 2. Swap X → Y on Cetus (buy at lower price)
    let params_cetus = dex_adapter::create_swap_params(amount, amount * 99 / 100, 0);
    let y_coins = cetus_adapter::swap_x_to_y(cetus_pool, flash_coins, params_cetus, ctx);

    // 3. Swap Y → X on Turbos (sell at higher price)
    let params_turbos = dex_adapter::create_swap_params(coin::value(&y_coins), amount, 0);
    let x_coins = turbos_adapter::swap_y_to_x(turbos_pool, y_coins, params_turbos, ctx);

    // 4. Repay flash loan
    let repayment_amount = amount + flash_pool::calculate_flash_fee(amount);
    let repayment = coin::split(&mut x_coins, repayment_amount, ctx);
    flash_pool::flash_repay(flash_pool, repayment, receipt, ctx);

    // 5. Return profit
    x_coins
}
```

## Price Quoting

### Getting Quotes from Multiple DEXs

```move
use hatch::dex_adapter::QuoteResult;

public fun get_best_quote<X, Y>(
    cetus_pool: &CetusPool,
    turbos_pool: &TurbosPool,
    amount_in: u64,
): (vector<u8>, u64) {
    // Get quotes from both DEXs
    let cetus_quote = cetus_adapter::get_quote_x_to_y<X, Y>(
        amount_in,
        cetus_adapter::get_fee_tier(cetus_pool),
        cetus_adapter::get_sqrt_price(cetus_pool),
        cetus_adapter::get_liquidity(cetus_pool)
    );

    let (reserve_x, reserve_y) = turbos_adapter::get_reserves(turbos_pool);
    let turbos_quote = turbos_adapter::get_quote_x_to_y<X, Y>(
        reserve_x,
        reserve_y,
        amount_in,
        turbos_adapter::get_fee_bps(turbos_pool)
    );

    // Compare and return best
    if (dex_adapter::quote_amount_out(&cetus_quote) > dex_adapter::quote_amount_out(&turbos_quote)) {
        (b"Cetus", dex_adapter::quote_amount_out(&cetus_quote))
    } else {
        (b"Turbos", dex_adapter::quote_amount_out(&turbos_quote))
    }
}
```

## Monitoring & Safety

### Price Impact Checks

```move
public fun check_price_impact(quote: &QuoteResult): bool {
    let MAX_IMPACT_BPS: u64 = 100; // 1% max impact
    dex_adapter::quote_price_impact(quote) <= MAX_IMPACT_BPS
}
```

### Slippage Protection

```move
// Always use min_amount_out to protect against slippage
let params = dex_adapter::create_swap_params(
    amount_in,
    min_amount_out, // e.g., expected_out * 99 / 100 for 1% slippage
    deadline
);
```

## Testing

### Unit Tests

```move
#[test_only]
module hatch::dex_tests {
    use hatch::cetus_adapter;
    use hatch::turbos_adapter;

    #[test]
    fun test_quote_accuracy() {
        // Create test pools
        let ctx = &mut ts::ctx(scenario);
        let cetus_pool = cetus_adapter::create_test_pool<USDC, SUI>(500, ctx);
        let turbos_pool = turbos_adapter::create_test_pool<USDC, SUI>(1000000, 1000000, 30, ctx);

        // Get quotes
        let amount_in = 100_000;
        let cetus_quote = cetus_adapter::get_quote_x_to_y<USDC, SUI>(
            amount_in, 500, 1000000, 1000000000
        );

        // Verify quote is reasonable
        assert!(dex_adapter::quote_amount_out(&cetus_quote) > 0, 0);

        // Cleanup
        cetus_adapter::destroy_test_pool(cetus_pool);
        turbos_adapter::destroy_test_pool(turbos_pool);
    }
}
```

## Production Deployment

### Prerequisites

1. **Deploy Contracts:**
   ```bash
   sui client publish --gas-budget 500000000
   ```

2. **Create Flash Pool:**
   ```bash
   sui client call \
     --package $PACKAGE_ID \
     --module flash_pool \
     --function create_and_share_pool \
     --args $INITIAL_LIQUIDITY \
     --gas-budget 100000000
   ```

3. **Configure Bot:**
   ```json
   {
     "flash_pool": "0x...",
     "dexes": {
       "cetus": {
         "pools": {
           "USDC/SUI": "0x..."
         }
       },
       "turbos": {
         "pools": {
           "USDC/SUI": "0x..."
         }
       }
     },
     "min_profit_bps": 50,
     "max_flash_amount": 1000000000
   }
   ```

### Monitoring

Monitor these metrics:
- Flash loan utilization
- Arbitrage success rate
- Average profit per trade
- Failed transaction reasons
- DEX pool liquidity changes

## Troubleshooting

### Common Issues

**Issue:** Swap fails with "Insufficient liquidity"
**Solution:** Check pool reserves and reduce swap amount

**Issue:** High price impact warning
**Solution:** Split large trades into smaller chunks

**Issue:** Flash loan repayment failure
**Solution:** Ensure profit covers flash fee + gas costs

## Resources

- **Cetus Docs:** https://cetus-1.gitbook.io/cetus-docs/
- **Turbos Docs:** https://docs.turbos.finance/
- **Sui Move Book:** https://move-book.com/
- **Flash Loans Guide:** [FLASHLOAN.md](./FLASHLOAN.md)

## Support

For questions or issues:
- GitHub Issues: https://github.com/TortoiseOS/hatch/issues
- Discord: TBD
- Email: TBD
