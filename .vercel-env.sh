#!/bin/bash
# Add environment variables to Vercel
echo "7dd0e849-1497-4dac-9b29-0a00ffdd70c8" | vercel env add UPSTOX_CLIENT_ID production
echo "6c21rv2q18" | vercel env add UPSTOX_CLIENT_SECRET production
echo "https://nstocks.vercel.app/api/upstox/callback" | vercel env add UPSTOX_REDIRECT_URI production
echo "AIzaSyD1DHKMhttOMNxDKUF2VFFKiOM76GpTnbw" | vercel env add GEMINI_API_KEY production
echo "AIzaSyD1DHKMhttOMNxDKUF2VFFKiOM76GpTnbw" | vercel env add API_KEY production
