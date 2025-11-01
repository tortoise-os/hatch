# Quick Start Guide

## Latest Deployment (Testnet)

```bash
Network: testnet
Carapace: 0xead60864c30441a2063bec0505f60f71c492527aea8be3a20d7a86d7095c238a
Hatch:    0xa28fff6f7342cbb2bfa69b6ce6d511970f2b48438c28603854f23edc3110cfee
```

## Using the SDK

### 1. Load Configuration

The SDK automatically reads from `config/deployment.json` or environment variables:

```typescript
import { getPackageId, getCarapacePackageId, loadEnvConfig } from '@hatch/strategy-sdk';

// Option 1: Read from deployment config
const hatchId = getPackageId('testnet');
const carapaceId = getCarapacePackageId('testnet');

// Option 2: Read from environment variables (requires .env.testnet)
const config = loadEnvConfig();
console.log(config.hatchPackageId);
console.log(config.carapacePackageId);
```

### 2. Set Environment Variables (Optional)

```bash
# Export variables from .env.testnet
export NETWORK=testnet
export CARAPACE_PACKAGE_ID=0xead60864c30441a2063bec0505f60f71c492527aea8be3a20d7a86d7095c238a
export HATCH_PACKAGE_ID=0xa28fff6f7342cbb2bfa69b6ce6d511970f2b48438c28603854f23edc3110cfee

# Or use a tool like dotenv
bun run --env-file=.env.testnet your-script.ts
```

### 3. Run Examples

```bash
# Basic flash loan example
NETWORK=testnet \
HATCH_PACKAGE_ID=0xa28fff6f7342cbb2bfa69b6ce6d511970f2b48438c28603854f23edc3110cfee \
CARAPACE_PACKAGE_ID=0xead60864c30441a2063bec0505f60f71c492527aea8be3a20d7a86d7095c238a \
POOL_ID=<your-pool-id> \
SUI_PRIVATE_KEY=<your-private-key> \
bun run packages/strategy-sdk/examples/flash-loan-basic.ts
```

## View on Explorer

- **Hatch Package**: https://suiscan.xyz/testnet/object/0xa28fff6f7342cbb2bfa69b6ce6d511970f2b48438c28603854f23edc3110cfee
- **Carapace Package**: https://suiscan.xyz/testnet/object/0xead60864c30441a2063bec0505f60f71c492527aea8be3a20d7a86d7095c238a

## Next Steps

1. **Create a Flash Pool** - You need a pool to execute flash loans
2. **Test Flash Loans** - Run the examples with your pool
3. **Build Strategies** - Create arbitrage or leverage strategies

## Redeploy

To deploy new versions:

```bash
./scripts/deploy-integrated.sh
```

This will:
- Deploy fresh versions of Carapace and Hatch
- Update `config/deployment.json` and `.env.testnet`
- Keep your `move/Move.toml` clean for local development

## Configuration Architecture

```
Package IDs are stored in:
├── .env.testnet              # Environment variables (for SDK)
└── config/deployment.json    # Deployment metadata (for SDK)

NOT in:
└── move/Move.toml            # Only local deps, no hardcoded IDs ✓
```

For detailed deployment information, see [DEPLOYMENT-QUICKSTART.md](DEPLOYMENT-QUICKSTART.md).
