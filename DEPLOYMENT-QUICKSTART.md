# Deployment Quickstart

## TL;DR - Deploy to Testnet Now

```bash
# 1. Make sure you're in the hatch directory
cd /Users/decebaldobrica/Projects/blockchain/tortoise-os/hatch

# 2. Run the integrated deployment script
./scripts/deploy-integrated.sh

# 3. Source the generated env file
source .env.testnet

# 4. Done! Your packages are deployed.
```

## What Just Happened?

The deployment script:

1. ✅ Deployed **Carapace** package to testnet
2. ✅ Deployed **Hatch** package to testnet (with Carapace as dependency)
3. ✅ Created `config/deployment.json` with all package IDs
4. ✅ Created `.env.testnet` with environment variables
5. ✅ Restored `move/Move.toml` to its original state (for local development)

**Important**: Package addresses are stored in environment files, NOT in `move/Move.toml`. The Move.toml is kept clean for local development and only temporarily modified during deployment.

## Check Your Deployment

```bash
# View configuration
cat config/deployment.json

# View environment variables
cat .env.testnet

# Should show something like:
# NETWORK=testnet
# CARAPACE_PACKAGE_ID=0x1234...
# HATCH_PACKAGE_ID=0x5678...
```

## Use the SDK

```typescript
// Load configuration automatically
import { FlashLoanClient, getPackageId } from '@hatch/strategy-sdk';
import { SuiClient, getFullnodeUrl } from '@mysten/sui.js/client';

const client = new SuiClient({ url: getFullnodeUrl('testnet') });
const packageId = getPackageId('testnet');

const flashClient = new FlashLoanClient(client, {
  packageId,
  poolId: 'your-pool-id', // Create a pool first
});

// Get pool info
const info = await flashClient.getPoolInfo();
console.log('Pool liquidity:', info.liquidity);
```

## Next Steps

### 1. Create a Flash Loan Pool

You need to create a pool before you can execute flash loans:

```bash
# Use the Sui CLI or the SDK to create a pool
# Example coming in packages/strategy-sdk/examples/create-pool.ts
```

### 2. Test Flash Loans

```bash
# Set your private key
export SUI_PRIVATE_KEY=your-private-key
export POOL_ID=your-pool-id

# Run example
bun run packages/strategy-sdk/examples/flash-loan-basic.ts
```

### 3. Build Your Strategy

Check out the examples:
- `packages/strategy-sdk/examples/flash-loan-basic.ts` - Basic flash loan
- `packages/strategy-sdk/examples/arbitrage-example.ts` - Arbitrage strategy (TODO)

## View on Explorer

After deployment, view your packages:

```bash
# Carapace
echo "https://suiscan.xyz/testnet/object/$CARAPACE_PACKAGE_ID"

# Hatch
echo "https://suiscan.xyz/testnet/object/$HATCH_PACKAGE_ID"
```

## Troubleshooting

### "Error: Failed to extract package ID"

- Check you have enough testnet SUI
- Get more from: https://faucet.sui.io

### "Error: Carapace directory not found"

- Ensure both repos are in the same parent directory:
  ```
  tortoise-os/
  ├── carapace/
  └── hatch/
  ```

### "Error: Must run from hatch root directory"

```bash
cd /Users/decebaldobrica/Projects/blockchain/tortoise-os/hatch
./scripts/deploy-integrated.sh
```

## Deployment Architecture

### How Package Addresses Work

**During Local Development:**
- `move/Move.toml` uses local dependencies with `0x0` addresses
- Builds work without network connection
- Clean, version-controlled configuration

**During Deployment:**
1. Script deploys Carapace → gets package ID
2. Script temporarily modifies `move/Move.toml`:
   - Removes local Carapace dependency
   - Sets Carapace address to deployed package ID
3. Script deploys Hatch with on-chain Carapace reference
4. Script restores original `move/Move.toml`

**After Deployment:**
- Package IDs stored in `config/deployment.json`
- Package IDs in `.env.testnet` for SDK use
- `move/Move.toml` remains clean (local deps only)
- SDK reads package IDs from environment, not Move.toml

This keeps your Move.toml clean and git-friendly while still allowing proper on-chain package references.

## Redeploy

To redeploy (e.g., after code changes):

```bash
# Just run the script again
./scripts/deploy-integrated.sh

# It will deploy fresh versions and update all configs
```

## Documentation

- Full integration guide: [docs/INTEGRATION.md](docs/INTEGRATION.md)
- API reference: Coming soon
- Examples: `packages/strategy-sdk/examples/`

---

**Ready to deploy?** Just run: `./scripts/deploy-integrated.sh`
