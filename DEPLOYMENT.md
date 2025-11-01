# Deployment Guide

Modern, scaffold-eth-2-inspired deployment system for Hatch.

## Quick Start

```bash
# Deploy everything to testnet (default)
bun run deploy

# Deploy to mainnet
bun run deploy:mainnet

# Deploy only specific packages
bun run deploy:carapace
bun run deploy:hatch

# Force redeploy (skip existing checks)
bun run deploy:force
```

## What Changed?

### ❌ Old System (Deprecated)
- Monolithic bash script (`scripts/deploy-integrated.sh`)
- Manual artifact management
- Sed-based Move.toml manipulation
- No reusability or modularity
- Hard to test individual steps

### ✅ New System (Recommended)
- **Modular TypeScript scripts** - Each package has its own deployment script
- **Sequential numbered execution** - `00_deploy_carapace.ts`, `01_deploy_hatch.ts`
- **Tagged deployments** - Deploy specific packages with `--tags`
- **Automatic artifact management** - JSON files per network
- **Type-safe helpers** - Reusable deployment utilities
- **Idempotent** - Checks for existing deployments
- **Better error handling** - Automatic rollback and cleanup

## Architecture

```
deploy/
├── helpers.ts              # Reusable deployment utilities
├── deploy.ts               # Main runner (orchestrates all scripts)
├── 00_deploy_carapace.ts   # Deploys Carapace
└── 01_deploy_hatch.ts      # Deploys Hatch (depends on Carapace)

deployments/
├── testnet/
│   ├── carapace.json       # Carapace deployment artifact
│   └── hatch.json          # Hatch deployment artifact (with dependencies)
└── mainnet/
    └── ...
```

## Deployment Artifacts

Each package deployment creates a JSON artifact:

```json
{
  "name": "hatch",
  "network": "testnet",
  "packageId": "0x559ee...",
  "digest": "9ooBT5...",
  "timestamp": "2025-11-01T18:19:22.419Z",
  "deployer": "0xe91b75...",
  "gasUsed": "1000000",
  "dependencies": {
    "carapace": "0x1cf2a4..."
  }
}
```

## Usage Examples

### Deploy All Packages

```bash
# Testnet (default)
bun run deploy

# Mainnet
NETWORK=mainnet bun run deploy

# With custom gas budget
GAS_BUDGET=200000000 bun run deploy
```

### Deploy Single Package

```bash
# Deploy only Carapace
bun run deploy:carapace

# Deploy only Hatch (requires Carapace already deployed)
bun run deploy:hatch
```

### Force Redeploy

```bash
# Redeploy everything, ignoring existing deployments
bun run deploy:force

# Or use flag directly
bun run deploy --force
```

### Use Deployment Artifacts in Code

```typescript
import { loadDeployment, getAllDeployments } from './deploy/helpers';

// Load specific deployment
const hatch = loadDeployment('testnet', 'hatch');
console.log(hatch.packageId);
console.log(hatch.dependencies.carapace);

// Load all deployments
const allDeployments = getAllDeployments('testnet');
```

## Benefits

### 1. **Standardization**
- Inspired by scaffold-eth-2's proven patterns
- Consistent across all packages
- Easy to add new packages

### 2. **Developer Experience**
- TypeScript with full type safety
- Clear error messages
- Automatic cleanup and rollback

### 3. **Team Collaboration**
- Deployment artifacts committed to git
- Shared deployments across team
- Clear deployment history

### 4. **Flexibility**
- Deploy to any network
- Deploy specific packages
- Skip or force deployments

### 5. **Maintainability**
- Modular, testable scripts
- Reusable helper functions
- Self-documenting code

## Migration from Old System

The old bash script (`scripts/deploy-integrated.sh`) still works but is **deprecated**.

### Why Migrate?

1. **Type Safety** - Catch errors at compile time
2. **Reusability** - Shared helpers across scripts
3. **Better DX** - Clear output, better errors
4. **Modularity** - Deploy individual packages
5. **Standardization** - Follows industry best practices

### Migration Steps

1. **Use new system**:
   ```bash
   bun run deploy
   ```

2. **Verify artifacts**:
   ```bash
   ls deployments/testnet/
   cat .env.testnet
   ```

3. **Update your scripts**:
   ```bash
   # Old
   ./scripts/deploy-integrated.sh

   # New
   bun run deploy
   ```

4. **Remove old script** (when ready):
   ```bash
   rm scripts/deploy-integrated.sh
   ```

## Environment Variables

- `NETWORK` - Target network (default: `testnet`)
- `GAS_BUDGET` - Gas budget for transactions (default: `100000000`)

## Outputs

Each deployment generates:

1. **Deployment artifacts**: `deployments/{network}/{package}.json`
2. **Environment file**: `.env.{network}`
3. **Legacy config**: `config/deployment.json` (for backwards compatibility)
4. **Console summary**: Deployment results and explorer links

## Best Practices

1. **Commit deployment artifacts** - Share deployments with team
2. **Use tags for iteration** - Deploy specific packages during development
3. **Test locally first** - Use `NETWORK=localnet` for testing
4. **Review before mainnet** - Always deploy to testnet first
5. **Don't manually edit artifacts** - Let scripts manage them

## Latest Deployment

Current testnet deployment:

```
Carapace: 0x1cf2a4770d40e26f748a54714f7713b753d7101f75dd732a5480e2ef139b54a4
Hatch:    0x559ee79d0e174b337c904bea96bdd8c19e5074df8341c0756b214c77e243925d
```

View on explorer:
- [Carapace](https://suiscan.xyz/testnet/object/0x1cf2a4770d40e26f748a54714f7713b753d7101f75dd732a5480e2ef139b54a4)
- [Hatch](https://suiscan.xyz/testnet/object/0x559ee79d0e174b337c904bea96bdd8c19e5074df8341c0756b214c77e243925d)

## Documentation

- [Full deployment docs](deploy/README.md) - Detailed guide for deployment system
- [Artifacts structure](deployments/README.md) - How artifacts are organized
- [Adding new packages](deploy/README.md#adding-new-deployment-scripts) - Extend the system

## Troubleshooting

### "Carapace not deployed yet"
Deploy Carapace first: `bun run deploy:carapace`

### "Package already deployed"
Use `--force` to redeploy: `bun run deploy:force`

### Move.toml not restored
Check for `Move.toml.backup` files and restore manually if needed.

For more help, see [deploy/README.md](deploy/README.md).
