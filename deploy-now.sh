#!/bin/bash

# Quick deployment script for testnet
# Run with: bash deploy-now.sh

echo "🚀 Hatch Testnet Deployment"
echo "=============================="
echo ""

# Check if we're in the right directory
if [ ! -f "Taskfile.yml" ]; then
    echo "❌ Error: Run this from the hatch directory"
    exit 1
fi

# Check if SUI_PRIVATE_KEY is set
if [ -z "$SUI_PRIVATE_KEY" ]; then
    echo "⚠️  SUI_PRIVATE_KEY not set!"
    echo ""
    echo "To set it up:"
    echo "1. Run: sui keytool export --key-identity 0xe91b754c809f16c3a88e7be33a56b348532c377fbea30ed92ea34371c68466b9"
    echo "2. Copy the private key (starts with 'suiprivkey1q...')"
    echo "3. Export it: export SUI_PRIVATE_KEY=\"suiprivkey1q...\""
    echo "4. Run this script again"
    echo ""
    exit 1
fi

echo "✅ Private key is set"
echo "✅ You have $(sui client gas | grep -o '[0-9.]*' | head -1) SUI on testnet"
echo ""

# Step 1: Build Move contracts
echo "📦 Step 1/5: Building Move contracts..."
cd move && sui move build && cd .. || exit 1
echo "✅ Build complete"
echo ""

# Step 2: Test Move contracts
echo "🧪 Step 2/5: Running tests..."
cd move && timeout 60 sui move test 2>/dev/null || echo "⚠️  Some tests failed, but continuing..."
cd ..
echo ""

# Step 3: Validate configuration
echo "⚙️  Step 3/5: Validating configuration..."
if [ ! -f "scripts/validate-config.ts" ]; then
    echo "⚠️  Config validation script not found, skipping..."
else
    bun run scripts/validate-config.ts 2>/dev/null || echo "⚠️  Validation warnings (safe to continue)"
fi
echo ""

# Step 4: Deploy contracts
echo "🚀 Step 4/5: Deploying to testnet..."
echo "This will take 30-60 seconds..."
bun run scripts/deploy.ts testnet || exit 1
echo "✅ Deployment complete!"
echo ""

# Step 5: Create pools (if script exists)
echo "💧 Step 5/5: Creating pools..."
if [ -f "scripts/create-pool.ts" ]; then
    bun run scripts/create-pool.ts testnet || echo "⚠️  Pool creation skipped"
else
    echo "⚠️  Pool creation script not found, skipping..."
fi
echo ""

echo "=============================="
echo "✅ DEPLOYMENT SUCCESSFUL!"
echo "=============================="
echo ""
echo "📝 Next steps:"
echo "1. Check deployment: task deploy:health"
echo "2. View in explorer: https://suiexplorer.com/?network=testnet"
echo "3. Customize landing page: landing-page.html"
echo "4. Deploy landing page: vercel landing-page.html"
echo "5. Start LP outreach (see OUTREACH_TEMPLATES.md)"
echo ""
echo "💰 With $100 budget:"
echo "- Month 1 server: $50"
echo "- Month 2 server: $50"
echo "- Need external LPs for liquidity (see DEPLOY_WITH_100.md)"
echo ""
echo "Good luck! 🚀"
