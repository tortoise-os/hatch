# Deployment System

Modern, standardized deployment system for Hatch, inspired by [scaffold-eth-2](https://github.com/scaffold-eth/scaffold-eth-2).

## Quick Start

```bash
# Deploy everything to testnet
bun run deploy

# Deploy to specific network
bun run deploy:mainnet

# Force redeploy (skip existing checks)
bun run deploy:force

# Deploy specific package only
bun run deploy:carapace
bun run deploy:hatch
```

## Features

### ✅ Sequential Numbered Scripts
- `00_deploy_carapace.ts` - Deploys Carapace first
- `01_deploy_hatch.ts` - Deploys Hatch with Carapace dependency
- Scripts run in numerical order automatically

### ✅ Tagged Deployments
Deploy specific packages using tags:
```bash
bun run deploy --tags carapace
bun run deploy --tags hatch
bun run deploy --tags carapace,hatch
```

### ✅ Network-Specific Artifacts
Deployments are saved per network:
```
deployments/
├── testnet/
│   ├── carapace.json
│   └── hatch.json
├── mainnet/
│   └── ...
```

### ✅ Idempotent Deployments
- Scripts check for existing deployments
- Use `--force` to override and redeploy
- Prevents accidental duplicate deployments

### ✅ Automatic Artifact Generation
- JSON deployment artifacts in `deployments/{network}/`
- Environment files (`.env.{network}`)
- Legacy config updates (`config/deployment.json`)

### ✅ Clean Move.toml Management
- Automatically backs up Move.toml before deployment
- Temporarily updates addresses for on-chain dependencies
- Restores original Move.toml after deployment
- Keeps version control clean

## Architecture

### Directory Structure

```
hatch/
├── deploy/
│   ├── helpers.ts              # Reusable deployment utilities
│   ├── deploy.ts               # Main deployment runner
│   ├── 00_deploy_carapace.ts   # Carapace deployment
│   └── 01_deploy_hatch.ts      # Hatch deployment
├── deployments/
│   ├── testnet/                # Testnet artifacts
│   ├── mainnet/                # Mainnet artifacts
│   └── README.md
├── move/
│   └── Move.toml               # Always kept clean (0x0 addresses)
└── package.json                # npm/bun scripts
```

### Deployment Flow

```
┌──────────────────────────────────────────────────┐
│  1. bun run deploy                               │
└──────────────┬───────────────────────────────────┘
               │
┌──────────────▼───────────────────────────────────┐
│  2. Run 00_deploy_carapace.ts                    │
│     - Check if already deployed                  │
│     - Build Carapace                             │
│     - Publish to network                         │
│     - Save deployment artifact                   │
└──────────────┬───────────────────────────────────┘
               │
┌──────────────▼───────────────────────────────────┐
│  3. Run 01_deploy_hatch.ts                       │
│     - Load Carapace deployment                   │
│     - Backup Move.toml                           │
│     - Update Move.toml with Carapace address     │
│     - Build Hatch                                │
│     - Publish to network                         │
│     - Save deployment artifact                   │
│     - Restore original Move.toml                 │
└──────────────┬───────────────────────────────────┘
               │
┌──────────────▼───────────────────────────────────┐
│  4. Generate outputs                             │
│     - .env.{network}                             │
│     - config/deployment.json (legacy)            │
│     - Deployment summary                         │
└──────────────────────────────────────────────────┘
```

## Usage Examples

### Basic Deployment

```bash
# Deploy to testnet (default)
bun run deploy

# View generated artifacts
ls deployments/testnet/
cat .env.testnet
```

### Force Redeploy

```bash
# Redeploy everything
bun run deploy:force

# Or with explicit flag
NETWORK=testnet bun run deploy --force
```

### Network-Specific Deployment

```bash
# Deploy to mainnet
NETWORK=mainnet bun run deploy

# Deploy to local network
NETWORK=localnet bun run deploy
```

### Selective Deployment

```bash
# Deploy only Carapace
bun run deploy:carapace

# Deploy only Hatch (requires Carapace already deployed)
bun run deploy:hatch

# Or with tags directly
bun run deploy --tags hatch
```

### Custom Gas Budget

```bash
GAS_BUDGET=200000000 bun run deploy
```

## Adding New Deployment Scripts

1. Create a new numbered script:
```typescript
// deploy/02_deploy_my_package.ts
import { buildPackage, publishPackage, saveDeployment } from './helpers';

export async function deployMyPackage(options: DeployOptions) {
  // Your deployment logic
}
```

2. Register in `deploy.ts`:
```typescript
const DEPLOYMENT_SCRIPTS = [
  // ... existing scripts
  {
    name: '02_deploy_my_package',
    tag: 'mypackage',
    deploy: deployMyPackage,
  },
];
```

3. Add to package.json (optional):
```json
{
  "scripts": {
    "deploy:mypackage": "bun run deploy/deploy.ts --tags mypackage"
  }
}
```

## Helper Functions

### buildPackage(packagePath)
Builds a Move package using `sui move build`.

### publishPackage(packagePath, gasBudget?)
Publishes a Move package and returns deployment result with package ID.

### saveDeployment(network, name, deployment)
Saves deployment artifact to `deployments/{network}/{name}.json`.

### loadDeployment(network, name)
Loads deployment artifact from disk. Returns null if not found.

### getAllDeployments(network)
Gets all deployments for a specific network.

### updateMoveToml(path, addresses)
Updates addresses in Move.toml file.

### generateEnvFile(network)
Generates `.env.{network}` file from deployment artifacts.

### generateDeploymentSummary(network)
Prints a formatted summary of all deployments.

## Environment Variables

- `NETWORK` - Target network (default: testnet)
- `GAS_BUDGET` - Gas budget for transactions (default: 100000000)
- `SUI_PRIVATE_KEY` - Private key for deployment (uses sui client by default)

## Best Practices

1. **Commit Deployment Artifacts**: Testnet and mainnet artifacts should be committed to git for team collaboration
2. **Use Tags**: Deploy specific packages when iterating on a single contract
3. **Test Locally First**: Use `NETWORK=localnet` to test deployment scripts
4. **Review Before Mainnet**: Always deploy to testnet first and verify
5. **Document Dependencies**: Add dependency information in deployment scripts
6. **Idempotent Scripts**: Always check for existing deployments before running

## Comparison to Old System

### Old System (scripts/deploy-integrated.sh)
- ❌ Monolithic bash script
- ❌ Manual artifact management
- ❌ Move.toml manipulation via sed
- ❌ No reusability
- ❌ Hard to test individual steps

### New System (deploy/)
- ✅ Modular TypeScript scripts
- ✅ Automatic artifact management
- ✅ Type-safe deployment logic
- ✅ Reusable helper functions
- ✅ Individual scripts can run standalone
- ✅ Better error handling
- ✅ Standardized across packages

## Troubleshooting

### "Carapace not deployed yet"
Deploy Carapace first: `bun run deploy:carapace`

### "Package already deployed"
Use `--force` to redeploy: `bun run deploy:force`

### "Failed to extract package ID"
- Check you have enough testnet SUI
- Verify network connection
- Check `sui client` is configured

### Move.toml not restored
Check for `Move.toml.backup` files and restore manually if needed.

## Migration from Old System

The old deployment script (`scripts/deploy-integrated.sh`) is still available but deprecated.

To migrate:
1. Run new deployment: `bun run deploy`
2. Verify artifacts in `deployments/testnet/`
3. Update your scripts to use new system
4. Delete old deployment script when ready

Both systems generate compatible `.env.{network}` and `config/deployment.json` files.
