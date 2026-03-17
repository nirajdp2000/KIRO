# 🚀 Connect Upstox - Get Live Market Data Now!

## Current Status: Using Simulated Data

Your application is currently using **simulated market data**. Connect your Upstox account to switch to **live real-time data** across all tabs!

## ⚡ Quick Connect (3 Steps - 5 Minutes)

### Step 1: Get Upstox API Credentials (2 minutes)

1. Visit [Upstox Developer Console](https://account.upstox.com/developer/apps)
2. Click **"Create App"**
3. Fill in:
   - **App Name**: StockPulse Terminal
   - **Redirect URI**: `http://localhost:3000/api/upstox/callback`
   - **App Type**: Web Application
4. Click **"Create"**
5. Copy your:
   - **Client ID** (e.g., `abc123xyz`)
   - **Client Secret** (e.g., `def456uvw`)

### Step 2: Configure Application (1 minute)

1. Open `.env` file in your project root
2. Add these lines (replace with your actual credentials):

```env
UPSTOX_CLIENT_ID=your_client_id_here
UPSTOX_CLIENT_SECRET=your_client_secret_here
UPSTOX_REDIRECT_URI=http://localhost:3000/api/upstox/callback
```

3. Save the file
4. Restart the server:
   ```bash
   # Stop current server (Ctrl+C)
   npm run dev
   ```

### Step 3: Connect Your Account (1 minute)

**Option A: Use the Easy Connect Page**
1. Open your browser
2. Go to: http://localhost:3000/upstox/connect
3. Click **"Connect Upstox Account"**
4. Login to Upstox and authorize
5. Done! ✅

**Option B: Use Command Line**
```bash
# Get authorization URL
curl http://localhost:3000/api/upstox/auth-url

# Copy the authUrl from response and open in browser
# Login and authorize
# You'll be redirected back automatically
```

## ✅ Verify Connection

After connecting, verify everything is working:

```bash
# Check connection status
curl http://localhost:3000/api/upstox/connection-info

# Should show:
# {
#   "connected": true,
#   "dataSource": "live",
#   "message": "Connected to Upstox. All tabs using live market data."
# }
```

## 🎯 What Changes After Connection?

### Before (Simulated Data)
- ❌ Mock price movements
- ❌ Fake volume data
- ❌ Simulated indicators
- ❌ No real portfolio
- ⚠️ Message: "Using deterministic local market replay..."

### After (Live Data)
- ✅ Real-time market quotes
- ✅ Actual price movements
- ✅ Live volume data
- ✅ Real indicators (RSI, MACD, etc.)
- ✅ Your actual portfolio & positions
- ✅ Message: "Connected to Upstox. Live data."

## 📊 All Tabs Get Live Data

Once connected, these tabs automatically switch to live data:

1. **Stock Terminal** → Real OHLCV candles
2. **Quant Engines** → Live momentum & sectors
3. **Premium Analytics** → Real-time alerts
4. **Institutional Analytics** → Live order flow
5. **UltraQuant** → Real hedge fund signals
6. **Multibagger Scanner** → Live price data

## 🔄 Auto-Refresh

After initial connection:
- ✅ Tokens refresh automatically before expiry
- ✅ Daily refresh at 8:30 AM IST (before market open)
- ✅ No manual login needed ever again
- ✅ Connection stays active 24/7

## 🛠️ Troubleshooting

### "Configuration Required" Error

**Problem**: Credentials not in .env file

**Solution**:
1. Check `.env` file exists in project root
2. Verify you added all 3 variables:
   - `UPSTOX_CLIENT_ID`
   - `UPSTOX_CLIENT_SECRET`
   - `UPSTOX_REDIRECT_URI`
3. Restart server after editing .env

### "Authorization Failed" Error

**Problem**: Wrong credentials or redirect URI mismatch

**Solution**:
1. Verify credentials are correct (copy-paste from Upstox console)
2. Ensure redirect URI in Upstox console matches exactly:
   ```
   http://localhost:3000/api/upstox/callback
   ```
3. Try creating a new app in Upstox console

### "Token Expired" Message

**Problem**: Token expired and auto-refresh failed

**Solution**:
1. Check internet connection
2. Manually refresh:
   ```bash
   curl -X POST http://localhost:3000/api/upstox/refresh
   ```
3. If still fails, re-authenticate:
   - Visit http://localhost:3000/upstox/connect
   - Click "Connect Upstox Account" again

### Still Seeing Simulated Data

**Problem**: Connection not established

**Solution**:
1. Check connection status:
   ```bash
   curl http://localhost:3000/api/upstox/connection-info
   ```
2. If `"connected": false`, re-authenticate
3. Check server logs for errors
4. Verify .env credentials are correct

## 📱 Easy Access URLs

Bookmark these for quick access:

- **Connect Page**: http://localhost:3000/upstox/connect
- **Connection Status**: http://localhost:3000/api/upstox/connection-info
- **Auth URL**: http://localhost:3000/api/upstox/auth-url
- **Manual Refresh**: http://localhost:3000/api/upstox/refresh (POST)

## 🎨 UI Integration (For Developers)

### Show Connection Status in UI

```typescript
// Fetch connection info
const response = await fetch('/api/upstox/connection-info');
const info = await response.json();

// Show badge
<Badge color={info.connected ? 'green' : 'yellow'}>
  {info.connected ? '🟢 Live Data' : '🟡 Simulated'}
</Badge>

// Show connect button if not connected
{!info.connected && (
  <Button onClick={() => window.open('/upstox/connect', '_blank')}>
    Connect Upstox
  </Button>
)}
```

### Show User Info When Connected

```typescript
{info.connected && info.userInfo && (
  <div>
    Connected as: {info.userInfo.userName}
    <br />
    Email: {info.userInfo.email}
  </div>
)}
```

## 🔐 Security Notes

- ✅ OAuth 2.0 secure flow
- ✅ Tokens stored in encrypted SQLite database
- ✅ Auto-refresh before expiry
- ✅ No credentials in code
- ✅ Environment variables only

## 📈 Benefits Summary

| Feature | Before | After |
|---------|--------|-------|
| Data Source | Simulated | Live Upstox |
| Price Accuracy | Mock | Real-time |
| Volume Data | Fake | Actual |
| Portfolio | None | Your real portfolio |
| Indicators | Simulated | Calculated from live data |
| Updates | Static | Real-time |
| Cost | Free | Free (Upstox account required) |

## 🎉 Success!

Once connected, you'll see:
- ✅ "Connected to Upstox" message in analytics tab
- ✅ Real price movements in charts
- ✅ Actual volume bars
- ✅ Live momentum alerts
- ✅ Real sector rotation
- ✅ Your portfolio data

## 📞 Need Help?

1. **Check logs**: Look for `[Upstox*]` messages in server console
2. **Test endpoints**: Use curl commands above
3. **Verify credentials**: Double-check .env file
4. **Restart server**: Sometimes a restart helps
5. **Re-authenticate**: Visit /upstox/connect again

## 🚀 Next Steps

1. ✅ Get Upstox credentials
2. ✅ Add to .env file
3. ✅ Restart server
4. ✅ Visit http://localhost:3000/upstox/connect
5. ✅ Click "Connect Upstox Account"
6. ✅ Enjoy live market data!

---

**Ready to connect?** Visit: http://localhost:3000/upstox/connect

**Questions?** Check: `UPSTOX_SETUP_GUIDE.md`

🎊 **Get live data in 5 minutes!**
