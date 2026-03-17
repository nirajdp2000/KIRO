# Troubleshooting Upstox Authorization

## Issue: "Authorization Failed - Failed to exchange authorization code"

This error occurs when the OAuth authorization code cannot be exchanged for an access token.

## ✅ Fix Applied

The code has been updated to:
1. **Add detailed logging** - Shows exactly what's happening during token exchange
2. **Handle missing expires_in** - Defaults to 24 hours if not provided by Upstox
3. **Better error messages** - Shows the actual error from Upstox API
4. **Validate response** - Checks that access_token is present

## 🔍 Common Causes & Solutions

### 1. Authorization Code Already Used

**Problem**: OAuth authorization codes can only be used once. If you refresh the callback page or try to use the same code again, it will fail.

**Solution**:
- Go back to http://localhost:3000/upstox/connect
- Click "Connect Upstox Account" again
- Complete the authorization flow with a fresh code

### 2. Redirect URI Mismatch

**Problem**: The redirect URI in your Upstox app settings doesn't match the one in .env

**Solution**:
1. Check your .env file:
   ```env
   UPSTOX_REDIRECT_URI=http://localhost:3000/api/upstox/callback
   ```

2. Check Upstox Developer Console:
   - Go to https://account.upstox.com/developer/apps
   - Click on your app
   - Verify "Redirect URI" is exactly: `http://localhost:3000/api/upstox/callback`
   - No trailing slash, exact match required

### 3. Wrong Client ID or Secret

**Problem**: Credentials in .env don't match your Upstox app

**Solution**:
1. Go to https://account.upstox.com/developer/apps
2. Click on your app
3. Copy the correct Client ID and Client Secret
4. Update .env:
   ```env
   UPSTOX_CLIENT_ID=your_actual_client_id
   UPSTOX_CLIENT_SECRET=your_actual_client_secret
   ```
5. Restart server: `npm run dev`

### 4. Expired Authorization Code

**Problem**: Authorization codes expire quickly (usually 10 minutes)

**Solution**:
- Complete the authorization flow quickly
- Don't leave the authorization page open for too long
- If it expires, start over from http://localhost:3000/upstox/connect

### 5. Network/API Issues

**Problem**: Upstox API is down or network issues

**Solution**:
- Check Upstox API status
- Try again in a few minutes
- Check your internet connection

## 🧪 Testing Steps

### Step 1: Verify Configuration
```bash
# Check .env file has all required fields
cat .env | grep UPSTOX

# Should show:
# UPSTOX_CLIENT_ID=...
# UPSTOX_CLIENT_SECRET=...
# UPSTOX_REDIRECT_URI=http://localhost:3000/api/upstox/callback
```

### Step 2: Test OAuth URL Generation
```bash
curl http://localhost:3000/api/upstox/auth-url

# Should return:
# {"authUrl":"https://api.upstox.com/v2/login/authorization/dialog?..."}
```

### Step 3: Check Server Logs
When you try to authorize, watch the server console for:
```
[UpstoxTokenManager] Exchanging authorization code...
[UpstoxTokenManager] Response received: {...}
[UpstoxTokenManager] Storing tokens with expires_in: 86400
[UpstoxTokenManager] Authorization code exchanged successfully
```

If you see errors, they will show the exact problem.

### Step 4: Verify Redirect URI
1. In Upstox Developer Console, check your app's redirect URI
2. It must be EXACTLY: `http://localhost:3000/api/upstox/callback`
3. No `https://`, no trailing `/`, exact match

## 📋 Step-by-Step Authorization (Fresh Start)

1. **Clear any existing tokens**:
   ```bash
   rm upstox-tokens.db
   ```

2. **Restart server**:
   ```bash
   npm run dev
   ```

3. **Open connect page**:
   - Go to: http://localhost:3000/upstox/connect
   - You should see "Connect Upstox Account" button

4. **Click the button**:
   - You'll be redirected to Upstox login
   - Login with your Upstox credentials
   - Click "Authorize"

5. **Wait for redirect**:
   - You'll be redirected back to http://localhost:3000/api/upstox/callback
   - Should see "✅ Authorization Successful!"
   - If you see error, check server logs

6. **Verify connection**:
   ```bash
   curl http://localhost:3000/api/upstox/connection-info
   
   # Should show:
   # {"connected":true,"dataSource":"live",...}
   ```

## 🔍 Debug Mode

To see detailed logs during authorization:

1. Watch server console while authorizing
2. Look for these log messages:
   ```
   [UpstoxTokenManager] Exchanging authorization code...
   [UpstoxTokenManager] Response received: {...}
   ```

3. If there's an error, you'll see:
   ```
   [UpstoxTokenManager] Code exchange failed: <error details>
   ```

## 🆘 Still Having Issues?

### Check Upstox API Response
The server now logs the full response from Upstox. Look for:
```
[UpstoxTokenManager] Response received: {
  "access_token": "...",
  "expires_in": 86400,
  ...
}
```

### Common Error Messages

**"NOT NULL constraint failed: upstox_tokens.expires_at"**
- ✅ **FIXED** - Code now defaults to 24 hours if expires_in is missing

**"No access_token in response"**
- Problem: Upstox didn't return an access token
- Solution: Check credentials, try again

**"Failed to exchange authorization code"**
- Problem: Generic error from Upstox API
- Solution: Check server logs for specific error details

### Manual Token Test
If you have a valid access token from Upstox, you can test it:

```bash
# Test with your token
curl -H "Authorization: Bearer YOUR_TOKEN" \
  https://api.upstox.com/v2/user/profile

# Should return your profile if token is valid
```

## ✅ Success Indicators

When authorization works, you'll see:

1. **In Browser**:
   - "✅ Authorization Successful!" page
   - "Tokens are stored securely and will auto-refresh daily"

2. **In Server Logs**:
   ```
   [UpstoxTokenManager] Exchanging authorization code...
   [UpstoxTokenManager] Response received: {...}
   [UpstoxTokenManager] Storing tokens with expires_in: 86400
   [UpstoxTokenManager] Tokens stored successfully
   [UpstoxTokenManager] Authorization code exchanged successfully
   ```

3. **In API Response**:
   ```bash
   curl http://localhost:3000/api/upstox/connection-info
   # {"connected":true,"dataSource":"live",...}
   ```

## 📞 Need More Help?

1. **Check server logs** - Most errors are logged with details
2. **Verify credentials** - Double-check Client ID, Secret, and Redirect URI
3. **Try fresh authorization** - Delete upstox-tokens.db and start over
4. **Check Upstox status** - Visit https://status.upstox.com/

## 🎯 Quick Checklist

- [ ] .env file has all 3 Upstox variables
- [ ] Redirect URI matches exactly in Upstox console
- [ ] Client ID and Secret are correct
- [ ] Server is running
- [ ] Using fresh authorization code (not reused)
- [ ] Completing authorization quickly (within 10 minutes)
- [ ] Checking server logs for error details

---

**Updated**: Authorization code exchange now handles missing expires_in field and provides detailed logging for debugging.

**Try again**: http://localhost:3000/upstox/connect
