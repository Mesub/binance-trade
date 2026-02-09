# TMS Trading System Setup Guide

This guide shows you how to set up the Price Monitor Bot for your TMS trading system with 17 subdomains.

## Your Subdomains

You have 17 TMS subdomains:
- tms13, tms17, tms18, tms32, tms34, tms35, tms41, tms45
- tms55, tms57, tms59, tms61, tms63, tms64, tms74, tms77, tms87

## Quick Setup

### Step 1: Install Playwright Browser

```bash
cd C:\Users\Susam\Documents\Project\claude\price-monitor-bot
npx playwright install chromium
```

### Step 2: Start the Server

```bash
npm start
```

Open dashboard at: `http://localhost:3000`

### Step 3: Add All Your Subdomains

Use this format for each subdomain:

| Subdomain | URL | Name | Script ID |
|-----------|-----|------|-----------|
| tms13 | https://tms13.example.com | TMS 13 | tms13 |
| tms17 | https://tms17.example.com | TMS 17 | tms17 |
| tms18 | https://tms18.example.com | TMS 18 | tms18 |
| tms32 | https://tms32.example.com | TMS 32 | tms32 |
| tms34 | https://tms34.example.com | TMS 34 | tms34 |
| tms35 | https://tms35.example.com | TMS 35 | tms35 |
| tms41 | https://tms41.example.com | TMS 41 | tms41 |
| tms45 | https://tms45.example.com | TMS 45 | tms45 |
| tms55 | https://tms55.example.com | TMS 55 | tms55 |
| tms57 | https://tms57.example.com | TMS 57 | tms57 |
| tms59 | https://tms59.example.com | TMS 59 | tms59 |
| tms61 | https://tms61.example.com | TMS 61 | tms61 |
| tms63 | https://tms63.example.com | TMS 63 | tms63 |
| tms64 | https://tms64.example.com | TMS 64 | tms64 |
| tms74 | https://tms74.example.com | TMS 74 | tms74 |
| tms77 | https://tms77.example.com | TMS 77 | tms77 |
| tms87 | https://tms87.example.com | TMS 87 | tms87 |

**Replace `example.com` with your actual domain!**

### Step 4: Configure Price Check Script

This script will check the LTP (Last Traded Price) for NLO stock on each subdomain:

```javascript
// Price Check Script - Paste this in the dashboard

// Get subdomain from URL
function getSubdomain() {
    const host = window.location.hostname;
    const parts = host.split('.');
    return parts.length > 2 ? parts[0] : null;
}

// Get the stock symbol to monitor for this subdomain
// Using scriptId passed from the bot (will be "tms13", "tms17", etc.)
const subdomain = scriptId || getSubdomain();

// Primary stock to monitor is NLO for all subdomains
const stockSymbol = 'NLO';

// Try multiple API endpoints to get LTP
async function fetchLTP() {
    const host = document.location.origin;

    // Get stock info from localStorage
    const totalScripList = JSON.parse(localStorage.getItem("__securities__")).data;
    const scrip = totalScripList.find(s => s.symbol === stockSymbol);

    if (!scrip) {
        throw new Error(`Stock ${stockSymbol} not found`);
    }

    // Try OHLC endpoint (most reliable)
    try {
        const response = await fetch(
            `${host}/tmsapi/rtApi/stock/validation/ohlc/${scrip.id}/${scrip.isin}`,
            {
                credentials: "include",
                headers: {
                    "accept": "application/json",
                    "x-xsrf-token": getCookie("XSRF-TOKEN")
                }
            }
        );

        const data = await response.json();
        if (data.status === "200" && data.data && data.data.ltp) {
            return parseFloat(data.data.ltp);
        }
    } catch (error) {
        console.error("Error fetching LTP:", error);
    }

    throw new Error("Could not fetch LTP");
}

// Helper to get cookie
function getCookie(name) {
    const nameEQ = name + "=";
    const ca = document.cookie.split(';');
    for (let i = 0; i < ca.length; i++) {
        let c = ca[i];
        while (c.charAt(0) === ' ') c = c.substring(1, c.length);
        if (c.indexOf(nameEQ) === 0) return c.substring(nameEQ.length, c.length);
    }
    return null;
}

// Return the LTP
return await fetchLTP();
```

### Step 5: Configure Order Placement Script

This script will execute your full trading logic when price matches:

```javascript
// Order Placement Script - Paste this in the dashboard

// Your full trading code will be executed here
// The scriptId parameter contains the subdomain (tms13, tms17, etc.)

const subdomain = scriptId;
console.log(`Executing order placement for ${subdomain}`);

// Get subdomain from URL (backup method)
function getSubdomain() {
    const host = window.location.hostname;
    const parts = host.split('.');
    return parts.length > 2 ? parts[0] : null;
}

// Run the SYPNL order function (or whichever stock matched)
// This will trigger your existing up() function

// Check if the up() function exists in the page
if (typeof up === 'function') {
    up(); // This runs your existing trading logic
    return true;
} else {
    console.error("Trading function 'up()' not found. Make sure your trading script is loaded in the page.");
    // Fallback: You can paste the entire trading logic here if needed
    return false;
}
```

### Step 6: Set Price Target

For NLO stock monitoring:
- **Target Price**: `254.1` (or whatever price you want to trigger at)
- **Condition**: `Less than or equal (≤)`

This means: When NLO price drops to or below 254.1, trigger orders on all subdomains.

### Step 7: Manual Login

1. Click "Start Monitoring"
2. Browser windows will open for all 17 subdomains
3. **Manually login to each subdomain** (you'll need to do this once)
4. The bot will maintain these sessions

### Step 8: Monitor

The bot will:
1. Rotate through all 17 subdomains: tms13 → tms17 → tms18 → ... → tms87
2. Check NLO price on each (respecting 2 req/sec rate limit)
3. Full cycle time: ~8.5 seconds (17 subdomains ÷ 2 req/sec)
4. When price matches: Place orders on **ALL 17 subdomains** simultaneously
5. Stop monitoring after orders are placed

## Advanced: Using Your Full Trading Script

If you want to use your complete trading logic (with all the monitoring, pre-orders, etc.), you have two options:

### Option A: Load Script in Browser Console First

1. Before starting the bot, open each subdomain
2. Paste your entire trading script in the browser console
3. This makes functions like `up()`, `upNLO()`, etc. available
4. The bot's order script can then call these functions

### Option B: Embed Full Logic in Order Script

Paste your entire trading code into the "Order Placement Script" textarea in the dashboard. This way, the bot will execute it directly.

## Monitoring Different Stocks

If you want to monitor stocks other than NLO:

**For SYPNL:**
```javascript
const stockSymbol = 'SYPNL';
// ... rest of price check script
```

**For Multiple Stocks:**
Modify the price check script to return the lowest price among multiple stocks, or run separate monitoring sessions for each stock.

## Tips

1. **Start with 2-3 subdomains first** to test the system
2. **Verify price checking works** before adding all 17
3. **Test order placement** on a single subdomain with a test order
4. **Monitor the logs** in the dashboard to see real-time progress
5. **Keep browsers visible** so you can see what's happening

## Troubleshooting

### "Stock NLO not found"
- Make sure you're logged into the subdomain
- Verify localStorage has `__securities__` data
- Check that the stock symbol is correct

### "Trading function not found"
- Load your trading script in the browser console first
- Or embed the full script in the Order Placement Script textarea

### Orders not placing
- Ensure you're logged in to all subdomains
- Check that authentication tokens are valid
- Verify the `up()` function executes without errors in console

### Rate limit errors
- The bot already respects 2 req/sec
- If you still get errors, reduce rate in `src/utils/rateLimiter.js`

## Next Steps

1. Test with single subdomain first
2. Verify price checking works
3. Test order placement
4. Add all 17 subdomains
5. Start monitoring!

Good luck with your trading! 🚀📈
