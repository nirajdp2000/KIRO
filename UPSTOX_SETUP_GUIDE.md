# Upstox Integration - Quick Setup Guide

This guide will help you set up the persistent, automatic Upstox API connection in under 5 minutes.

## What You Get

✅ **Automatic Daily Connection** - Tokens refresh at 8:30 AM IST before market open  
✅ **Secure Token Storage** - SQLite database with auto-refresh logic  
✅ **Zero Manual Intervention** - Set it up once, works forever  
✅ **Fail-Safe Design** - App continues working even if Upstox is down  
✅ **Production Ready** - OAuth 2.0 flow with industry best practices  

## Prerequisites

- Node.js installed
- Upstox trading account
- 5 minutes of your time

## Step 1: Get Upstox API Credentials (2 minutes)

1. Go to [Upstox Developer Console](https://account.upstox.com/developer/apps)
2. Click **"Create App"**
3. Fill in the details:
   - **App Name**: StockPulse Terminal (or any name)
   - **Redirect URI**: `http://localhost:3000/api/upstox/callback`
   - **App Type**: Web Application
4. Click **"Create"**
5. Copy your credentials:
   - **Client ID** (looks like: `abc123xyz`)
   - **Client Secret** (looks like: `def456uvw`)

## Step 2: Configure Environment Variables (1 minute)

1. Open your `.env` file in the project root
2. Add these lines (replace with your actual credentials):

```env
UPSTOX_CLIENT_ID=your_client_id_here
UPSTOX_CLIENT_SECRET=your_client_secret_here
UPSTOX_REDIRECT_URI=http://localhost:3000/api/upstox/callback
```

3. Save the file

## Step 3: Start the Server (30 seconds)

```bash
npm run dev
```

You should see:
```
[UpstoxService] Initializing Upstox integration...
[UpstoxScheduler] Starting scheduler...
Server running on http://localhost:3000
```

## Step 4: Authenticate (One-Time, 1 minute)

### Option A: Using Browser

1. Open a new terminal
2. Run:
   ```bash
   curl http://localhost:3000/api/upstox/auth-url
   ```
3. Copy the `authUrl` from the response
4. Open it in your browser
5. Login to Upstox and click **"Authorize"**
6. You'll see: **"✅ Authorization Successful!"**

### Option B: Direct Browser Access

1. Open: `http://localhost:3000/api/upstox/auth-url`
2. Copy the URL from the JSON response
3. Paste it in a new tab
4. Login and authorize
5. Done!

## Step 5: Verify Connection (30 seconds)

Check authentication status:

```bash
curl http://localhost:3000/api/upstox/status
```

Expected response:
```json
{
  "authenticated": true,
  "message": "Connected to Upstox. Tokens will auto-refresh daily."
}
```

Test the connection by fetching your profile:

```bash
curl http://localhost:3000/api/upstox/profile
```

You should see your Upstox user details!

## That's It! 🎉

Your Upstox integration is now:
- ✅ Connected and authenticated
- ✅ Storing tokens securely in SQLite
- ✅ Auto-refreshing tokens before expiry
- ✅ Scheduled to refresh daily at 8:30 AM IST
- ✅ Ready to use for all API calls

## What Happens Next?

### Automatic Daily Refresh

Every day at 8:30 AM IST (before market open), the system will:
1. Check if token is about to expire
2. Automatically refresh it using the refresh_token
3. Store the new tokens in the database
4. Log the success

You'll see in the logs:
```
[UpstoxScheduler] Performing daily token refresh...
[UpstoxTokenManager] Token refreshed successfully
[UpstoxScheduler] Daily token refresh successful
```

### On Every API Call

Before each Upstox API call, the system:
1. Checks if token is expired (with 5-minute buffer)
2. Auto-refreshes if needed
3. Uses the fresh token for the request

### If Something Goes Wrong

The system is designed to be fail-safe:
- If token refresh fails → logs error, app continues with simulated data
- If Upstox API is down → falls back to deterministic local replay
- If database is corrupted → you can re-authenticate via OAuth flow

## Using the Integration

### In Your Code

```typescript
import { UpstoxService } from './src/services/upstox/UpstoxService';

const upstoxService = UpstoxService.getInstance();

// Fetch historical data
const data = await upstoxService.apiClient.fetchHistoricalData(
  'NSE_EQ|INE002A01018', // RELIANCE
  '5minute',
  '2024-01-01',
  '2024-01-31'
);

// Fetch user holdings
const holdings = await upstoxService.apiClient.fetchHoldings();

// Fetch market quotes
const quotes = await upstoxService.apiClient.fetchMarketQuotes([
  'NSE_EQ|INE002A01018',
  'NSE_EQ|INE467B01029'
]);
```

### Available API Methods

The `UpstoxApiClient` provides:
- `fetchHistoricalData()` - Get OHLCV candles
- `fetchHoldings()` - Get portfolio holdings
- `fetchPositions()` - Get open positions
- `fetchProfile()` - Get user profile
- `fetchMarketQuotes()` - Get live quotes
- `placeOrder()` - Place orders (extensible)
- `fetchOrderBook()` - Get all orders
- `fetchFunds()` - Get funds and margin

## Troubleshooting

### "No valid token" Error

**Solution:**
```bash
# Check status
curl http://localhost:3000/api/upstox/status

# If not authenticated, get auth URL and complete OAuth flow
curl http://localhost:3000/api/upstox/auth-url
```

### Token Refresh Fails

**Possible causes:**
1. Wrong `UPSTOX_CLIENT_SECRET` in `.env`
2. Upstox API is down
3. Refresh token expired (rare, usually valid for 1 year)

**Solution:**
- Verify `.env` credentials
- Re-authenticate via OAuth flow

### Daily Refresh Not Working

**Check:**
```bash
# Manually trigger refresh
curl -X POST http://localhost:3000/api/upstox/refresh
```

**Check logs:**
```
[UpstoxScheduler] Next token refresh scheduled at 2024-01-15T03:00:00.000Z
```

### Database Issues

**Reset database:**
```bash
rm upstox-tokens.db
# Then re-authenticate via OAuth flow
```

## Security Notes

✅ **Never commit `.env` file** - It contains your secrets  
✅ **Keep `upstox-tokens.db` private** - It contains access tokens  
✅ **Use HTTPS in production** - Update redirect URI to `https://`  
✅ **Rotate secrets regularly** - Regenerate client secret periodically  

## Production Deployment

When deploying to production:

1. Update redirect URI in Upstox Developer Console:
   ```
   https://yourdomain.com/api/upstox/callback
   ```

2. Update `.env`:
   ```env
   UPSTOX_REDIRECT_URI=https://yourdomain.com/api/upstox/callback
   ```

3. Ensure database file has proper permissions:
   ```bash
   chmod 600 upstox-tokens.db
   ```

4. Set up monitoring for token refresh logs

## Need Help?

- Check `src/services/upstox/README.md` for detailed documentation
- Review server logs for error messages
- Test endpoints using the provided curl commands
- Verify Upstox API status at [Upstox Status Page](https://status.upstox.com/)

## Next Steps

Now that Upstox is connected, you can:
- ✅ Use real-time market data instead of simulated data
- ✅ Fetch user portfolio and positions
- ✅ Build order placement features
- ✅ Implement live trading automation
- ✅ Sync portfolio with your dashboard

Happy Trading! 📈
