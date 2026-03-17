#!/bin/bash

# Upstox Integration Test Script
# This script tests all Upstox OAuth endpoints

echo "🧪 Testing Upstox Integration..."
echo ""

BASE_URL="http://localhost:3000"

# Test 1: Check server is running
echo "1️⃣  Testing server health..."
if curl -s "$BASE_URL/api/stocks/search?q=REL" > /dev/null; then
    echo "   ✅ Server is running"
else
    echo "   ❌ Server is not running. Start it with: npm run dev"
    exit 1
fi
echo ""

# Test 2: Get authentication status
echo "2️⃣  Checking authentication status..."
STATUS=$(curl -s "$BASE_URL/api/upstox/status")
echo "   Response: $STATUS"
echo ""

# Test 3: Get authorization URL
echo "3️⃣  Getting OAuth authorization URL..."
AUTH_URL=$(curl -s "$BASE_URL/api/upstox/auth-url")
echo "   Response: $AUTH_URL"
echo ""

# Test 4: Check if authenticated
if echo "$STATUS" | grep -q '"authenticated":true'; then
    echo "4️⃣  ✅ Already authenticated! Testing API calls..."
    echo ""
    
    # Test 5: Fetch user profile
    echo "5️⃣  Fetching user profile..."
    PROFILE=$(curl -s "$BASE_URL/api/upstox/profile")
    if echo "$PROFILE" | grep -q '"data"'; then
        echo "   ✅ Profile fetched successfully"
        echo "   Response: $PROFILE"
    else
        echo "   ⚠️  Profile fetch failed (might need re-authentication)"
        echo "   Response: $PROFILE"
    fi
    echo ""
    
    # Test 6: Manual token refresh
    echo "6️⃣  Testing manual token refresh..."
    REFRESH=$(curl -s -X POST "$BASE_URL/api/upstox/refresh")
    echo "   Response: $REFRESH"
    echo ""
    
    echo "✅ All tests completed!"
else
    echo "4️⃣  ⚠️  Not authenticated yet"
    echo ""
    echo "📋 To authenticate:"
    echo "   1. Copy the authUrl from the response above"
    echo "   2. Open it in your browser"
    echo "   3. Login to Upstox and authorize"
    echo "   4. Run this script again to verify"
    echo ""
fi

echo ""
echo "📚 Documentation:"
echo "   - Setup Guide: UPSTOX_SETUP_GUIDE.md"
echo "   - API Docs: src/services/upstox/README.md"
echo ""
