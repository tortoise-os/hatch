#!/bin/bash

# Script to create a flash loan pool after deployment
set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BLUE}======================================${NC}"
echo -e "${BLUE}  Create Flash Loan Pool${NC}"
echo -e "${BLUE}======================================${NC}"
echo ""

# Load environment
if [ -f ".env.testnet" ]; then
  source .env.testnet
  echo -e "${GREEN}✓ Loaded .env.testnet${NC}"
else
  echo -e "${RED}Error: .env.testnet not found. Run ./scripts/deploy-integrated.sh first${NC}"
  exit 1
fi

# Check required variables
if [ -z "$HATCH_PACKAGE_ID" ]; then
  echo -e "${RED}Error: HATCH_PACKAGE_ID not set${NC}"
  exit 1
fi

# Parameters
COIN_TYPE="${1:-0x2::sui::SUI}"
INITIAL_AMOUNT="${2:-1000000000000}" # 1000 SUI by default (9 decimals)

echo -e "${YELLOW}Configuration:${NC}"
echo "  Network: $NETWORK"
echo "  Package: $HATCH_PACKAGE_ID"
echo "  Coin Type: $COIN_TYPE"
echo "  Initial Liquidity: $INITIAL_AMOUNT"
echo ""

# Get a coin for initial liquidity
echo -e "${GREEN}Step 1/3: Getting coin for initial liquidity...${NC}"
COINS=$(sui client gas --json)
COIN_ID=$(echo "$COINS" | jq -r ".[0].gasCoinId")

if [ -z "$COIN_ID" ] || [ "$COIN_ID" = "null" ]; then
  echo -e "${RED}Error: No coins found. Get testnet SUI from faucet.${NC}"
  exit 1
fi

echo -e "${GREEN}✓ Using coin: $COIN_ID${NC}"

# Split coin if needed (to get the exact amount)
echo -e "${GREEN}Step 2/3: Preparing liquidity coin...${NC}"
SPLIT_OUTPUT=$(sui client split-coin --coin-id "$COIN_ID" --amounts "$INITIAL_AMOUNT" --gas-budget 10000000 --json)
LIQUIDITY_COIN=$(echo "$SPLIT_OUTPUT" | jq -r '.objectChanges[] | select(.objectType | contains("0x2::coin::Coin")) | .objectId' | head -1)

if [ -z "$LIQUIDITY_COIN" ] || [ "$LIQUIDITY_COIN" = "null" ]; then
  echo -e "${RED}Error: Failed to prepare liquidity coin${NC}"
  exit 1
fi

echo -e "${GREEN}✓ Liquidity coin ready: $LIQUIDITY_COIN${NC}"

# Create the pool
echo -e "${GREEN}Step 3/3: Creating flash loan pool...${NC}"

CREATE_OUTPUT=$(sui client call \
  --package "$HATCH_PACKAGE_ID" \
  --module "flash_pool" \
  --function "create_and_share_pool" \
  --args "$LIQUIDITY_COIN" \
  --type-args "$COIN_TYPE" \
  --gas-budget 100000000 \
  --json)

# Extract pool ID
POOL_ID=$(echo "$CREATE_OUTPUT" | jq -r '.objectChanges[] | select(.objectType | contains("Pool")) | .objectId')

if [ -z "$POOL_ID" ] || [ "$POOL_ID" = "null" ]; then
  echo -e "${RED}Error: Failed to extract pool ID${NC}"
  echo "Output: $CREATE_OUTPUT"
  exit 1
fi

echo -e "${GREEN}✓ Pool created: $POOL_ID${NC}"

# Update env file
echo "" >> .env.testnet
echo "# Flash loan pool created on $(date)" >> .env.testnet
echo "POOL_ID=$POOL_ID" >> .env.testnet

# Update deployment config
CONFIG_FILE="config/deployment.json"
if [ -f "$CONFIG_FILE" ]; then
  TEMP_FILE="${CONFIG_FILE}.tmp"
  jq ".${NETWORK}.carapace.pools.\"$COIN_TYPE\" = \"$POOL_ID\"" "$CONFIG_FILE" > "$TEMP_FILE"
  mv "$TEMP_FILE" "$CONFIG_FILE"
  echo -e "${GREEN}✓ Updated $CONFIG_FILE${NC}"
fi

# Summary
echo ""
echo -e "${BLUE}======================================${NC}"
echo -e "${BLUE}  Pool Created Successfully!${NC}"
echo -e "${BLUE}======================================${NC}"
echo ""
echo -e "${YELLOW}Pool ID:${NC} $POOL_ID"
echo -e "${YELLOW}Coin Type:${NC} $COIN_TYPE"
echo -e "${YELLOW}Initial Liquidity:${NC} $INITIAL_AMOUNT"
echo ""
echo -e "${YELLOW}Environment variable added to .env.testnet:${NC}"
echo "  POOL_ID=$POOL_ID"
echo ""
echo -e "${GREEN}Next steps:${NC}"
echo "  1. Source updated env: source .env.testnet"
echo "  2. Test flash loan: bun run packages/strategy-sdk/examples/flash-loan-basic.ts"
echo "  3. View on explorer: https://suiscan.xyz/$NETWORK/object/$POOL_ID"
echo ""
