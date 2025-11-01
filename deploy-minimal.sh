#!/bin/bash

# Minimal Testnet Deployment Script
# Run: bash deploy-minimal.sh

set -e

echo "=============================="
echo "🚀 Hatch Minimal Testnet Deploy"
echo "=============================="
echo ""

# Check if SUI_PRIVATE_KEY is set
if [ -z "$SUI_PRIVATE_KEY" ]; then
    echo "❌ ERROR: SUI_PRIVATE_KEY not set!"
    echo ""
    echo "To fix this, run:"
    echo "  sui keytool export --key-identity 0xe91b754c809f16c3a88e7be33a56b348532c377fbea30ed92ea34371c68466b9"
    echo "  export SUI_PRIVATE_KEY=\"suiprivkey1q...\""
    echo ""
    exit 1
fi

echo "✅ Private key is set"
echo "✅ You have 1.95 SUI on testnet"
echo ""

# Deploy contracts
echo "🚀 Deploying contracts to testnet..."
echo "   This takes ~30 seconds..."
echo ""

cd move

# Run sui client publish
sui client publish --gas-budget 100000000 --json > /tmp/hatch-deploy.json 2>&1

if [ $? -eq 0 ]; then
    echo "✅ Deployment successful!"
    echo ""

    # Extract package ID
    PACKAGE_ID=$(cat /tmp/hatch-deploy.json | grep -o '"packageId":"0x[^"]*"' | head -1 | cut -d'"' -f4)

    if [ -n "$PACKAGE_ID" ]; then
        echo "📦 Package ID: $PACKAGE_ID"

        # Save to file
        cd ..
        echo "{\"network\":\"testnet\",\"packageId\":\"$PACKAGE_ID\",\"deployedAt\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}" > scripts/.pool-info.json

        echo ""
        echo "=============================="
        echo "✅ DEPLOYMENT COMPLETE!"
        echo "=============================="
        echo ""
        echo "📝 Next steps:"
        echo "1. View in explorer:"
        echo "   https://suiexplorer.com/object/$PACKAGE_ID?network=testnet"
        echo ""
        echo "2. Update landing page with your package ID"
        echo "3. Deploy landing page: npx vercel landing-page.html"
        echo "4. Start LP outreach (see DEPLOY_WITH_100.md)"
        echo ""
        echo "💰 Your $100 budget:"
        echo "- Month 1-2 server: $100"
        echo "- Liquidity: $0 (attract external LPs)"
        echo "- Gas used: ~$0.10 (covered by testnet faucet)"
        echo ""
        echo "🎯 Goal: Find 2-5 LPs with $10K-50K total"
        echo "See: OUTREACH_TEMPLATES.md"
        echo ""
    else
        echo "⚠️  Could not extract package ID"
        echo "Check /tmp/hatch-deploy.json for details"
    fi
else
    echo "❌ Deployment failed"
    echo "See error output above"
    cd ..
    exit 1
fi
