# 🚀 START HERE - TMS Price Monitor Bot

## What You Have

A complete automated trading system that:
- ✅ Monitors **17 TMS subdomains** simultaneously
- ✅ Checks prices in **round-robin rotation** (one at a time)
- ✅ Respects **2 requests/second rate limit**
- ✅ **Automatically places orders** on ALL subdomains when price matches
- ✅ Uses your existing trading logic

## Quick Start (5 Steps)

### 1️⃣ Install Playwright

```bash
cd C:\Users\Susam\Documents\Project\claude\price-monitor-bot
npx playwright install chromium
```

### 2️⃣ Start the Server

```bash
npm start
```

Then open: **http://localhost:3000**

### 3️⃣ Add Your 17 Subdomains

**Option A: Manual (Dashboard)**
- Click "Add" button for each subdomain
- Fill in URL, Name, and Script ID

**Option B: Automatic (Recommended)**
1. Open `setup-tms-subdomains.js`
2. Change `const TMS_DOMAIN = 'example.com';` to your actual domain
3. Open browser console on the dashboard
4. Copy and paste the entire script
5. Press Enter - all 17 subdomains will be added automatically!

### 4️⃣ Configure Scripts

**Price Check Script:**
- Open `PRICE-CHECK-SCRIPT.js`
- Copy entire contents
- Paste into "Price Check Script" field in dashboard
- Click "Save Script"

**Order Placement Script:**
- Open `ORDER-PLACEMENT-SCRIPT.js`
- Copy entire contents
- Paste into "Order Placement Script" field in dashboard
- Click "Save Script"

### 5️⃣ Set Target and Start

1. **Set Price Target**: `254.1` (for NLO)
2. **Choose Condition**: `Less than or equal (≤)`
3. **Click**: "▶️ Start Monitoring"
4. **Login**: Manually login to each subdomain when browsers open
5. **Watch**: The bot will handle everything else!

## Your 17 Subdomains

```
tms13, tms17, tms18, tms32, tms34, tms35, tms41, tms45,
tms55, tms57, tms59, tms61, tms63, tms64, tms74, tms77, tms87
```

## How It Works

```
🔄 Rotation Cycle:

Check tms13 (NLO price: 255.0) ❌
   ⏱️  Wait 500ms
Check tms17 (NLO price: 254.5) ❌
   ⏱️  Wait 500ms
Check tms18 (NLO price: 254.0) ✅ MATCH!
   🎯 Price ≤ 254.1 detected!
   📦 Placing orders on ALL 17 subdomains...
   ✅ Order placed on tms13
   ✅ Order placed on tms17
   ✅ Order placed on tms18
   ✅ Order placed on tms32
   ... (all 17 subdomains)
   ⏹️  Monitoring stopped
```

**Full Cycle Time**: ~8.5 seconds (17 subdomains ÷ 2 req/sec)

## Files Included

| File | Purpose |
|------|---------|
| `START-HERE.md` | This file - quick start guide |
| `TMS-SETUP-GUIDE.md` | Detailed setup instructions |
| `PRICE-CHECK-SCRIPT.js` | Copy/paste into dashboard (price checking) |
| `ORDER-PLACEMENT-SCRIPT.js` | Copy/paste into dashboard (order placement) |
| `setup-tms-subdomains.js` | Auto-add all 17 subdomains |
| `tms-integration.js` | Your configuration data (reference) |
| `README.md` | Full documentation |
| `EXAMPLE-USAGE.md` | Usage examples |

## Important Notes

### Stock Monitoring
- **Default**: Monitors `NLO` stock
- **Change**: Edit `STOCK_TO_MONITOR` in `PRICE-CHECK-SCRIPT.js`
- **Other stocks**: `SYPNL`, `JHAPA`, `SWASTIK`, `SAIL`

### Price Targets
Each stock has different target prices:
- **NLO**: 254.1
- **SYPNL**: 684.8
- **JHAPA**: 1073.6
- **SWASTIK**: 2327.0
- **SAIL**: 781.7

### Using Your Full Trading Script

Your original JavaScript trading code has advanced features (pre-orders, circuit monitoring, etc.). To use it:

**Option 1**: Load in browser first
```javascript
// Open each subdomain
// Press F12 → Console
// Paste your entire trading script
// Then start the bot
```

**Option 2**: Embed in order script
```javascript
// Open ORDER-PLACEMENT-SCRIPT.js
// Find the comment: "PASTE YOUR TRADING SCRIPT HERE"
// Paste your entire original code there
// Save in dashboard
```

## Testing

### Test with 1 Subdomain First
1. Add only `tms13` to start
2. Set a high price target (ensure it matches immediately)
3. Start monitoring
4. Verify order is placed
5. Then add all 17 subdomains

### Monitor the Logs
The dashboard logs panel shows:
- Which subdomain is being checked
- Current price vs target price
- Order placement success/failure
- Real-time progress

## Troubleshooting

### "Stock not found"
- Login to the subdomain first
- Check localStorage has `__securities__` data

### "Trading function not found"
- Load your trading script in console first, OR
- Paste full script into ORDER-PLACEMENT-SCRIPT.js

### Orders not placing
- Verify you're logged in
- Check authentication tokens
- Test the `up()` function manually in console

### Price not updating
- Check network tab for API calls
- Verify XSRF token is valid
- Try refreshing the page

## What Happens When Price Matches

1. **Detection**: Bot detects price match on ANY subdomain
2. **Notification**: Logs show "🎯 PRICE MATCH!"
3. **Order Placement**: Bot places orders on **ALL 17 subdomains**
4. **Rate Limited**: Orders placed at 2 per second (respects rate limit)
5. **Completion**: Shows success/failure for each subdomain
6. **Auto-Stop**: Monitoring stops after all orders attempted

## Dashboard Features

### Real-time Updates
- Live price updates for each subdomain
- Status indicators (idle, checking, ordering, completed)
- Color-coded logs (info, success, warning, error)
- WebSocket connection for instant updates

### Controls
- ▶️  Start/Stop monitoring
- ✅ Enable/Disable individual subdomains
- 🗑️  Remove subdomains
- 🔄 Clear logs

## Advanced Configuration

### Change Rate Limit
Edit `src/utils/rateLimiter.js`:
```javascript
// Change from 2 req/sec to 1 req/sec
this.rateLimiter = new RateLimiter(1, 1000);
```

### Monitor Multiple Stocks
Create separate monitoring sessions for each stock, or modify the price check script to return the lowest price among multiple stocks.

### Custom Order Logic
Edit `ORDER-PLACEMENT-SCRIPT.js` to add custom logic before placing orders (e.g., check balance, verify session, etc.).

## Next Steps

1. ✅ Install Playwright browser
2. ✅ Start the server
3. ✅ Add your 17 subdomains (use the auto-setup script!)
4. ✅ Configure price and order scripts
5. ✅ Set price target
6. ✅ Login to all subdomains manually
7. ✅ Start monitoring
8. ✅ Watch the magic happen! 🚀

## Need Help?

Check these files:
- **TMS-SETUP-GUIDE.md** - Detailed setup
- **README.md** - Full documentation
- **EXAMPLE-USAGE.md** - Usage examples

## Let's Go! 🚀

```bash
npm start
```

Then open: **http://localhost:3000**

Happy trading! 📈💰
