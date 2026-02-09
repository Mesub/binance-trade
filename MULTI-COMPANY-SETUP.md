# Multi-Company Monitoring Setup

Monitor multiple companies simultaneously across all 17 subdomains!

## Supported Companies

- **NLO** - Target: 254.1
- **SYPNL** - Target: 684.8
- **JHAPA** - Target: 1073.6
- **SWASTIK** - Target: 2327.0
- **SAIL** - Target: 781.7

## Quick Setup

### 1. Start Server

```bash
cd C:\Users\Susam\Documents\Project\claude\price-monitor-bot
npm start
```

Open: **http://localhost:3000**

### 2. Add All 17 Subdomains

Use the auto-setup script in the browser console:

```javascript
// Edit setup-tms-subdomains.js first:
// Change: const TMS_DOMAIN = 'example.com'; to your actual domain
// Then paste the entire file in browser console on dashboard
```

### 3. Configure Multi-Company Scripts

**A. Price Check Script:**

1. Open `scripts/multi-company-price-check.js`
2. **Enable/Disable companies** at the top:

```javascript
const COMPANIES_TO_MONITOR = {
    'NLO': true,        // ← Set to false to disable
    'SYPNL': true,
    'JHAPA': false,     // ← Disabled
    'SWASTIK': true,
    'SAIL': false       // ← Disabled
};
```

3. Copy entire file
4. Paste into dashboard "Price Check Script" field
5. Click "Save Script"

**B. Order Placement Script:**

1. Open `scripts/multi-company-order-placement.js`
2. Copy entire file
3. Paste into dashboard "Order Placement Script" field
4. Click "Save Script"

### 4. Set Price Target

**Important**: When monitoring multiple companies with different prices, use the **lowest target price**:

- **Target**: `254.1` (NLO's price - the lowest)
- **Condition**: `Less than or equal (≤)`

The script will automatically check all enabled companies and match their specific target prices.

### 5. Start Monitoring

1. Click "▶️ Start Monitoring"
2. Login to all 17 subdomains when browsers open
3. Watch the magic happen!

## How It Works

### Single Company Match

```
🔄 Cycle #1: Checking 17 subdomains

🔍 [1/17] Checking TMS 13...
💰 TMS 13 [NLO]: Price = 255.0 (checking...)
💰 TMS 13 [SYPNL]: Price = 685.0 (checking...)
💰 TMS 13 [SWASTIK]: Price = 2330.0 (checking...)
✅ All prices above target

🔍 [2/17] Checking TMS 17...
💰 TMS 17 [NLO]: Price = 254.0 (checking...)
🎯 MATCH! NLO price 254.0 ≤ 254.1
📦 Placing NLO orders on ALL 17 subdomains...
✅ NLO order placed on TMS 13
✅ NLO order placed on TMS 17
✅ NLO order placed on TMS 18
... (all 17 subdomains)
⏹️  Monitoring stopped
```

### Multiple Companies Simultaneously

If **both NLO and SYPNL** hit their targets on the same subdomain:
- Orders are placed for the **first matched company** (priority order: NLO → SYPNL → JHAPA → SWASTIK → SAIL)
- You can restart monitoring for the second company after first orders complete

## Configuration Examples

### Example 1: Monitor Only NLO

```javascript
const COMPANIES_TO_MONITOR = {
    'NLO': true,
    'SYPNL': false,
    'JHAPA': false,
    'SWASTIK': false,
    'SAIL': false
};
```

**Target**: 254.1

### Example 2: Monitor NLO + SYPNL

```javascript
const COMPANIES_TO_MONITOR = {
    'NLO': true,
    'SYPNL': true,
    'JHAPA': false,
    'SWASTIK': false,
    'SAIL': false
};
```

**Target**: 254.1 (lowest price)

### Example 3: Monitor All Companies

```javascript
const COMPANIES_TO_MONITOR = {
    'NLO': true,
    'SYPNL': true,
    'JHAPA': true,
    'SWASTIK': true,
    'SAIL': true
};
```

**Target**: 254.1 (lowest price)

### Example 4: Monitor Only High-Value Stocks

```javascript
const COMPANIES_TO_MONITOR = {
    'NLO': false,
    'SYPNL': false,
    'JHAPA': true,
    'SWASTIK': true,
    'SAIL': true
};
```

**Target**: 781.7 (SAIL - lowest of the three)

## Dashboard Features

### Real-time Company Tracking

Each subdomain shows:
- Current status (idle/checking/ordering)
- Company being checked `[NLO]`, `[SYPNL]`, etc.
- Current price vs target
- Last check timestamp

### Logs Show Company Info

```
💰 TMS 13 [NLO]: Price = 255.0 (Target: LTE 254.1)
💰 TMS 17 [SYPNL]: Price = 684.5 (Target: LTE 684.8)
🎯 PRICE MATCH on TMS 17 for SYPNL!
✅ Order placed on TMS 13 for SYPNL
```

## Advanced: Custom Target Prices

Edit `scripts/multi-company-price-check.js`:

```javascript
const TARGET_PRICES = {
    'NLO': 250.0,        // ← Change to your desired price
    'SYPNL': 680.0,      // ← Change to your desired price
    'JHAPA': 1070.0,
    'SWASTIK': 2320.0,
    'SAIL': 780.0
};
```

Remember to update the dashboard "Price Target" to the **lowest value** you set!

## Performance

### Monitoring 5 Companies

- **Per subdomain**: ~1-2 seconds (checks all 5 companies)
- **Full cycle (17 subdomains)**: ~20-30 seconds
- **Rate limit**: 2 requests/second (respected)

### Monitoring 1 Company

- **Per subdomain**: ~0.5 seconds
- **Full cycle (17 subdomains)**: ~8.5 seconds
- **Rate limit**: 2 requests/second (respected)

## Troubleshooting

### "Company not found"
- Ensure you're logged into the subdomain
- Check that `__securities__` exists in localStorage
- Verify the company symbol is correct (case-sensitive)

### Orders placing for wrong company
- Check the logs to see which company matched
- Verify `window.MATCHED_COMPANY` is set correctly
- Ensure your trading script (`upNLO`, `processScriptsSequentially`, etc.) is loaded

### Multiple companies matching at once
- The system places orders for the first match only
- Stop and restart monitoring for additional companies
- Or modify the script to handle multiple matches

### Slow monitoring
- Reduce number of monitored companies
- Each company adds ~0.2-0.4 seconds per subdomain check

## Tips

1. **Start with 1-2 companies** to test the system
2. **Monitor related stocks** with similar price movements
3. **Use different monitoring sessions** for very different target prices
4. **Check logs regularly** to see which companies are being checked
5. **Restart monitoring** after each order completion

## What's Next?

- ✅ System is ready for multi-company monitoring
- ✅ Configure which companies to monitor
- ✅ Set the lowest target price in dashboard
- ✅ Start monitoring and watch all companies!

Happy multi-company trading! 🚀📈💰
