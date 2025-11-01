# Carapace Integration Guide

This guide explains how to integrate Carapace flash loan pools with Hatch and deploy to testnet.

## Overview

Hatch uses Carapace as a dependency to provide flash loan functionality. The integration works as follows:

```
Carapace (AMM + Flash Loans)
    ↓
Hatch (Flash loan strategies)
    ↓
Strategy SDK (TypeScript client)
```

## Architecture

### Move Packages

1. **Carapace** (`../carapace/move`)
   - Core AMM pools with flash loan support
   - Published independently first
   - Provides base flash loan primitives

2. **Hatch** (`move/`)
   - Depends on Carapace
   - Implements flash loan strategies
   - Uses Carapace pools via dependency

### TypeScript SDK

The `@hatch/strategy-sdk` package provides:
- `FlashLoanClient` - Main client for flash loan operations
- Configuration helpers - Load deployment addresses
- Transaction builders - Build complex flash loan strategies

## Deployment Process

### Prerequisites

1. Sui CLI installed and configured
2. Active wallet with testnet SUI
3. Both repositories cloned:
   ```bash
   Projects/blockchain/tortoise-os/
   ├── carapace/
   └── hatch/
   ```

### Step 1: Deploy to Testnet

Use the integrated deployment script:

```bash
cd hatch
./scripts/deploy-integrated.sh
```

This script will:
1. Deploy Carapace package
2. Extract Carapace package ID
3. Update Hatch `Move.toml` with Carapace address
4. Deploy Hatch package
5. Update configuration files

### Step 2: Verify Deployment

Check the generated files:

```bash
# Deployment configuration
cat config/deployment.json

# Environment variables
cat .env.testnet
```

You should see:
```json
{
  "testnet": {
    "carapace": {
      "packageId": "0xabc...",
      "deployed": true,
      "pools": [...]
    },
    "hatch": {
      "packageId": "0xdef...",
      "deployed": true
    }
  }
}
```

### Step 3: Use the SDK

#### Basic Setup

```typescript
import { SuiClient, getFullnodeUrl } from '@mysten/sui.js/client';
import { FlashLoanClient, getPackageId } from '@hatch/strategy-sdk';

// Load configuration
const packageId = getPackageId('testnet');

// Initialize client
const client = new SuiClient({
  url: getFullnodeUrl('testnet')
});

const flashLoanClient = new FlashLoanClient(client, {
  packageId,
  poolId: 'your-pool-id',
});
```

#### Execute Flash Loan

```typescript
const tx = await flashLoanClient.buildFlashLoanTx(
  1000n * 1_000_000_000n, // Borrow 1000 tokens
  '0x2::sui::SUI',        // Coin type
  (tx, borrowedCoin, receipt) => {
    // Your arbitrage/leverage logic here
    // Must return coin with borrowed amount + fee
    return repaymentCoin;
  }
);

// Sign and execute
const result = await client.signAndExecuteTransaction({
  signer: keypair,
  transaction: tx,
});
```

## Configuration Methods

### Option 1: Environment Variables (Recommended)

Set environment variables after deployment:

```bash
export NETWORK=testnet
export CARAPACE_PACKAGE_ID=0x...
export HATCH_PACKAGE_ID=0x...
export POOL_ID=0x...
```

The SDK will automatically load these.

### Option 2: Configuration File

Load from `config/deployment.json`:

```typescript
import { loadDeploymentConfig } from '@hatch/strategy-sdk';

const config = loadDeploymentConfig('testnet');
console.log(config.hatch.packageId);
```

### Option 3: Manual Configuration

```typescript
const client = new FlashLoanClient(suiClient, {
  packageId: '0x...',
  poolId: '0x...',
});
```

## Development Workflow

### Local Development

For active development on both packages:

1. **Move.toml uses local dependency**:
   ```toml
   [dependencies]
   Carapace = { local = "../../carapace/move" }
   ```

2. **Build and test locally**:
   ```bash
   cd move
   sui move build
   sui move test
   ```

3. **Deploy when ready**:
   ```bash
   ./scripts/deploy-integrated.sh
   ```

### Updating Carapace

When Carapace changes:

1. Make changes in `../carapace/move`
2. Test changes locally with `sui move test`
3. Rebuild Hatch: `cd hatch/move && sui move build`
4. Redeploy both if needed: `./scripts/deploy-integrated.sh`

## Testing Flash Loans

### Run Example

```bash
# Set environment variables
source .env.testnet
export SUI_PRIVATE_KEY=your-key
export POOL_ID=your-pool-id

# Run example
bun run packages/strategy-sdk/examples/flash-loan-basic.ts
```

### Create Pool

```typescript
const poolTx = await flashLoanClient.createPool(
  initialLiquidityCoinId,
  '0x2::sui::SUI'
);

const result = await client.signAndExecuteTransaction({
  signer: keypair,
  transaction: poolTx,
});

// Extract pool ID from result
const poolId = result.objectChanges?.find(
  obj => obj.objectType?.includes('Pool')
)?.objectId;
```

## Troubleshooting

### Build Errors

**Error**: `Package dependency "Carapace" not found`

**Solution**: Ensure Carapace directory exists at `../../carapace/move`

**Error**: `Address 'carapace' not defined`

**Solution**: Run deployment script to update `Move.toml` with deployed address

### SDK Errors

**Error**: `Deployment config not found`

**Solution**: Run `./scripts/deploy-integrated.sh` first

**Error**: `Packages not deployed on testnet`

**Solution**: Check `config/deployment.json` and ensure `deployed: true`

### Transaction Errors

**Error**: `Insufficient gas`

**Solution**: Increase gas budget or get more testnet SUI from faucet

**Error**: `Type mismatch`

**Solution**: Ensure coin types match between pool and transaction

## Next Steps

1. **Create pools**: Deploy flash loan pools for different tokens
2. **Implement strategies**: Build arbitrage/leverage strategies
3. **Monitor**: Set up monitoring for flash loan activity
4. **Optimize**: Tune gas costs and flash loan fees

## Resources

- [Sui Documentation](https://docs.sui.io)
- [Carapace Repository](../carapace)
- [Flash Loan Examples](../packages/strategy-sdk/examples)
- [Sui Explorer (Testnet)](https://suiscan.xyz/testnet)

## Support

For issues or questions:
1. Check troubleshooting section above
2. Review example scripts in `packages/strategy-sdk/examples/`
3. Check deployment logs in console output
