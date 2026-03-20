#!/bin/bash
# Add environment variables to Vercel
echo "80af4324-44bf-4bff-9a4d-764536b514e1" | vercel env add UPSTOX_CLIENT_ID production
echo "ilm324qk8m" | vercel env add UPSTOX_CLIENT_SECRET production
echo "https://nirajstock.vercel.app/api/upstox/callback" | vercel env add UPSTOX_REDIRECT_URI production
echo "AIzaSyD1DHKMhttOMNxDKUF2VFFKiOM76GpTnbw" | vercel env add GEMINI_API_KEY production
echo "AIzaSyD1DHKMhttOMNxDKUF2VFFKiOM76GpTnbw" | vercel env add API_KEY production
