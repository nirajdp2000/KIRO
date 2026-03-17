# Upstox Integration - Quick Reference Card

## 🚀 Quick Start (5 minutes)

```bash
# 1. Get credentials from https://account.upstox.com/developer/apps
# 2. Add to .env:
UPSTOX_CLIENT_ID=your_client_id
UPSTOX_CLIENT_SECRET=your_client_secret
UPSTOX_REDIRECT_URI=http://localhost:3000/api/upstox/callback

# 3. Start server
npm run dev

# 4. Get auth URL
curl http://localhost:3000/api/upstox/auth-url

# 5. Open URL in browser, login, authorize
# 6. Done! Tokens auto-refresh daily at 8:30 AM IST
```

## 📡 API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/upstox/auth-url` | GET | Get OAuth URL |
| `/api/upstox/callback` | GET | OAuth callback |
| `/api/upstox/status` | GET | Check auth status |
| `/api/upstox/refresh` | POST | Manual refresh |
| `/api/upstox/profile` | GET | Test connection |

## 💻 Code Usage

```typescript
import { UpstoxService } from './src/services/upstox/UpstoxService';

const upstox = UpstoxService.getInstance();

// Check auth
await upstox.isAuthenticated();

// Fetch data
await upstox.apiClient.fetchHistoricalData(
  'NSE_EQ|INE002A01018', '5minute', '2024-01-01', '2024-01-31'
);

// Get holdings
await upstox.apiClient.fetchHoldings();

// Get quotes
await upstox.apiClient.fetchMarketQuotes(['NSE_EQ|INE002A01018']);
```

## 🔧 Troubleshooting

```bash
# Check status
curl http://localhost:3000/api/upstox/status

# Manual refresh
curl -X POST http://localhost:3000/api/upstox/refresh

# Test connection
curl http://localhost:3000/api/upstox/profile

# Reset database
rm upstox-tokens.db
# Then re-authenticate
```

## 📊 Available API Methods

- `fetchHistoricalData()` - OHLCV candles
- `fetchHoldings()` - Portfolio holdings
- `fetchPositions()` - Open positions
- `fetchProfile()` - User profile
- `fetchMarketQuotes()` - Live quotes
- `placeOrder()` - Place orders
- `fetchOrderBook()` - All orders
- `fetchFunds()` - Funds & margin

## 🔐 Security Checklist

- [x] Never commit `.env` file
- [x] Keep `upstox-tokens.db` private
- [x] Use HTTPS in production
- [x] Rotate secrets regularly

## 📚 Documentation

- **Setup**: `UPSTOX_SETUP_GUIDE.md`
- **API Docs**: `src/services/upstox/README.md`
- **Summary**: `UPSTOX_IMPLEMENTATION_SUMMARY.md`
- **Test**: `bash test-upstox-integration.sh`

## ⚡ Key Features

✅ OAuth 2.0 flow  
✅ Auto-refresh tokens  
✅ Daily scheduled refresh (8:30 AM IST)  
✅ SQLite storage  
✅ Fail-safe design  
✅ Zero breaking changes  

## 🎯 Production Deployment

```env
# Update .env for production
UPSTOX_REDIRECT_URI=https://yourdomain.com/api/upstox/callback
```

```bash
# Set database permissions
chmod 600 upstox-tokens.db
```

## 📞 Support

- Check logs for `[Upstox*]` messages
- Verify Upstox API status
- Re-authenticate if needed
- Review documentation files

---

**Status**: ✅ Production Ready  
**Setup Time**: 5 minutes  
**Maintenance**: Zero (fully automated)
